import { describe, expect, it } from 'vitest'
import type { MailDataset } from '../../shared/domain'
import { fixtures } from '../../shared/fixtures'
import type { MutableMailRepository } from './mailRepository'
import {
  AccountDataRemovalError,
  AccountDataRemovalService,
  applyAccountDataRemoval
} from './accountDataRemoval'

class FakeMutableMailRepository implements MutableMailRepository {
  replacements = 0

  constructor(private dataset: MailDataset) {}

  initialize(): void {}
  seedIfEmpty(): boolean { return false }
  loadDataset(): MailDataset { return structuredClone(this.dataset) }
  replaceDataset(dataset: MailDataset): void {
    this.dataset = structuredClone(dataset)
    this.replacements += 1
  }
  close(): void {}
}

describe('account data removal projection', () => {
  it('removes account source mail and every topic touched by those sources', () => {
    const planned = applyAccountDataRemoval(fixtures, 'work')

    expect(planned.dataset.accounts.map((account) => account.id)).toEqual([
      'personal', 'freelance'
    ])
    expect(planned.dataset.messages.map((message) => message.id)).toEqual([
      'pulse-feedback', 'apartment-docs', 'acme-payment'
    ])
    expect(planned.dataset.topics.map((topic) => topic.id)).toEqual(['apartment', 'acme'])
    expect(planned.dataset.briefItems.map((item) => item.id)).toEqual([
      'brief-apartment', 'brief-acme'
    ])
    expect(planned.dataset.people.map((person) => person.id)).toEqual([
      'maya', 'ajay', 'neeraj'
    ])
    expect(planned.result.removed).toEqual({
      accounts: 1,
      messages: 3,
      topics: 1,
      briefItems: 2,
      people: 2
    })
  })

  it('preserves topics and people that have no source from the removed account', () => {
    const planned = applyAccountDataRemoval(fixtures, 'personal')

    expect(planned.dataset.topics.map((topic) => topic.id)).toEqual(['pulse', 'acme'])
    expect(planned.dataset.people.map((person) => person.id)).toEqual([
      'rahul', 'maya', 'neeraj', 'figma'
    ])
    expect(planned.dataset.messages.some((message) => message.accountId === 'personal')).toBe(false)
  })

  it('keeps the remaining cross-account source even when its derived topic is removed', () => {
    const planned = applyAccountDataRemoval(fixtures, 'work')

    expect(planned.dataset.messages.map((message) => message.id)).toContain('pulse-feedback')
    expect(planned.dataset.topics.map((topic) => topic.id)).not.toContain('pulse')
  })

  it('is idempotent when a crash retry repeats an already applied removal', () => {
    const repository = new FakeMutableMailRepository(structuredClone(fixtures))
    const service = new AccountDataRemovalService(repository)

    expect(service.run('personal')).toMatchObject({ accountFound: true, changed: true })
    expect(service.run('personal')).toMatchObject({ accountFound: false, changed: false })
    expect(repository.replacements).toBe(1)
  })

  it('rejects an invalid account identifier before reading or writing storage', () => {
    const repository = new FakeMutableMailRepository(structuredClone(fixtures))
    const service = new AccountDataRemovalService(repository)

    expect(() => service.run('../other-account')).toThrowError(
      expect.objectContaining<Partial<AccountDataRemovalError>>({ code: 'INVALID_ACCOUNT_ID' })
    )
    expect(repository.replacements).toBe(0)
  })
})
