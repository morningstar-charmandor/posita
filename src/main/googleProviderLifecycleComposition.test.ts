import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bootstrapLocalDataWithDependencies,
  type ReadyLocalDataRuntime
} from './bootstrapLocalData'
import { RetentionMaintenanceOwner } from './application/retentionMaintenanceOwner'
import { DeterministicFakeStringProtector } from './infrastructure/security/deterministicFakeStringProtector'
import { composeGoogleProviderLifecycle } from './googleProviderLifecycleComposition'

const directories: string[] = []
const runtimes: ReadyLocalDataRuntime[] = []

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    if (runtime.repository) runtime.repository.close()
  }
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })))
})

describe('composeGoogleProviderLifecycle', () => {
  it('assembles one inert production graph without browser or provider work', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'posita-google-composition-'))
    directories.push(directory)
    const runtime = await bootstrapLocalDataWithDependencies(join(directory, 'posita.sqlite3'), {
      credentialProtector: new DeterministicFakeStringProtector(),
      confirmationIdSource: () => 'unused-confirmation'
    })
    if (runtime.mode !== 'ready' || runtime.providerMailReadWorker === undefined) {
      throw new Error('Expected a file-backed ready runtime.')
    }
    runtimes.push(runtime)
    let browserOpens = 0
    const retention = new RetentionMaintenanceOwner(
      runtime.retentionService,
      { now: () => new Date('2026-09-03T08:00:00.000Z') }
    )
    const composition = composeGoogleProviderLifecycle({
      configuration: {
        version: 1,
        provider: 'google',
        clientId: '123456789-posita.apps.googleusercontent.com'
      },
      secretVault: runtime.secretVault,
      accountState: runtime.accountStateRepository,
      accountLifecycle: runtime.accountLifecycleRepository,
      accountDataRemoval: runtime.accountDataRemovalService,
      mailDataMode: runtime.mailDataModeService,
      projection: runtime.providerMailReadWorker,
      storageSanitizer: runtime.storageSanitizer,
      retention,
      syncStatus: runtime.providerMailSyncStatusService,
      openExternal: async () => { browserOpens += 1 }
    })

    expect(composition.connectionActivation).toBeDefined()
    await expect(composition.lifecycle.start([])).resolves.toEqual({
      version: 1,
      mode: 'sample',
      accounts: []
    })
    expect(browserOpens).toBe(0)

    await composition.lifecycle.shutdown()
  })
})
