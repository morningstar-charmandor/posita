import type { AccountStateRepository } from './application/accountState'
import { AccountConnectionService } from './application/accountConnection'
import { AccountConnectionActivationService } from './application/accountConnectionActivation'
import type { AccountLifecycleRepository } from './application/accountLifecycle'
import type { AccountDataRemovalService } from './application/accountDataRemoval'
import { DisconnectAccountService } from './application/disconnectAccount'
import { MailSyncCoordinator } from './application/mailSyncCoordinator'
import type { MailDataModeService } from './application/mailDataMode'
import { systemClock } from './application/mailApplicationService'
import {
  ProviderMailLifecycleOwner,
  type ProviderMailDisconnectLifecycle,
  type ProviderMailSyncLifecycle
} from './application/providerMailLifecycleOwner'
import type { ProviderMailSyncStatusService } from './application/providerMailSyncStatus'
import type { RetentionMaintenanceOwner } from './application/retentionMaintenanceOwner'
import type { SecretVault } from './application/secretVault'
import type { StorageSanitizer } from './application/storageSanitizer'
import { GoogleDesktopAccountAuthorizationAdapter } from './infrastructure/providers/googleDesktopAccountAuthorizationAdapter'
import { GoogleMailReadAdapter } from './infrastructure/providers/googleMailReadAdapter'
import type { GoogleOAuthClientConfigurationV1 } from './infrastructure/providers/googleOAuthClientConfiguration'
import { GoogleOAuthAccessTokenSource } from './infrastructure/providers/googleOAuthAccessTokenSource'
import { GoogleOAuthLoopbackRedirectServer } from './infrastructure/providers/googleOAuthLoopbackRedirectServer'
import { GoogleOAuthRevoker } from './infrastructure/providers/googleOAuthRevoker'
import {
  GoogleOAuthSystemBrowserLauncher,
  type GoogleOAuthOpenExternal
} from './infrastructure/providers/googleOAuthSystemBrowserLauncher'
import type { WorkerThreadMailSyncProjection } from './infrastructure/sqlite/workerThreadMailSyncProjection'

export interface GoogleProviderLifecycleCompositionDependencies {
  configuration: GoogleOAuthClientConfigurationV1
  secretVault: SecretVault
  accountState: AccountStateRepository
  accountLifecycle: AccountLifecycleRepository
  accountDataRemoval: AccountDataRemovalService
  mailDataMode: MailDataModeService
  projection: WorkerThreadMailSyncProjection
  storageSanitizer: StorageSanitizer
  retention: RetentionMaintenanceOwner
  syncStatus: ProviderMailSyncStatusService
  openExternal: GoogleOAuthOpenExternal
}

export interface GoogleProviderLifecycleComposition {
  connectionActivation: AccountConnectionActivationService
  lifecycle: ProviderMailLifecycleOwner
}

/**
 * Constructs the one approved Google connection, sync, disconnect, retention, and
 * teardown graph. Construction performs no browser or provider request; callers
 * must separately decide when a reviewed command may invoke either capability.
 */
export const composeGoogleProviderLifecycle = (
  dependencies: GoogleProviderLifecycleCompositionDependencies
): GoogleProviderLifecycleComposition => {
  const loopback = new GoogleOAuthLoopbackRedirectServer()
  const authorization = new GoogleDesktopAccountAuthorizationAdapter(
    dependencies.configuration.clientId,
    loopback
  )
  const connection = new AccountConnectionService(
    authorization,
    dependencies.secretVault,
    dependencies.accountState
  )
  const connectionActivation = new AccountConnectionActivationService(
    connection,
    loopback,
    new GoogleOAuthSystemBrowserLauncher(
      dependencies.configuration.clientId,
      dependencies.openExternal
    )
  )

  const tokens = new GoogleOAuthAccessTokenSource(
    dependencies.secretVault,
    dependencies.configuration
  )
  const coordinator = new MailSyncCoordinator(
    new GoogleMailReadAdapter(tokens),
    dependencies.projection,
    systemClock
  )
  const sync: ProviderMailSyncLifecycle = {
    syncAccount: (request) => coordinator.syncAccount(request),
    suspend: () => coordinator.suspend(),
    resume: () => coordinator.resume(),
    shutdown: async () => {
      try {
        await coordinator.shutdown()
      } finally {
        tokens.destroy()
      }
    }
  }
  const disconnectService = new DisconnectAccountService(
    dependencies.accountLifecycle,
    new GoogleOAuthRevoker(dependencies.secretVault),
    dependencies.secretVault,
    dependencies.accountState,
    dependencies.accountDataRemoval,
    dependencies.projection,
    dependencies.storageSanitizer
  )
  const disconnect: ProviderMailDisconnectLifecycle = {
    disconnect: (request) => {
      tokens.invalidate(request.accountId)
      return disconnectService.disconnect(request)
    }
  }

  return {
    connectionActivation,
    lifecycle: new ProviderMailLifecycleOwner(
      sync,
      dependencies.mailDataMode,
      dependencies.retention,
      disconnect,
      dependencies.projection,
      dependencies.syncStatus
    )
  }
}
