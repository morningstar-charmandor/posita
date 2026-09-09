import type { DatabaseSync } from 'node:sqlite'
import type { IpcMainInvokeEvent } from 'electron'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectAccountConnectionConsistency } from './accountConnection'
import type { ProviderAccountRecordV2, ProviderSyncState } from './accountState'
import { GoogleAccountSyncRetryCommandService } from './googleAccountSyncRetryCommand'
import type { SyncAccountResultV1 } from './mailSync'
import { ProviderMailLifecycleOwner } from './providerMailLifecycleOwner'
import type { ProviderMailSyncStageEventV1 } from './providerMailSyncDiagnostics'
import type { SecretVault } from './secretVault'
import { createRetryGoogleAccountSyncHandler } from '../ipc/applicationIpc'
import { AesGcmCacheProtector } from '../infrastructure/security/aesGcmCacheProtector'
import { openPositaDatabase } from '../infrastructure/sqlite/database'
import { EncryptedSqliteAccountStateRepository } from '../infrastructure/sqlite/encryptedSqliteAccountStateRepository'
import { applyMigrations } from '../infrastructure/sqlite/migrations'
import { ProviderMailSyncStatusService } from './providerMailSyncStatus'
import { createRetryGoogleAccountSyncClient } from '../../preload/googleAccountSyncRetryClient'

const accountId = 'account-work-1'
const openDatabases: DatabaseSync[] = []

const providerAccount: ProviderAccountRecordV2 = {
  version: 2,
  accountId,
  provider: 'google',
  providerAccountId: 'google-subject-integration-fixture',
  displayIdentity: { mailboxAddress: 'owner@example.test' },
  consentVersion: 'google-gmail-readonly-identity-v2',
  connectedAt: '2026-09-07T05:00:00.000Z'
}

const retryableState: ProviderSyncState = {
  version: 1,
  accountId,
  provider: 'google',
  status: 'error',
  lastErrorCode: 'SYNC_INTERRUPTED'
}

const syncResult: SyncAccountResultV1 = {
  version: 1,
  accountId,
  provider: 'google',
  mode: 'initial',
  batchesCommitted: 0,
  insertedMessages: 0,
  updatedMessages: 0,
  replayedMessages: 0,
  cursor: 'opaque-integration-cursor'
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
})

describe('Google sync retry encrypted-state and IPC integration', () => {
  it.each(['ordinary', 'quota'] as const)('settles %s retry from encrypted state through lifecycle, IPC and preload', async (mode) => {
    const database = openPositaDatabase(':memory:')
    openDatabases.push(database)
    applyMigrations(database)
    let nonceCounter = 0
    const protector = new AesGcmCacheProtector(
      Uint8Array.from({ length: 32 }, (_, index) => index + 1),
      (size) => {
        nonceCounter += 1
        return Uint8Array.from(
          { length: size },
          (_, index) => (nonceCounter * 17 + index) % 256
        )
      }
    )
    const accountState = new EncryptedSqliteAccountStateRepository(database, protector)
    accountState.saveProviderAccount(providerAccount)
    accountState.saveSyncState({ ...retryableState,
      lastErrorCode: mode === 'quota' ? 'QUOTA_EXHAUSTED' : 'SYNC_INTERRUPTED' })
    let now = Date.parse('2026-09-09T12:00:00.000Z')
    const clock = { now: () => new Date(now) }

    const vault: SecretVault = {
      set: async () => undefined,
      has: async () => true,
      get: async () => undefined,
      delete: async () => false,
      deleteGoogleRefreshTokens: async () => 0
    }
    const stages: ProviderMailSyncStageEventV1[] = []
    const reporter = { report: (event: ProviderMailSyncStageEventV1) => stages.push(event) }
    const lifecycle = new ProviderMailLifecycleOwner(
      {
        syncAccount: async () => syncResult,
        cancelAccount: () => false,
        suspend: async () => undefined,
        resume: () => undefined,
        shutdown: async () => undefined
      },
      {
        load: () => ({ version: 1, mode: 'live' }),
        activateLive: async () => ({ version: 1, mode: 'live', changed: false })
      },
      {
        start: () => undefined,
        suspend: async () => undefined,
        resume: () => undefined,
        stop: async () => undefined
      },
      { disconnect: async () => { throw new Error('Not used by this integration.') } },
      { destroyEncryptionContext: () => undefined },
      new ProviderMailSyncStatusService(accountState, clock),
      reporter
    )
    await lifecycle.start([])

    const command = new GoogleAccountSyncRetryCommandService(
      {
        inspect: (requestedAccountId) => inspectAccountConnectionConsistency(
          requestedAccountId,
          vault,
          accountState
        )
      },
      accountState,
      lifecycle,
      undefined,
      reporter,
      clock
    )
    const handler = createRetryGoogleAccountSyncHandler(command, () => true, reporter)
    const client = createRetryGoogleAccountSyncClient((request) => handler({} as IpcMainInvokeEvent, request))
    if (mode === 'quota') {
      await expect(client({ version: 1, action: 'retry-google-account-sync', accountId,
        quotaIntent: { version: 1, action: 'start-cooldown' } })).resolves.toMatchObject({
        ok: false, error: { code: 'SYNC_RETRY_NOT_ALLOWED' }
      })
      expect(accountState.loadSyncState(accountId)).toMatchObject({ version: 2,
        quotaCooldown: { notBefore: '2026-09-09T12:15:00.000Z' } })
      expect(stages.some(({ stage }) => stage === 'lifecycle-dispatch')).toBe(false)
      now += 15 * 60_000
      stages.length = 0
    }

    await expect(client({
      version: 1,
      action: 'retry-google-account-sync',
      accountId,
      ...(mode === 'quota' ? { quotaIntent: { version: 1 as const, action: 'resume' as const } } : {})
    })).resolves.toMatchObject({ ok: true, value: { accountId, status: 'synced' } })
    expect(accountState.loadSyncState(accountId)).toMatchObject({ version: 1, status: 'idle' })
    expect(stages.map(({ stage, phase }) => `${stage}:${phase}`)).toEqual([
      'sync-retry-command:started',
      'connection-preflight:started',
      'connection-preflight:completed',
      'sync-state-read:started',
      'sync-state-read:completed',
      'sync-retry-eligibility:started',
      'sync-retry-eligibility:completed',
      'lifecycle-dispatch:started',
      'lifecycle-queue:started',
      'lifecycle-dispatch:completed',
      'lifecycle-queue:completed',
      'retention-suspension:started',
      'retention-suspension:completed',
      'sync-retry-command:completed',
      'sync-retry-ipc-response:started',
      'sync-retry-ipc-response:completed'
    ])
  })
})
