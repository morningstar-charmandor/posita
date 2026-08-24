import type { MailDataset } from '../../shared/domain'
import { isAbsoluteTimestamp } from '../../shared/validation'
import type { MutableMailRepository } from './mailRepository'
import { retainReferencedPeople } from './mailDatasetProjection'

export const PRIVATE_ALPHA_RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

export interface RetentionResult {
  cutoffAt: string
  changed: boolean
  removed: {
    messages: number
    topics: number
    briefItems: number
    people: number
  }
}

export class RetentionError extends Error {
  readonly code: 'RETENTION_CLOCK_INVALID' | 'RETENTION_TIMESTAMP_MISSING' |
    'RETENTION_TIMESTAMP_INVALID'

  constructor(code: RetentionError['code'], message: string) {
    super(message)
    this.name = 'RetentionError'
    this.code = code
  }
}

const timestampFor = (value: string | undefined): number => {
  if (value === undefined) {
    throw new RetentionError(
      'RETENTION_TIMESTAMP_MISSING',
      'Retention requires an absolute source timestamp for every message.'
    )
  }
  const timestamp = Date.parse(value)
  if (!isAbsoluteTimestamp(value) || !Number.isFinite(timestamp)) {
    throw new RetentionError(
      'RETENTION_TIMESTAMP_INVALID',
      'Retention source timestamp is invalid.'
    )
  }
  return timestamp
}

export const applyRetentionPolicy = (
  dataset: MailDataset,
  now: Date,
  retentionDays = PRIVATE_ALPHA_RETENTION_DAYS
): { dataset: MailDataset; result: RetentionResult } => {
  const nowTime = now.getTime()
  if (!Number.isFinite(nowTime) || !Number.isSafeInteger(retentionDays) || retentionDays < 1) {
    throw new RetentionError('RETENTION_CLOCK_INVALID', 'Retention clock or window is invalid.')
  }
  const cutoffTime = nowTime - retentionDays * DAY_MS
  const retainedMessages = dataset.messages.filter((message) =>
    timestampFor(message.receivedAtIso) >= cutoffTime)
  const retainedMessageIds = new Set(retainedMessages.map((message) => message.id))

  const retainedTopics = dataset.topics.filter((topic) =>
    topic.messageIds.length > 0 &&
    topic.messageIds.every((id) => retainedMessageIds.has(id)) &&
    topic.events.every((event) => retainedMessageIds.has(event.citationMessageId)))
  const retainedTopicIds = new Set(retainedTopics.map((topic) => topic.id))

  const retainedBriefItems = dataset.briefItems.filter((item) =>
    retainedTopicIds.has(item.topicId) &&
    item.citationMessageIds.length > 0 &&
    item.citationMessageIds.every((id) => retainedMessageIds.has(id)))

  const retainedPeople = retainReferencedPeople(dataset.people, retainedMessages, retainedTopics)

  const nextDataset: MailDataset = {
    accounts: dataset.accounts,
    people: retainedPeople,
    messages: retainedMessages,
    topics: retainedTopics,
    briefItems: retainedBriefItems
  }
  const removed = {
    messages: dataset.messages.length - retainedMessages.length,
    topics: dataset.topics.length - retainedTopics.length,
    briefItems: dataset.briefItems.length - retainedBriefItems.length,
    people: dataset.people.length - retainedPeople.length
  }
  return {
    dataset: nextDataset,
    result: {
      cutoffAt: new Date(cutoffTime).toISOString(),
      changed: Object.values(removed).some((count) => count > 0),
      removed
    }
  }
}

export class RetentionMaintenanceService {
  constructor(private readonly repository: MutableMailRepository) {}

  run(now: Date): RetentionResult {
    const planned = applyRetentionPolicy(this.repository.loadDataset(), now)
    if (planned.result.changed) this.repository.replaceDataset(planned.dataset)
    return planned.result
  }
}
