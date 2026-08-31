import { isDeepStrictEqual } from 'node:util'
import type { MailDataset } from '../../shared/domain'
import { isAbsoluteTimestamp } from '../../shared/validation'
import type { MutableMailRepository } from './mailRepository'
import { retainReferencedPeople } from './mailDatasetProjection'
import type { StorageSanitizer } from './storageSanitizer'
import {
  PRIVATE_ALPHA_RETENTION_DAYS,
  RetentionError,
  retentionCutoffTime,
  type RetentionResult
} from './retentionPolicy'

export {
  PRIVATE_ALPHA_RETENTION_DAYS,
  RetentionError,
  type RetentionResult
} from './retentionPolicy'

export interface FixtureRetentionCompatibilityResult {
  changed: boolean
  restoredTimestamps: number
}

const withoutSourceTimestamps = (dataset: MailDataset): MailDataset => ({
  ...dataset,
  messages: dataset.messages.map(({ receivedAtIso: _receivedAtIso, ...message }) => message)
})

export const planFixtureRetentionCompatibility = (
  dataset: MailDataset,
  currentFixtures: MailDataset
): { dataset: MailDataset; result: FixtureRetentionCompatibilityResult } => {
  if (!currentFixtures.messages.every((message) =>
    message.receivedAtIso !== undefined && isAbsoluteTimestamp(message.receivedAtIso))) {
    throw new RetentionError(
      'RETENTION_FIXTURE_REFERENCE_INVALID',
      'The current fixture reference does not contain valid absolute source timestamps.'
    )
  }

  if (dataset.messages.every((message) =>
    message.receivedAtIso !== undefined && isAbsoluteTimestamp(message.receivedAtIso))) {
    return {
      dataset,
      result: { changed: false, restoredTimestamps: 0 }
    }
  }

  const isRecognizedLegacyFixture =
    dataset.messages.length > 0 &&
    dataset.messages.every((message) => message.receivedAtIso === undefined) &&
    isDeepStrictEqual(
      withoutSourceTimestamps(dataset),
      withoutSourceTimestamps(currentFixtures)
    )

  if (!isRecognizedLegacyFixture) {
    throw new RetentionError(
      'RETENTION_COMPATIBILITY_UNRECOGNIZED',
      'A cache without complete retention timestamps is not a recognized fixture dataset.'
    )
  }

  return {
    dataset: structuredClone(currentFixtures),
    result: {
      changed: true,
      restoredTimestamps: currentFixtures.messages.length
    }
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
  const cutoffTime = retentionCutoffTime(now, retentionDays)
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
  constructor(
    private readonly repository: MutableMailRepository,
    private readonly storageSanitizer: StorageSanitizer
  ) {}

  async ensureFixtureCompatibility(
    currentFixtures: MailDataset
  ): Promise<FixtureRetentionCompatibilityResult> {
    const planned = planFixtureRetentionCompatibility(
      this.repository.loadDataset(),
      currentFixtures
    )
    if (planned.result.changed) {
      this.repository.replaceDataset(planned.dataset)
      await this.storageSanitizer.sanitize()
    }
    return planned.result
  }

  async run(now: Date): Promise<RetentionResult> {
    const planned = applyRetentionPolicy(this.repository.loadDataset(), now)
    if (planned.result.changed) {
      this.repository.replaceDataset(planned.dataset)
      await this.storageSanitizer.sanitize()
    }
    return planned.result
  }
}
