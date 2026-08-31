import type {
  ProviderMailMessageV1,
  ProviderMailThreadV1
} from '../../shared/providerMail.ts'
import {
  PRIVATE_ALPHA_RETENTION_DAYS,
  RetentionError,
  isRetentionTimestamp,
  retentionCutoffTime,
  type RetentionResult
} from './retentionPolicy.ts'

export interface ProviderMailRetentionResult {
  cutoffAt: string
  changed: boolean
  removedMessages: number
  removedThreads: number
  updatedThreads: number
}

export const applyProviderMailRetentionPolicy = (
  messages: readonly ProviderMailMessageV1[],
  threads: readonly ProviderMailThreadV1[],
  now: Date,
  retentionDays = PRIVATE_ALPHA_RETENTION_DAYS
): {
  messages: ProviderMailMessageV1[]
  threads: ProviderMailThreadV1[]
  result: ProviderMailRetentionResult
} => {
  const cutoffTime = retentionCutoffTime(now, retentionDays)
  const expiredMessageIds = new Set(messages.filter((message) => {
    const receivedAt = Date.parse(message.receivedAt)
    if (!isRetentionTimestamp(message.receivedAt) || !Number.isFinite(receivedAt)) {
      throw new RetentionError('RETENTION_TIMESTAMP_INVALID', 'Retention source timestamp is invalid.')
    }
    return receivedAt < cutoffTime
  }).map((message) => message.id))
  const retainedMessages = messages.filter((message) => !expiredMessageIds.has(message.id))
  let removedThreads = 0
  let updatedThreads = 0
  const retainedThreads: ProviderMailThreadV1[] = []

  for (const thread of threads) {
    const messageIds = thread.messageIds.filter((id) => !expiredMessageIds.has(id))
    if (messageIds.length === 0) {
      removedThreads += 1
    } else if (messageIds.length !== thread.messageIds.length) {
      retainedThreads.push({ ...thread, messageIds })
      updatedThreads += 1
    } else {
      retainedThreads.push(thread)
    }
  }

  const result = {
    cutoffAt: new Date(cutoffTime).toISOString(),
    changed: expiredMessageIds.size > 0,
    removedMessages: expiredMessageIds.size,
    removedThreads,
    updatedThreads
  }
  return { messages: retainedMessages, threads: retainedThreads, result }
}

export const includeProviderMailRetention = (
  fixtureResult: RetentionResult,
  providerResult: ProviderMailRetentionResult
): RetentionResult => ({
  ...fixtureResult,
  changed: fixtureResult.changed || providerResult.changed,
  removed: {
    ...fixtureResult.removed,
    messages: fixtureResult.removed.messages + providerResult.removedMessages
  }
})
