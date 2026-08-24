import type { MailDataset } from '../../shared/domain'
import { isAccountId } from './accountState'
import type { MutableMailRepository } from './mailRepository'
import { retainReferencedPeople } from './mailDatasetProjection'

export interface AccountDataRemovalResult {
  accountId: string
  accountFound: boolean
  changed: boolean
  removed: {
    accounts: number
    messages: number
    topics: number
    briefItems: number
    people: number
  }
}

export class AccountDataRemovalError extends Error {
  readonly code: 'INVALID_ACCOUNT_ID'

  constructor() {
    super('The account identifier is invalid.')
    this.name = 'AccountDataRemovalError'
    this.code = 'INVALID_ACCOUNT_ID'
  }
}

export const applyAccountDataRemoval = (
  dataset: MailDataset,
  accountId: string
): { dataset: MailDataset; result: AccountDataRemovalResult } => {
  if (!isAccountId(accountId)) throw new AccountDataRemovalError()
  const accountFound = dataset.accounts.some((account) => account.id === accountId)
  const emptyRemoved = { accounts: 0, messages: 0, topics: 0, briefItems: 0, people: 0 }
  if (!accountFound) {
    return {
      dataset,
      result: { accountId, accountFound: false, changed: false, removed: emptyRemoved }
    }
  }

  const retainedAccounts = dataset.accounts.filter((account) => account.id !== accountId)
  const retainedMessages = dataset.messages.filter((message) => message.accountId !== accountId)
  const retainedMessageIds = new Set(retainedMessages.map((message) => message.id))
  const retainedTopics = dataset.topics.filter((topic) =>
    topic.messageIds.every((messageId) => retainedMessageIds.has(messageId)) &&
    topic.events.every((event) => retainedMessageIds.has(event.citationMessageId)))
  const retainedTopicIds = new Set(retainedTopics.map((topic) => topic.id))
  const retainedBriefItems = dataset.briefItems.filter((item) =>
    item.accountId !== accountId &&
    retainedTopicIds.has(item.topicId) &&
    item.citationMessageIds.every((messageId) => retainedMessageIds.has(messageId)))
  const retainedPeople = retainReferencedPeople(dataset.people, retainedMessages, retainedTopics)

  const nextDataset: MailDataset = {
    accounts: retainedAccounts,
    people: retainedPeople,
    messages: retainedMessages,
    topics: retainedTopics,
    briefItems: retainedBriefItems
  }
  return {
    dataset: nextDataset,
    result: {
      accountId,
      accountFound: true,
      changed: true,
      removed: {
        accounts: dataset.accounts.length - retainedAccounts.length,
        messages: dataset.messages.length - retainedMessages.length,
        topics: dataset.topics.length - retainedTopics.length,
        briefItems: dataset.briefItems.length - retainedBriefItems.length,
        people: dataset.people.length - retainedPeople.length
      }
    }
  }
}

export class AccountDataRemovalService {
  constructor(private readonly repository: MutableMailRepository) {}

  run(accountId: string): AccountDataRemovalResult {
    if (!isAccountId(accountId)) throw new AccountDataRemovalError()
    const planned = applyAccountDataRemoval(this.repository.loadDataset(), accountId)
    if (planned.result.changed) this.repository.replaceDataset(planned.dataset)
    return planned.result
  }
}
