import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openPositaDatabase } from './database'
import { applyMigrations } from './migrations'
import { SqliteReviewedGoogleSyncRetryReceipt } from './sqliteReviewedGoogleSyncRetryReceipt'

const databases: DatabaseSync[] = []
const now = () => new Date('2026-09-08T12:00:00.000Z')
afterEach(() => { for (const database of databases.splice(0)) if (database.isOpen) database.close() })
const setup = () => {
  const database = openPositaDatabase(':memory:')
  databases.push(database)
  applyMigrations(database)
  return { database, receipt: new SqliteReviewedGoogleSyncRetryReceipt(database, now) }
}

describe('reviewed Gmail one-use durable receipt', () => {
  it('retains consumption across closing and reopening a real temporary database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'posita-reviewed-retry-test-'))
    const path = join(directory, 'test.sqlite')
    let database = openPositaDatabase(path)
    try {
      applyMigrations(database)
      expect(new SqliteReviewedGoogleSyncRetryReceipt(database, now).consume('account-work-1')).toBe(true)
      database.close()
      database = openPositaDatabase(path)
      const receipt = new SqliteReviewedGoogleSyncRetryReceipt(database, now)
      expect(receipt.available()).toBe(false)
      expect(receipt.consume('account-work-1')).toBe(false)
    } finally {
      if (database.isOpen) database.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('consumes only once across recreated owners and cannot rebind to another account', () => {
    const { database, receipt } = setup()
    expect(receipt.available()).toBe(true)
    expect(receipt.consume('account-work-1')).toBe(true)
    const recreated = new SqliteReviewedGoogleSyncRetryReceipt(database, now)
    expect(recreated.available()).toBe(false)
    expect(recreated.consume('account-work-1')).toBe(false)
    expect(recreated.consume('account-other')).toBe(false)
    expect(database.prepare('SELECT command_type, target_id, result_code FROM audit_events').all())
      .toEqual([{ command_type: 'reviewed-google-sync-retry', target_id: 'account-work-1', result_code: 'consumed-before-dispatch' }])
  })

  it('refuses malformed account IDs and fails closed on unavailable storage', () => {
    const { database, receipt } = setup()
    expect(receipt.consume('not an account')).toBe(false)
    expect(receipt.available()).toBe(true)
    database.close()
    expect(() => receipt.consume('account-work-1')).toThrow()
    expect(() => receipt.available()).toThrow()
  })
})
