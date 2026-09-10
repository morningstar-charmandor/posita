import {
  SYNC_BATCH_SIZE,
  isProviderMailBatchRequestV1,
  isProviderMailBatchV2,
  type ProviderMailAdapter,
  type ProviderMailBatchRequestV1,
  type ProviderMailBatchV2
} from '../../application/mailSync'
import { MAX_SECRET_LENGTH } from '../../application/secretVault'
import {
  observeProviderMailSyncStage,
  silentProviderMailSyncStageReporter,
  type ProviderMailSyncStageReporter
} from '../../application/providerMailSyncDiagnostics'
import type { ProviderMailThreadV1 } from '../../../shared/providerMail'
import {
  googleExternalTextBodyIds,
  normalizeGoogleMessage,
  type NormalizedGoogleMessage
} from './googleMailNormalizer'
import {
  GoogleAccessTokenError,
  type GoogleAccessTokenSource
} from './googleOAuthAccessTokenSource'
import {
  getGoogleMailJson,
  googleMailFailure as failure,
  GoogleMissingMessageError,
  type GoogleMailFetch,
  type NotFoundMeaning
} from './googleMailHttp'
import { GoogleMessageBatchStageTracker } from './googleMessageBatchDiagnostics'
import {
  GoogleMailRequestPacer,
  type GoogleMailReadMethod,
  type GoogleMailPacingRuntime
} from './googleMailRequestPacer'
export type { GoogleMailFetch } from './googleMailHttp'

const MAX_LIST_RESPONSE_BYTES = 512 * 1024
const MAX_MESSAGE_RESPONSE_BYTES = 2_800_000
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_PARALLEL_MESSAGE_READS = 4

type JsonRecord = Record<string, unknown>

type GoogleCursor =
  | { version: 1; mode: 'full'; receivedAfter: string; pageToken: string; historyId: string }
  | { version: 1; mode: 'history'; historyId: string; pageToken?: string; offset?: number }

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

const safeString = (value: unknown, maximum = 16_384): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum

const safeProviderId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\u0021-\u007E]{1,512}$/.test(value)

const encodeCursor = (cursor: GoogleCursor): string =>
  `gmail-v1.${Buffer.from(JSON.stringify(cursor)).toString('base64url')}`

const decodeCursor = (value: string): GoogleCursor | undefined => {
  if (!value.startsWith('gmail-v1.') || value.length > 16_384) return undefined
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value.slice(9), 'base64url').toString('utf8'))
    if (!isRecord(decoded) || decoded.version !== 1 ||
        (decoded.mode !== 'full' && decoded.mode !== 'history') ||
        !safeString(decoded.historyId) || !/^\d+$/.test(decoded.historyId)) return undefined
    if (decoded.mode === 'full') {
      return hasOnlyKeys(decoded, [
        'version', 'mode', 'receivedAfter', 'pageToken', 'historyId'
      ]) && safeString(decoded.receivedAfter, 64) && Number.isFinite(Date.parse(decoded.receivedAfter)) &&
        safeString(decoded.pageToken)
        ? {
          version: 1,
          mode: 'full',
          receivedAfter: decoded.receivedAfter,
          pageToken: decoded.pageToken,
          historyId: decoded.historyId
        }
        : undefined
    }
    const pageTokenKey = decoded.pageToken === undefined ? [] : ['pageToken']
    const offsetKey = decoded.offset === undefined ? [] : ['offset']
    const keys = ['version', 'mode', 'historyId', ...pageTokenKey, ...offsetKey]
    return hasOnlyKeys(decoded, keys) &&
      (decoded.pageToken === undefined || safeString(decoded.pageToken)) &&
      (decoded.offset === undefined || (Number.isSafeInteger(decoded.offset) &&
        (decoded.offset as number) > 0 && (decoded.offset as number) <= 5_000))
      ? {
        version: 1,
        mode: 'history',
        historyId: decoded.historyId,
        ...(decoded.pageToken === undefined ? {} : { pageToken: decoded.pageToken }),
        ...(decoded.offset === undefined ? {} : { offset: decoded.offset as number })
      }
      : undefined
  } catch {
    return undefined
  }
}

export class GoogleMailReadAdapter implements ProviderMailAdapter {
  private readonly pacing: GoogleMailRequestPacer

  constructor(
    private readonly tokens: GoogleAccessTokenSource,
    private readonly fetchRequest: GoogleMailFetch = (url, init) => fetch(url, init),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly syncStages: ProviderMailSyncStageReporter = silentProviderMailSyncStageReporter,
    pacingRuntime?: GoogleMailPacingRuntime
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
      throw failure('MALFORMED_PAYLOAD', false)
    }
    this.pacing = new GoogleMailRequestPacer(pacingRuntime)
  }

  async fetchBatch(request: ProviderMailBatchRequestV1, signal: AbortSignal): Promise<unknown> {
    if (!isProviderMailBatchRequestV1(request)) throw failure('MALFORMED_PAYLOAD', false)
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    let token: string | undefined
    try {
      token = await this.tokens.getAccessToken(request.accountId, signal)
    } catch (error) {
      if (signal.aborted) throw error
      if (error instanceof GoogleAccessTokenError) {
        if (error.code === 'ACCESS_TOKEN_AUTHORIZATION_EXPIRED') {
          throw failure('AUTHENTICATION_EXPIRED', false)
        }
        throw failure('PROVIDER_UNAVAILABLE', error.retryable)
      }
      throw failure('PROVIDER_UNAVAILABLE', true)
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (token === undefined) throw failure('AUTHENTICATION_EXPIRED', false)
    if (token.length === 0 || token.length > MAX_SECRET_LENGTH) {
      throw failure('AUTHENTICATION_EXPIRED', false)
    }
    const cursor = request.cursor === undefined ? undefined : decodeCursor(request.cursor)
    if (request.cursor !== undefined && cursor === undefined) throw failure('INVALID_CURSOR', true)
    return cursor?.mode === 'history'
      ? this.fetchHistory(request, cursor, token, signal)
      : this.fetchFull(request, cursor, token, signal)
  }

  private async fetchFull(
    request: ProviderMailBatchRequestV1,
    cursor: Extract<GoogleCursor, { mode: 'full' }> | undefined,
    token: string,
    signal: AbortSignal
  ): Promise<ProviderMailBatchV2> {
    const receivedAfter = cursor?.receivedAfter ?? request.receivedAfter
    if (receivedAfter === undefined) throw failure('INVALID_CURSOR', true)
    let historyId = cursor?.historyId
    if (historyId === undefined) {
      const profile = await observeProviderMailSyncStage(
        this.syncStages,
        request.accountId,
        'gmail-profile',
        () => this.getJson('profile', '/gmail/v1/users/me/profile', token, signal, MAX_LIST_RESPONSE_BYTES)
      )
      historyId = isRecord(profile) && safeString(profile.historyId) && /^\d+$/.test(profile.historyId)
        ? profile.historyId
        : undefined
      if (historyId === undefined) throw failure('MALFORMED_PAYLOAD', false)
    }
    const query = new URLSearchParams({
      maxResults: String(SYNC_BATCH_SIZE),
      q: `after:${Math.floor(Date.parse(receivedAfter) / 1000)}`,
      includeSpamTrash: 'false',
      ...(cursor === undefined ? {} : { pageToken: cursor.pageToken })
    })
    const listed = await observeProviderMailSyncStage(
      this.syncStages,
      request.accountId,
      'gmail-list',
      () => this.getJson(
        'list',
        `/gmail/v1/users/me/messages?${query}`,
        token,
        signal,
        MAX_LIST_RESPONSE_BYTES
      )
    )
    if (!isRecord(listed) || (listed.messages !== undefined && !Array.isArray(listed.messages)) ||
        (listed.nextPageToken !== undefined && !safeString(listed.nextPageToken))) {
      throw failure('MALFORMED_PAYLOAD', false)
    }
    const ids = (listed.messages ?? []).map((item) =>
      isRecord(item) && safeProviderId(item.id) ? item.id : undefined)
    if (ids.length > SYNC_BATCH_SIZE || ids.some((id) => id === undefined) ||
        new Set(ids).size !== ids.length) {
      throw failure('MALFORMED_PAYLOAD', false)
    }
    const { loaded: normalized, missing } = await observeProviderMailSyncStage(
      this.syncStages,
      request.accountId,
      'gmail-message-batch',
      () => this.loadMessagesAllowMissing(ids as string[], request.accountId, token, signal)
    )
    const nextCursor = listed.nextPageToken === undefined
      ? encodeCursor({ version: 1, mode: 'history', historyId })
      : encodeCursor({
        version: 1,
        mode: 'full',
        receivedAfter,
        pageToken: listed.nextPageToken,
        historyId
      })
    return this.batch(request, normalized, missing, nextCursor, listed.nextPageToken === undefined)
  }

  private async fetchHistory(
    request: ProviderMailBatchRequestV1,
    cursor: Extract<GoogleCursor, { mode: 'history' }>,
    token: string,
    signal: AbortSignal
  ): Promise<ProviderMailBatchV2> {
    const query = new URLSearchParams({
      startHistoryId: cursor.historyId,
      maxResults: String(SYNC_BATCH_SIZE),
      ...(cursor.pageToken === undefined ? {} : { pageToken: cursor.pageToken })
    })
    const history = await observeProviderMailSyncStage(
      this.syncStages,
      request.accountId,
      'gmail-list',
      () => this.getJson(
        'history',
        `/gmail/v1/users/me/history?${query}`,
        token,
        signal,
        MAX_LIST_RESPONSE_BYTES,
        'invalid-cursor'
      )
    )
    if (!isRecord(history) || !safeString(history.historyId) || !/^\d+$/.test(history.historyId) ||
        (history.history !== undefined && !Array.isArray(history.history)) ||
        (history.nextPageToken !== undefined && !safeString(history.nextPageToken))) {
      throw failure('MALFORMED_PAYLOAD', false)
    }
    const states = new Map<string, 'load' | 'delete'>()
    for (const record of history.history ?? []) {
      if (!isRecord(record)) throw failure('MALFORMED_PAYLOAD', false)
      for (const [field, state] of [
        ['messagesAdded', 'load'], ['labelsAdded', 'load'], ['labelsRemoved', 'load'],
        ['messagesDeleted', 'delete']
      ] as const) {
        if (record[field] === undefined) continue
        if (!Array.isArray(record[field])) throw failure('MALFORMED_PAYLOAD', false)
        for (const event of record[field]) {
          const id = isRecord(event) && isRecord(event.message) && safeProviderId(event.message.id)
            ? event.message.id
            : undefined
          if (id === undefined) throw failure('MALFORMED_PAYLOAD', false)
          states.set(id, state)
        }
      }
    }
    if (states.size > 5_000) throw failure('MALFORMED_PAYLOAD', false)
    const offset = cursor.offset ?? 0
    const changes = [...states]
    if (offset > changes.length) throw failure('INVALID_CURSOR', true)
    const selected = changes.slice(offset, offset + SYNC_BATCH_SIZE)
    const loadIds = selected.flatMap(([id, state]) => state === 'load' ? [id] : [])
    const deleted = selected.flatMap(([id, state]) => state === 'delete' ? [id] : [])
    const { loaded, missing } = await observeProviderMailSyncStage(
      this.syncStages,
      request.accountId,
      'gmail-message-batch',
      () => this.loadMessagesAllowMissing(loadIds, request.accountId, token, signal)
    )
    const nextOffset = offset + selected.length
    const hasMoreInPage = nextOffset < changes.length
    const complete = !hasMoreInPage && history.nextPageToken === undefined
    const nextCursor = hasMoreInPage
      ? encodeCursor({
        version: 1,
        mode: 'history',
        historyId: cursor.historyId,
        ...(cursor.pageToken === undefined ? {} : { pageToken: cursor.pageToken }),
        offset: nextOffset
      })
      : encodeCursor({
        version: 1,
        mode: 'history',
        historyId: complete ? history.historyId : cursor.historyId,
        ...(complete ? {} : { pageToken: history.nextPageToken })
      })
    return this.batch(request, loaded, [...deleted, ...missing], nextCursor, complete)
  }

  private batch(
    request: ProviderMailBatchRequestV1,
    normalized: NormalizedGoogleMessage[],
    deletedProviderMessageIds: string[],
    nextCursor: string,
    complete: boolean
  ): ProviderMailBatchV2 {
    const threads = new Map<string, ProviderMailThreadV1>()
    for (const item of normalized) {
      const existing = threads.get(item.thread.providerThreadId)
      threads.set(item.thread.providerThreadId, existing === undefined
        ? item.thread
        : { ...existing, messageIds: [...existing.messageIds, item.message.id] })
    }
    const batch: ProviderMailBatchV2 = {
      version: 2,
      accountId: request.accountId,
      provider: 'google',
      messages: normalized.map((item) => item.message),
      threads: [...threads.values()],
      deletedProviderMessageIds: [...new Set(deletedProviderMessageIds)],
      nextCursor,
      complete
    }
    if (!isProviderMailBatchV2(batch)) throw failure('MALFORMED_PAYLOAD', false)
    return batch
  }

  private async loadMessagesAllowMissing(
    ids: string[], accountId: string, token: string, signal: AbortSignal
  ): Promise<{ loaded: NormalizedGoogleMessage[]; missing: string[] }> {
    const loaded: NormalizedGoogleMessage[] = []
    const missing: string[] = []
    const stages = new GoogleMessageBatchStageTracker(this.syncStages, accountId)
    for (let offset = 0; offset < ids.length; offset += MAX_PARALLEL_MESSAGE_READS) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const group = ids.slice(offset, offset + MAX_PARALLEL_MESSAGE_READS)
      stages.startRetrieval()
      let values: Array<GoogleMessageRead | undefined>
      try {
        const groupController = new AbortController()
        const groupSignal = AbortSignal.any([signal, groupController.signal])
        let firstFailure: { error: unknown } | undefined
        const outcomes = await Promise.allSettled(group.map(async (id) => {
          try {
            return await this.readMessageAllowMissing(id, token, groupSignal, stages)
          } catch (error) {
            firstFailure ??= { error }
            groupController.abort()
            throw error
          }
        }))
        if (firstFailure !== undefined) throw firstFailure.error
        values = outcomes.map((outcome) => {
          if (outcome.status === 'rejected') throw outcome.reason
          return outcome.value
        })
      } catch (error) {
        stages.failRetrieval()
        throw error
      }
      const present = values.filter((value): value is GoogleMessageRead => value !== undefined)
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (present.length > 0) stages.startNormalization()
      try {
        for (const value of present) {
          const normalized = normalizeGoogleMessage(
            value.payload,
            accountId,
            value.externalBodies,
            (stage) => stages.failure(stage)
          )
          if (normalized === undefined ||
              normalized.message.source.providerMessageId !== value.providerMessageId) {
            if (normalized !== undefined) stages.failure('gmail-message-identity')
            throw failure('MALFORMED_PAYLOAD', false)
          }
          loaded.push(normalized)
        }
      } catch (error) {
        stages.failNormalization()
        throw error
      }
      values.forEach((value, index) => {
        if (value === undefined) missing.push(group[index]!)
      })
    }
    stages.complete()
    return { loaded, missing }
  }

  private async readMessageAllowMissing(
    id: string,
    token: string,
    signal: AbortSignal,
    stages: GoogleMessageBatchStageTracker
  ): Promise<GoogleMessageRead | undefined> {
    try {
      const payload = await this.getJson(
        'message',
        `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
        token,
        signal,
        MAX_MESSAGE_RESPONSE_BYTES,
        'missing-message',
        stages
      )
      const textBodyIds = googleExternalTextBodyIds(payload)
      if (textBodyIds.length > 16) {
        stages.failure('gmail-message-external-body')
        throw failure('MALFORMED_PAYLOAD', false)
      }
      const externalBodies = new Map<string, string>()
      for (const attachmentId of textBodyIds) {
        let attachment: unknown
        try {
          attachment = await this.getJson(
            'externalText',
            `/gmail/v1/users/me/messages/${encodeURIComponent(id)}/attachments/${
              encodeURIComponent(attachmentId)}`,
            token,
            signal,
            MAX_MESSAGE_RESPONSE_BYTES,
            'provider-failure',
            stages
          )
        } catch (error) {
          if (!signal.aborted) stages.failure('gmail-message-external-body')
          throw error
        }
        if (!isRecord(attachment) || typeof attachment.data !== 'string' ||
            attachment.data.length > 2_700_000) {
          stages.failure('gmail-message-external-body')
          throw failure('MALFORMED_PAYLOAD', false)
        }
        externalBodies.set(attachmentId, attachment.data)
      }
      return { providerMessageId: id, payload, externalBodies }
    } catch (error) {
      if (error instanceof GoogleMissingMessageError) return undefined
      throw error
    }
  }

  private async getJson(
    method: GoogleMailReadMethod,
    path: string,
    token: string,
    signal: AbortSignal,
    maximumBytes: number,
    notFoundMeaning: NotFoundMeaning = 'provider-failure',
    stages?: GoogleMessageBatchStageTracker
  ): Promise<unknown> {
    await this.pacing.acquire(method, signal)
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    // Deliberate pacing is inside the attempt deadline but outside the HTTP deadline.
    return getGoogleMailJson(this.fetchRequest, path, token, signal, maximumBytes,
      this.timeoutMs, notFoundMeaning, (stage) => stages?.failure(stage))
  }
}

interface GoogleMessageRead {
  providerMessageId: string
  payload: unknown
  externalBodies: ReadonlyMap<string, string>
}
