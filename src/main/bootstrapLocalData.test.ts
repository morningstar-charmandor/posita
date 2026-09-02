import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
  GOOGLE_CONNECT_CONSENT
} from '../shared/contracts'
import { fixtures } from '../shared/fixtures'
import {
  bootstrapLocalDataWithDependencies,
  type LocalDataBootstrapDependencies,
  type LocalDataRuntime
} from './bootstrapLocalData'
import { CACHE_DATA_KEY_NAME } from './application/secretVault'
import { googleRefreshTokenName } from './application/secretVault'
import { AccountLifecycleStatusService } from './application/accountLifecycleStatus'
import { ApplicationStateService } from './application/applicationStateService'
import { LocalDataDeletionCommandService } from './application/localDataDeletionCommand'
import { DeterministicFakeStringProtector } from './infrastructure/security/deterministicFakeStringProtector'
import { openPositaDatabase } from './infrastructure/sqlite/database'
import {
  countEncryptedRecords,
  EncryptedSqliteMailRepository
} from './infrastructure/sqlite/encryptedSqliteMailRepository'
import { applyMigrations } from './infrastructure/sqlite/migrations'
import { SqliteAccountLifecycleRepository } from './infrastructure/sqlite/sqliteAccountLifecycleRepository'
import { SqliteLocalActionConfirmationRepository } from './infrastructure/sqlite/sqliteLocalActionConfirmationRepository'
import { SqliteSecretVault } from './infrastructure/sqlite/sqliteSecretVault'

const temporaryDirectories: string[] = []
const openDatabases: DatabaseSync[] = []

const dependencies = (
  signal?: AbortSignal
): LocalDataBootstrapDependencies => ({
  credentialProtector: new DeterministicFakeStringProtector(),
  confirmationIdSource: () => 'unused-confirmation-id',
  signal
})

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'posita-recovery-'))
  temporaryDirectories.push(directory)
  return join(directory, 'posita.sqlite3')
}

const inspect = (path: string) => {
  const database = openPositaDatabase(path)
  openDatabases.push(database)
  applyMigrations(database)
  return {
    database,
    lifecycle: new SqliteAccountLifecycleRepository(database),
    confirmations: new SqliteLocalActionConfirmationRepository(database),
    vault: new SqliteSecretVault(database, new DeterministicFakeStringProtector())
  }
}

const closeRuntime = (runtime: LocalDataRuntime): void => {
  if (runtime.mode === 'ready') {
    runtime.providerMailReadWorker?.destroyEncryptionContext()
    runtime.retentionService.destroyEncryptionContext?.()
  }
  runtime.repository.close()
}

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('bootstrapLocalData lifecycle recovery', () => {
  it('stays live-empty after the last connected account is removed and never reseeds samples', async () => {
    const databasePath = await createDatabasePath()
    const initial = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    if (initial.mode !== 'ready') throw new Error('Expected ready runtime.')
    expect(initial.providerMailSourceDetailSource).toBeUndefined()
    expect(initial.providerMailOriginalSourceLocatorSource).toBeUndefined()
    initial.accountStateRepository.saveProviderAccount({
      version: 2,
      accountId: 'work',
      provider: 'google',
      providerAccountId: 'provider-subject-test-1',
      displayIdentity: { mailboxAddress: 'work@example.test' },
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      connectedAt: '2026-08-31T12:00:00.000Z'
    })
    await initial.secretVault.set(
      googleRefreshTokenName('work'),
      'deterministic-test-refresh-credential'
    )

    await expect(initial.mailDataModeService.activateLive({ version: 1, accountId: 'work' }))
      .resolves.toEqual({ version: 1, mode: 'live', changed: true })
    await expect(initial.service.loadSnapshot()).resolves.toMatchObject({
      ok: true,
      value: { dataMode: 'live-canonical', status: 'empty', messages: [] }
    })
    expect(initial.repository.loadDataset()).toMatchObject({ accounts: [], messages: [] })
    initial.accountStateRepository.deleteAccountState('work')
    await initial.secretVault.delete(googleRefreshTokenName('work'))
    closeRuntime(initial)

    const restarted = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    if (restarted.mode !== 'ready') throw new Error('Expected ready runtime.')
    expect(restarted.mailDataModeService.load()).toEqual({ version: 1, mode: 'live' })
    expect(restarted.providerMailSourceDetailSource).toBeDefined()
    expect(restarted.providerMailOriginalSourceLocatorSource).toBeDefined()
    expect(restarted.repository.loadDataset()).toMatchObject({ accounts: [], messages: [] })
    await expect(restarted.service.loadSnapshot()).resolves.toMatchObject({
      ok: true,
      value: { dataMode: 'live-canonical', status: 'empty', accounts: [], messages: [] }
    })
    closeRuntime(restarted)
  })

  it('composes confirmed local-only recovery for an orphaned credential', async () => {
    const databasePath = await createDatabasePath()
    const ids = ['confirmation-recovery-1', 'operation-recovery-1']
    const runtime = await bootstrapLocalDataWithDependencies(databasePath, {
      ...dependencies(),
      confirmationIdSource: () => ids.shift() ?? 'unused-recovery-id'
    })
    if (runtime.mode !== 'ready') throw new Error('Expected ready runtime.')
    await runtime.secretVault.set(
      'oauth.google.work.refresh-token',
      'test-only-orphaned-refresh-credential'
    )

    const prepared = await runtime.accountConnectionRecoveryCommandService.prepare({
      version: 1,
      action: 'discard-orphaned-local-connection-state',
      accountId: 'work'
    })
    if (!prepared.ok) throw new Error(prepared.error.message)
    expect(prepared.value.expectedStatus).toBe('credential-only')

    await expect(runtime.accountConnectionRecoveryCommandService.execute({
      version: 1,
      confirmationId: prepared.value.confirmationId,
      operationId: prepared.value.operationId,
      action: prepared.value.action,
      accountId: prepared.value.accountId,
      expectedStatus: prepared.value.expectedStatus,
      enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
    })).resolves.toMatchObject({
      ok: true,
      value: { accountId: 'work', status: 'absent', reconnectRequired: true }
    })
    expect(await runtime.secretVault.has('oauth.google.work.refresh-token')).toBe(false)
    expect(runtime.accountStateRepository.hasProviderAccount('work')).toBe(false)
    closeRuntime(runtime)
  })

  it('cleans an expired unlinked confirmation receipt during startup', async () => {
    const databasePath = await createDatabasePath()
    const initial = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    closeRuntime(initial)
    const setup = inspect(databasePath)
    setup.confirmations.save({
      version: 1,
      confirmationId: 'confirm-expired-1',
      operationId: 'delete-expired-1',
      action: 'delete-local-data',
      confirmedAt: '2000-01-01T00:00:00.000Z',
      expiresAt: '2000-01-01T00:05:00.000Z'
    })
    setup.database.close()

    const restarted = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    expect(restarted.mode).toBe('ready')
    closeRuntime(restarted)
    const afterRestart = inspect(databasePath)
    expect(afterRestart.confirmations.load('confirm-expired-1')).toBeUndefined()
  })

  it('upgrades an exact legacy encrypted fixture cache with absolute retention timestamps', async () => {
    const databasePath = await createDatabasePath()
    const initial = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    if (initial.mode !== 'ready') throw new Error('Expected ready runtime.')
    const legacyFixtures = structuredClone(fixtures)
    for (const message of legacyFixtures.messages) delete message.receivedAtIso
    const repository = initial.repository as EncryptedSqliteMailRepository
    repository.replaceDataset(legacyFixtures)
    repository.close()

    const restarted = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    expect(restarted.mode).toBe('ready')
    expect(restarted.repository.loadDataset()).toEqual(fixtures)
    closeRuntime(restarted)
  })

  it('executes confirmed active deletion and remains deleted after restart', async () => {
    const databasePath = await createDatabasePath()
    let generated = 0
    const runtime = await bootstrapLocalDataWithDependencies(databasePath, {
      ...dependencies(),
      confirmationIdSource: () => generated++ === 0 ? 'confirm-delete-1' : 'delete-local-1'
    })
    if (runtime.mode !== 'ready') throw new Error('Expected ready runtime.')
    const applicationState = new ApplicationStateService(
      'ready',
      runtime.service,
      new AccountLifecycleStatusService(runtime.accountLifecycleRepository)
    )
    const command = new LocalDataDeletionCommandService(
      runtime.confirmationService,
      runtime.deleteLocalDataService,
      applicationState
    )
    const prepared = command.prepare({ version: 1, action: 'delete-local-data' })
    if (!prepared.ok) throw new Error(prepared.error.message)

    await expect(command.execute({
      version: 1,
      confirmationId: prepared.value.confirmationId,
      operationId: prepared.value.operationId,
      action: prepared.value.action,
      enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
    })).resolves.toMatchObject({
      ok: true,
      value: { status: 'local-data-deleted' }
    })
    expect(await applicationState.load()).toEqual({
      ok: true,
      value: { version: 1, mode: 'local-data-deleted' }
    })
    closeRuntime(runtime)

    const deleted = inspect(databasePath)
    expect(countEncryptedRecords(deleted.database)).toBe(0)
    expect(deleted.database.prepare('SELECT COUNT(*) AS count FROM mail_data_mode_state').get())
      .toEqual({ count: 0 })
    expect(deleted.database.prepare('SELECT COUNT(*) AS count FROM encrypted_account_records').get())
      .toEqual({ count: 0 })
    expect(await deleted.vault.get(CACHE_DATA_KEY_NAME)).toBeUndefined()
    deleted.database.close()

    const restarted = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    expect(restarted.mode).toBe('local-data-deleted')
    closeRuntime(restarted)
  })

  it('recovers full deletion without a key and never reseeds on later restarts', async () => {
    const databasePath = await createDatabasePath()
    const initial = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    expect(initial.mode).toBe('ready')
    closeRuntime(initial)

    const setup = inspect(databasePath)
    expect(await setup.vault.delete(CACHE_DATA_KEY_NAME)).toBe(true)
    setup.lifecycle.save({
      version: 1,
      operationId: 'delete-local-1',
      operationType: 'delete-local-data',
      phase: 'credentials-delete-pending'
    })
    setup.database.close()

    const recovered = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    expect(recovered.mode).toBe('local-data-deleted')
    expect(recovered.service.loadSnapshot()).toMatchObject({
      ok: false,
      error: { code: 'DATABASE_UNAVAILABLE' }
    })
    closeRuntime(recovered)

    const afterRecovery = inspect(databasePath)
    expect(countEncryptedRecords(afterRecovery.database)).toBe(0)
    expect(afterRecovery.database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_account_records
    `).get()).toEqual({ count: 0 })
    expect(afterRecovery.database.prepare(`
      SELECT COUNT(*) AS count FROM protected_secrets
    `).get()).toEqual({ count: 0 })
    expect(afterRecovery.lifecycle.loadLatestDeleteLocalData()).toMatchObject({ phase: 'completed' })
    afterRecovery.database.close()

    const laterRestart = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    expect(laterRestart.mode).toBe('local-data-deleted')
    closeRuntime(laterRestart)
    const finalState = inspect(databasePath)
    expect(countEncryptedRecords(finalState.database)).toBe(0)
    expect(finalState.database.prepare('SELECT COUNT(*) AS count FROM protected_secrets').get())
      .toEqual({ count: 0 })
  })

  it('finishes key-erasure-pending without creating a replacement key', async () => {
    const databasePath = await createDatabasePath()
    const initial = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    closeRuntime(initial)
    const setup = inspect(databasePath)
    setup.database.exec('DELETE FROM encrypted_account_records')
    setup.database.exec('DELETE FROM encrypted_records')
    setup.database.prepare(`
      INSERT INTO encrypted_cache_state (id, status, updated_at)
      VALUES (1, 'ready', datetime('now'))
      ON CONFLICT(id) DO UPDATE SET status = 'ready', updated_at = datetime('now')
    `).run()
    expect(await setup.vault.delete(CACHE_DATA_KEY_NAME)).toBe(true)
    setup.lifecycle.save({
      version: 1,
      operationId: 'delete-local-key-1',
      operationType: 'delete-local-data',
      phase: 'data-key-delete-pending'
    })
    setup.database.close()

    const recovered = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    expect(recovered.mode).toBe('local-data-deleted')
    closeRuntime(recovered)
    const afterRecovery = inspect(databasePath)
    expect(await afterRecovery.vault.get(CACHE_DATA_KEY_NAME)).toBeUndefined()
    expect(afterRecovery.lifecycle.load('delete-local-key-1')).toMatchObject({ phase: 'completed' })
  })

  it('fails closed when full deletion conflicts with another pending operation', async () => {
    const databasePath = await createDatabasePath()
    const initial = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    closeRuntime(initial)
    const setup = inspect(databasePath)
    setup.lifecycle.save({
      version: 1,
      operationId: 'delete-local-1',
      operationType: 'delete-local-data',
      phase: 'mail-data-delete-pending'
    })
    setup.lifecycle.save({
      version: 1,
      operationId: 'disconnect-work-1',
      operationType: 'disconnect-account',
      accountId: 'work',
      phase: 'credential-delete-pending'
    })
    setup.database.close()

    await expect(bootstrapLocalDataWithDependencies(databasePath, dependencies()))
      .rejects.toMatchObject({ code: 'LIFECYCLE_RECOVERY_CONFLICT', retryable: false })
    const afterFailure = inspect(databasePath)
    expect(countEncryptedRecords(afterFailure.database)).toBeGreaterThan(0)
    expect(await afterFailure.vault.get(CACHE_DATA_KEY_NAME)).toBeDefined()
  })

  it('leaves the current phase unchanged when startup recovery is cancelled', async () => {
    const databasePath = await createDatabasePath()
    const initial = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    closeRuntime(initial)
    const setup = inspect(databasePath)
    setup.lifecycle.save({
      version: 1,
      operationId: 'delete-local-1',
      operationType: 'delete-local-data',
      phase: 'mail-data-delete-pending'
    })
    setup.database.close()
    const controller = new AbortController()
    controller.abort()

    await expect(bootstrapLocalDataWithDependencies(
      databasePath,
      dependencies(controller.signal)
    )).rejects.toMatchObject({ name: 'AbortError' })
    const afterCancel = inspect(databasePath)
    expect(afterCancel.lifecycle.load('delete-local-1')).toMatchObject({
      phase: 'mail-data-delete-pending'
    })
    expect(countEncryptedRecords(afterCancel.database)).toBeGreaterThan(0)
  })

  it('never reseeds or creates a key while account disconnect is pending', async () => {
    const databasePath = await createDatabasePath()
    const initial = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    closeRuntime(initial)
    const setup = inspect(databasePath)
    setup.database.exec('DELETE FROM encrypted_records')
    setup.lifecycle.save({
      version: 1,
      operationId: 'disconnect-work-1',
      operationType: 'disconnect-account',
      accountId: 'work',
      phase: 'compaction-pending'
    })
    setup.database.close()

    const pending = await bootstrapLocalDataWithDependencies(databasePath, dependencies())
    expect(pending.mode).toBe('ready')
    expect(pending.service.loadSnapshot()).toMatchObject({
      ok: true,
      value: { dataset: { accounts: [], messages: [] } }
    })
    closeRuntime(pending)
    const withoutKey = inspect(databasePath)
    expect(countEncryptedRecords(withoutKey.database)).toBe(0)
    expect(await withoutKey.vault.delete(CACHE_DATA_KEY_NAME)).toBe(true)
    withoutKey.database.close()

    await expect(bootstrapLocalDataWithDependencies(databasePath, dependencies()))
      .rejects.toMatchObject({ code: 'CACHE_KEY_MISSING' })
    const finalState = inspect(databasePath)
    expect(countEncryptedRecords(finalState.database)).toBe(0)
    expect(await finalState.vault.get(CACHE_DATA_KEY_NAME)).toBeUndefined()
  })
})
