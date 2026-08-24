import type {
  AppErrorCodeV1,
  AppErrorV1,
  AppSnapshotV1,
  LoadSnapshotRequestV1,
  LoadSnapshotResponseV1
} from './contracts'
import { POSITA_PROTOCOL_VERSION } from './contracts'
import type {
  Account,
  BriefItem,
  MailDataset,
  Message,
  Person,
  TimelineEvent,
  Topic
} from './domain'

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

const isString = (value: unknown): value is string => typeof value === 'string'
const absoluteTimestampPattern = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/
export const isAbsoluteTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && absoluteTimestampPattern.test(value) &&
  Number.isFinite(Date.parse(value))
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString)

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T)

const isAccount = (value: unknown): value is Account =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.label) &&
  isString(value.address) &&
  isOneOf(value.tone, ['sage', 'blue', 'sand'])

const isPerson = (value: unknown): value is Person =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.initials) &&
  isString(value.role) &&
  isString(value.email)

const isMessage = (value: unknown): value is Message =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.threadId) &&
  isString(value.accountId) &&
  isString(value.senderId) &&
  isString(value.subject) &&
  isString(value.preview) &&
  isString(value.body) &&
  isString(value.receivedAt) &&
  (value.receivedAtIso === undefined || isAbsoluteTimestamp(value.receivedAtIso)) &&
  isBoolean(value.isRead)

const isTimelineEvent = (value: unknown): value is TimelineEvent =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.dateLabel) &&
  isString(value.description) &&
  isString(value.citationMessageId)

const isTopic = (value: unknown): value is Topic =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.eyebrow) &&
  isString(value.summary) &&
  isOneOf(value.status, ['needs-user', 'waiting', 'active']) &&
  isOneOf(value.priority, ['high', 'medium', 'low']) &&
  isStringArray(value.participantIds) &&
  isStringArray(value.messageIds) &&
  Array.isArray(value.events) &&
  value.events.every(isTimelineEvent) &&
  isString(value.nextStep)

const isBriefItem = (value: unknown): value is BriefItem =>
  isRecord(value) &&
  isString(value.id) &&
  isOneOf(value.section, ['needs-you', 'waiting', 'worth-knowing']) &&
  isString(value.topicId) &&
  isString(value.title) &&
  isString(value.detail) &&
  isString(value.reason) &&
  isString(value.accountId) &&
  isStringArray(value.citationMessageIds) &&
  (value.dueLabel === undefined || isString(value.dueLabel))

const uniqueIds = (values: readonly { id: string }[]): Set<string> | null => {
  const ids = new Set(values.map((value) => value.id))
  return ids.size === values.length ? ids : null
}

export const isMailDataset = (value: unknown): value is MailDataset => {
  if (!isRecord(value) ||
      !Array.isArray(value.accounts) || !value.accounts.every(isAccount) ||
      !Array.isArray(value.people) || !value.people.every(isPerson) ||
      !Array.isArray(value.messages) || !value.messages.every(isMessage) ||
      !Array.isArray(value.topics) || !value.topics.every(isTopic) ||
      !Array.isArray(value.briefItems) || !value.briefItems.every(isBriefItem)) {
    return false
  }

  const accountIds = uniqueIds(value.accounts)
  const personIds = uniqueIds(value.people)
  const messageIds = uniqueIds(value.messages)
  const topicIds = uniqueIds(value.topics)
  const briefIds = uniqueIds(value.briefItems)
  if (!accountIds || !personIds || !messageIds || !topicIds || !briefIds) return false

  if (!value.messages.every((message) =>
    accountIds.has(message.accountId) && personIds.has(message.senderId))) return false

  if (!value.topics.every((topic) =>
    topic.participantIds.every((id) => personIds.has(id)) &&
    topic.messageIds.every((id) => messageIds.has(id)) &&
    topic.events.every((event) => messageIds.has(event.citationMessageId)))) return false

  return value.briefItems.every((item) =>
    topicIds.has(item.topicId) &&
    accountIds.has(item.accountId) &&
    item.citationMessageIds.every((id) => messageIds.has(id)))
}

export const isLoadSnapshotRequest = (value: unknown): value is LoadSnapshotRequestV1 =>
  isRecord(value) &&
  hasOnlyKeys(value, ['version']) &&
  value.version === POSITA_PROTOCOL_VERSION

const errorCodes: readonly AppErrorCodeV1[] = [
  'INVALID_REQUEST',
  'UNTRUSTED_SENDER',
  'DATABASE_UNAVAILABLE',
  'PROTOCOL_ERROR'
]

export const isAppError = (value: unknown): value is AppErrorV1 =>
  isRecord(value) &&
  value.version === POSITA_PROTOCOL_VERSION &&
  isOneOf(value.code, errorCodes) &&
  isString(value.message) &&
  isBoolean(value.retryable)

export const isAppSnapshot = (value: unknown): value is AppSnapshotV1 =>
  isRecord(value) &&
  value.version === POSITA_PROTOCOL_VERSION &&
  value.dataMode === 'fixture-seeded' &&
  isString(value.loadedAt) &&
  Number.isFinite(Date.parse(value.loadedAt)) &&
  isMailDataset(value.dataset)

export const isLoadSnapshotResponse = (value: unknown): value is LoadSnapshotResponseV1 => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok
    ? hasOnlyKeys(value, ['ok', 'value']) && isAppSnapshot(value.value)
    : hasOnlyKeys(value, ['ok', 'error']) && isAppError(value.error)
}
