import { describe, expect, it } from 'vitest'
import { fixtures } from '../../shared/fixtures'
import type { MailDataset } from '../../shared/domain'
import type { MutableMailRepository } from './mailRepository'
import type { StorageSanitizer } from './storageSanitizer'
import {
  applyRetentionPolicy,
  planFixtureRetentionCompatibility,
  RetentionError,
  RetentionMaintenanceService
} from './retentionMaintenance'

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
  deleteAllRecords(): void {}
  destroyEncryptionContext(): void {}
  close(): void {}
}

class FakeStorageSanitizer implements StorageSanitizer {
  calls = 0
  async sanitize(): Promise<void> { this.calls += 1 }
}

const now = new Date('2026-08-24T12:00:00.000Z')

describe('legacy fixture retention compatibility', () => {
  const withoutTimestamps = (): MailDataset => {
    const dataset = structuredClone(fixtures)
    for (const message of dataset.messages) delete message.receivedAtIso
    return dataset
  }

  it('replaces only the exact historical fixture dataset with current timestamped fixtures', async () => {
    const repository = new FakeMutableMailRepository(withoutTimestamps())
    const sanitizer = new FakeStorageSanitizer()
    const service = new RetentionMaintenanceService(repository, sanitizer)

    await expect(service.ensureFixtureCompatibility(fixtures)).resolves.toEqual({
      changed: true,
      restoredTimestamps: fixtures.messages.length
    })
    expect(repository.loadDataset()).toEqual(fixtures)
    expect(repository.replacements).toBe(1)
    expect(sanitizer.calls).toBe(1)
  })

  it('leaves a timestamp-complete dataset unchanged', async () => {
    const repository = new FakeMutableMailRepository(structuredClone(fixtures))
    const sanitizer = new FakeStorageSanitizer()
    const service = new RetentionMaintenanceService(repository, sanitizer)

    await expect(service.ensureFixtureCompatibility(fixtures)).resolves.toEqual({
      changed: false,
      restoredTimestamps: 0
    })
    expect(repository.replacements).toBe(0)
    expect(sanitizer.calls).toBe(0)
  })

  it('fails before mutation for mixed or edited timestamp-free caches', async () => {
    const mixed = withoutTimestamps()
    mixed.messages[0]!.receivedAtIso = fixtures.messages[0]!.receivedAtIso
    const mixedRepository = new FakeMutableMailRepository(mixed)

    await expect(new RetentionMaintenanceService(mixedRepository, new FakeStorageSanitizer())
      .ensureFixtureCompatibility(fixtures)).rejects.toThrowError(
      expect.objectContaining<Partial<RetentionError>>({
        code: 'RETENTION_COMPATIBILITY_UNRECOGNIZED'
      })
    )
    expect(mixedRepository.replacements).toBe(0)

    const edited = withoutTimestamps()
    edited.messages[0]!.subject = 'Locally changed fixture subject'
    const editedRepository = new FakeMutableMailRepository(edited)
    await expect(new RetentionMaintenanceService(editedRepository, new FakeStorageSanitizer())
      .ensureFixtureCompatibility(fixtures)).rejects.toThrowError(
      expect.objectContaining<Partial<RetentionError>>({
        code: 'RETENTION_COMPATIBILITY_UNRECOGNIZED'
      })
    )
    expect(editedRepository.replacements).toBe(0)
  })

  it('rejects an invalid current fixture reference', () => {
    const invalidReference = structuredClone(fixtures)
    delete invalidReference.messages[0]!.receivedAtIso

    expect(() => planFixtureRetentionCompatibility(fixtures, invalidReference)).toThrowError(
      expect.objectContaining<Partial<RetentionError>>({
        code: 'RETENTION_FIXTURE_REFERENCE_INVALID'
      })
    )
  })
})

describe('rolling retention maintenance', () => {
  it('retains a message exactly at the 90-day boundary', () => {
    const dataset = structuredClone(fixtures)
    dataset.messages[0]!.receivedAtIso = '2026-05-26T12:00:00.000Z'

    const planned = applyRetentionPolicy(dataset, now)

    expect(planned.result.changed).toBe(false)
    expect(planned.result.cutoffAt).toBe('2026-05-26T12:00:00.000Z')
  })

  it('evicts expired source mail and every derived object that cites it', () => {
    const dataset = structuredClone(fixtures)
    dataset.messages.find((message) => message.id === 'pulse-scope')!.receivedAtIso =
      '2026-05-26T11:59:59.999Z'

    const planned = applyRetentionPolicy(dataset, now)

    expect(planned.dataset.messages.map((message) => message.id)).not.toContain('pulse-scope')
    expect(planned.dataset.topics.map((topic) => topic.id)).not.toContain('pulse')
    expect(planned.dataset.briefItems.map((item) => item.id)).toEqual([
      'brief-apartment', 'brief-acme'
    ])
    expect(planned.result.removed).toEqual({
      messages: 1,
      topics: 1,
      briefItems: 2,
      people: 0
    })
  })

  it('removes people only when no retained source or topic references them', () => {
    const dataset = structuredClone(fixtures)
    dataset.messages.find((message) => message.id === 'apartment-docs')!.receivedAtIso =
      '2026-01-01T00:00:00.000Z'

    const planned = applyRetentionPolicy(dataset, now)

    expect(planned.dataset.people.map((person) => person.id)).not.toContain('ajay')
    expect(planned.dataset.accounts).toEqual(fixtures.accounts)
  })

  it('fails closed instead of guessing a missing or display-only timestamp', () => {
    const dataset = structuredClone(fixtures)
    delete dataset.messages[0]!.receivedAtIso
    expect(() => applyRetentionPolicy(dataset, now)).toThrowError(
      expect.objectContaining<Partial<RetentionError>>({ code: 'RETENTION_TIMESTAMP_MISSING' })
    )

    dataset.messages[0]!.receivedAtIso = 'Today · 10:42 AM'
    expect(() => applyRetentionPolicy(dataset, now)).toThrowError(
      expect.objectContaining<Partial<RetentionError>>({ code: 'RETENTION_TIMESTAMP_INVALID' })
    )
  })

  it('rewrites storage once and is idempotent on a repeated run', async () => {
    const dataset = structuredClone(fixtures)
    dataset.messages.find((message) => message.id === 'apartment-docs')!.receivedAtIso =
      '2026-01-01T00:00:00.000Z'
    const repository = new FakeMutableMailRepository(dataset)
    const sanitizer = new FakeStorageSanitizer()
    const service = new RetentionMaintenanceService(repository, sanitizer)

    await expect(service.run(now)).resolves.toMatchObject({ changed: true })
    await expect(service.run(now)).resolves.toMatchObject({ changed: false })
    expect(repository.replacements).toBe(1)
    expect(sanitizer.calls).toBe(1)
  })
})
