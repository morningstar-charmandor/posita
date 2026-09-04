import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const failures = []

const readText = async (path) => readFile(join(root, path), 'utf8')
const fail = (message) => failures.push(message)

const requiredFiles = [
  'AGENTS.md',
  'README.md',
  'project.agent.json',
  '.node-version',
  'docs/MVP.md',
  'docs/ARCHITECTURE.md',
  'docs/DECISIONS.md',
  'docs/DATABASE.md',
  'docs/PRIVACY.md',
  'docs/GMAIL.md',
  'docs/GATE_2D_READINESS.md',
  'docs/ENGINEERING.md',
  'docs/ENCRYPTED_CACHE.md',
  'docs/HANDOFF.md',
  'docs/PROJECT_HISTORY.md',
  'docs/CASE_STUDY.md',
  'src/main/AGENTS.md',
  'src/main/index.ts',
  'src/preload/AGENTS.md',
  'src/preload/index.ts',
  'src/renderer/AGENTS.md',
  'src/renderer/src/main.tsx',
  'src/shared/AGENTS.md',
  'src/shared/domain.ts',
  'src/shared/providerMail.ts',
  'src/main/application/mailSync.ts',
  'src/main/application/mailSyncCoordinator.ts',
  'src/main/application/googleAccountConnectionPreflight.ts',
  'src/main/application/googleAccountConnectionCommand.ts',
  'src/main/application/googleAccountDisconnectCommand.ts',
  'src/preload/googleAccountConnectionPreflightClient.ts',
  'src/renderer/src/application/googleAccountConnectionPreflightDataSource.ts',
  'src/main/infrastructure/providers/deterministicFakeMailSync.ts'
]

for (const path of requiredFiles) {
  try {
    await readText(path)
  } catch {
    fail(`missing required file: ${path}`)
  }
}

const packageJson = JSON.parse(await readText('package.json'))
const agentManifest = JSON.parse(await readText('project.agent.json'))

const requiredScripts = ['dev', 'test', 'typecheck', 'check:structure', 'verify']
for (const name of requiredScripts) {
  if (!packageJson.scripts?.[name]) fail(`package.json is missing script: ${name}`)
}

if (packageJson.scripts?.verify !== 'npm run check && electron-vite build') {
  fail('package.json verify script must run the canonical check and production bundle')
}

if (agentManifest.verification?.canonicalCommand !== 'npm run verify') {
  fail('project.agent.json must identify npm run verify as the canonical gate')
}

for (const path of [
  ...Object.values(agentManifest.entrypoints ?? {}),
  ...Object.values(agentManifest.scopedInstructions ?? {}),
  ...(agentManifest.sourcesOfTruth ?? [])
]) {
  try {
    await readText(path)
  } catch {
    fail(`project.agent.json points to a missing file: ${path}`)
  }
}

for (const [name, version] of Object.entries({
  ...packageJson.dependencies,
  ...packageJson.devDependencies
})) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`dependency ${name} must use an exact version, found ${version}`)
  }
}

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

const rendererRoot = join(root, 'src/renderer')
const forbiddenRendererImports = [
  /from\s+['"]electron['"]/,
  /from\s+['"]node:/,
  /(?:from\s+|require\()['"](?:fs|path|child_process|worker_threads|net|tls|os)['"]/
]

for (const path of await walk(rendererRoot)) {
  const source = await readFile(path, 'utf8')
  for (const pattern of forbiddenRendererImports) {
    if (pattern.test(source)) {
      fail(`renderer security boundary violation in ${relative(root, path)}: ${pattern}`)
    }
  }
  if (!path.includes('.test.') && /(?:@shared\/fixtures|shared\/fixtures)/.test(source)) {
    fail(`production renderer must not import fixture data directly: ${relative(root, path)}`)
  }
  if (!path.includes('.test.') && /clientSecret|google-oauth-client\.json/.test(source)) {
    fail(`renderer must never receive Google client credentials: ${relative(root, path)}`)
  }
}

const preload = await readText('src/preload/index.ts')
if (/ipcRenderer\.(?:send|invoke|on)\s*[,}]/.test(preload)) {
  fail('preload must not expose an unscoped ipcRenderer method')
}

const rendererStyles = await readText('src/renderer/src/styles.css')
if (!rendererStyles.includes('@media (prefers-reduced-motion: reduce)')) {
  fail('renderer styles must respect the reduced-motion preference')
}

const sharedContracts = await readText('src/shared/contracts.ts')
const applicationStateService = await readText('src/main/application/applicationStateService.ts')
const secretVaultContract = await readText('src/main/application/secretVault.ts')
const accountStateContract = await readText('src/main/application/accountState.ts')
const accountConnectionService = await readText('src/main/application/accountConnection.ts')
const accountConnectionRecovery = await readText(
  'src/main/application/recoverAccountConnection.ts'
)
const accountConnectionRecoveryConfirmation = await readText(
  'src/main/application/accountConnectionRecoveryConfirmation.ts'
)
const accountConnectionRecoveryConfirmationRepository = await readText(
  'src/main/infrastructure/sqlite/sqliteAccountConnectionRecoveryConfirmationRepository.ts'
)
const accountConnectionRecoveryCommand = await readText(
  'src/main/application/accountConnectionRecoveryCommand.ts'
)
const applicationIpc = await readText('src/main/ipc/applicationIpc.ts')
const retentionOwner = await readText('src/main/application/retentionMaintenanceOwner.ts')
const retentionWorker = await readText(
  'src/main/infrastructure/sqlite/retentionMaintenanceWorker.ts'
)
const retentionWorkerAdapter = await readText(
  'src/main/infrastructure/sqlite/workerThreadRetentionMaintenance.ts'
)
const retentionStatusPanel = await readText(
  'src/renderer/src/features/settings/RetentionMaintenanceStatusPanel.tsx'
)
const canonicalProviderMail = await readText('src/shared/providerMail.ts')
const mailSyncContract = await readText('src/main/application/mailSync.ts')
const mailSyncCoordinator = await readText('src/main/application/mailSyncCoordinator.ts')
const deterministicMailSync = await readText(
  'src/main/infrastructure/providers/deterministicFakeMailSync.ts'
)
const electronViteConfig = await readText('electron.vite.config.ts')
const accountConnectionRecoveryClient = await readText(
  'src/preload/accountConnectionRecoveryClient.ts'
)
const accountConnectionRecoveryPanel = await readText(
  'src/renderer/src/features/settings/AccountConnectionRecoveryPanel.tsx'
)
const gmailConsentPanel = await readText(
  'src/renderer/src/features/settings/GmailConnectConsentPanel.tsx'
)
const googleAccountConnectionPreflight = await readText(
  'src/main/application/googleAccountConnectionPreflight.ts'
)
const googleAccountConnectionPreflightClient = await readText(
  'src/preload/googleAccountConnectionPreflightClient.ts'
)
const googleAccountConnectionCommand = await readText(
  'src/main/application/googleAccountConnectionCommand.ts'
)
const googleAccountDisconnectCommand = await readText(
  'src/main/application/googleAccountDisconnectCommand.ts'
)
const googleAccountDisconnectControl = await readText(
  'src/renderer/src/features/settings/GoogleAccountDisconnectControl.tsx'
)
if (!sharedContracts.includes("consentVersion: 'google-gmail-readonly-identity-v2'") ||
    !sharedContracts.includes("'openid'") ||
    !sharedContracts.includes("'email'") ||
    !sharedContracts.includes("'https://www.googleapis.com/auth/gmail.readonly'")) {
  fail('the reviewed Google consent must remain versioned, identity-bounded, and Gmail read-only')
}
if (!applicationStateService.includes('connectConsent: GOOGLE_CONNECT_CONSENT')) {
  fail('Gmail consent must use the existing read-only application-state projection')
}
if (!gmailConsentPanel.includes('Prepare Gmail connection') ||
    !gmailConsentPanel.includes('Continue to Google') ||
    !gmailConsentPanel.includes('Cancel connection') ||
    !gmailConsentPanel.includes('No Gmail accounts are connected.') ||
    !googleAccountDisconnectControl.includes('GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT') ||
    !googleAccountDisconnectControl.includes('state.enteredText !== GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT')) {
  fail('Gmail activation must remain explicit, cancellable, read-only, and paired with disconnect')
}
if (!googleAccountConnectionPreflight.includes("status: 'authorization-not-started'") ||
    !googleAccountConnectionPreflight.includes("nextStep: 'explicit-google-authorization-required'") ||
    googleAccountConnectionPreflight.includes('AccountConnectionActivationService') ||
    googleAccountConnectionPreflight.includes('authorizationUrl') ||
    googleAccountConnectionPreflight.includes('accountId') ||
    googleAccountConnectionPreflightClient.includes('authorizationUrl') ||
    googleAccountConnectionPreflightClient.includes('accountId')) {
  fail('Gmail connection preflight must not expose or start authorization')
}
if (!googleAccountConnectionCommand.includes('this.activation.connect({') ||
    !googleAccountConnectionCommand.includes('this.lifecycle.activateConnectedAccount({') ||
    !googleAccountConnectionCommand.includes('this.active.abort()') ||
    googleAccountConnectionCommand.includes('authorizationUrl') ||
    googleAccountConnectionCommand.includes('refreshToken') ||
    !googleAccountDisconnectCommand.includes('this.audit.save({') ||
    !googleAccountDisconnectCommand.includes('this.lifecycle.disconnectAccount({') ||
    !googleAccountDisconnectCommand.includes('GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT')) {
  fail('Google account commands must preserve trusted activation, cancellation, audit, and disconnect ownership')
}
if (!canonicalProviderMail.includes('interface ProviderMailMessageV1') ||
    !canonicalProviderMail.includes('interface ProviderMailThreadV1') ||
    !canonicalProviderMail.includes('isProviderMailMessageV1') ||
    !canonicalProviderMail.includes('providerMessageId') ||
    !mailSyncCoordinator.includes('class MailSyncCoordinator') ||
    !mailSyncContract.includes('interface MailSyncProjection') ||
    !mailSyncContract.includes('INITIAL_SYNC_DAYS = 90') ||
    !mailSyncContract.includes("reconciliation: 'incremental' | 'bounded-resync'") ||
    !deterministicMailSync.includes('class DeterministicFakeMailProviderAdapter') ||
    !deterministicMailSync.includes('class DeterministicFakeMailSyncProjection')) {
  fail('canonical provider mail and the single credential-free sync boundary must remain verified')
}
if (!secretVaultContract.includes('has(name: SecretName): Promise<boolean>') ||
    !accountStateContract.includes('hasProviderAccount(accountId: string): boolean') ||
    !accountConnectionService.includes('accountState.hasProviderAccount(accountId)') ||
    !accountConnectionService.includes('vault.has(googleRefreshTokenName(accountId))') ||
    !accountConnectionService.includes("| 'credential-only'") ||
    !accountConnectionService.includes("| 'provider-state-only'")) {
  fail('account connection consistency must remain presence-only and fail-closed')
}
if (!sharedContracts.includes("action: 'discard-orphaned-local-connection-state'") ||
    !accountConnectionRecovery.includes('reconnectRequired: true') ||
    !accountConnectionRecovery.includes('AccountConnectionRecoveryConfirmationVerifier') ||
    !accountConnectionRecovery.includes("current === 'connected'") ||
    !accountConnectionRecovery.includes("finalState.status !== 'absent'")) {
  fail('account connection recovery must stay confirmed, discard-only, and fail-closed')
}
if (!accountConnectionRecovery.includes('this.confirmations.consume(recoveryRequest)') ||
    !sharedContracts.includes("'DISCARD LOCAL CONNECTION' as const") ||
    !accountConnectionRecoveryConfirmationRepository.includes('SET consumed_at = ?') ||
    !accountConnectionRecoveryConfirmationRepository.includes('consumed_at IS NULL')) {
  fail('account recovery confirmation must remain exact, one-use, and atomically consumed')
}

const localDataBootstrap = await readText('src/main/bootstrapLocalData.ts')
const mainIndex = await readText('src/main/index.ts')
const googleProviderLifecycleComposition = await readText(
  'src/main/googleProviderLifecycleComposition.ts'
)
const googleOAuthClientConfiguration = await readText(
  'src/main/infrastructure/providers/googleOAuthClientConfiguration.ts'
)
if (!googleOAuthClientConfiguration.includes(
  "GOOGLE_OAUTH_CLIENT_CONFIGURATION_FILE = 'google-oauth-client.json'"
) || !googleOAuthClientConfiguration.includes('constants.O_NOFOLLOW') ||
    !googleOAuthClientConfiguration.includes('(metadata.mode & 0o077) !== 0') ||
    !googleOAuthClientConfiguration.includes(
      "const ALLOWED_KEYS = ['version', 'provider', 'clientId', 'clientSecret'] as const"
    ) || !googleOAuthClientConfiguration.includes('record.version !== 2') ||
    !googleOAuthClientConfiguration.includes('GOOGLE_OAUTH_CLIENT_SECRET_PATTERN')) {
  fail('Google client configuration must stay fixed, private, symlink-refusing, and exact')
}
if (googleOAuthClientConfiguration.includes('process.env') ||
    preload.includes('clientSecret') || preload.includes('google-oauth-client.json') ||
    !googleProviderLifecycleComposition.includes('dependencies.configuration.clientSecret')) {
  fail('Google client credentials must stay explicit, local-file-only, and trusted-main-only')
}
if (!localDataBootstrap.includes('new ElectronSafeStorageProtector()')) {
  fail('production composition must use the Electron OS-backed credential protector')
}
if (!localDataBootstrap.includes('new AesGcmCacheProtector(key)')) {
  fail('production composition must encrypt private cache records with AES-GCM')
}
if (!localDataBootstrap.includes('new EncryptedSqliteMailRepository(database, protector)')) {
  fail('production composition must use the encrypted mail repository')
}
if (!localDataBootstrap.includes('new EncryptedSqliteAccountStateRepository(database, protector)')) {
  fail('production composition must use the encrypted account-state repository')
}
if (!localDataBootstrap.includes('new SqliteAccountLifecycleRepository(database)')) {
  fail('production composition must use the account lifecycle journal')
}
if (!localDataBootstrap.includes(
  'new RetentionMaintenanceService(repository, storageSanitizer)'
)) {
  fail('production composition must expose retention through the application service')
}
if (!localDataBootstrap.includes('new WorkerThreadSqliteStorageSanitizer(databasePath)')) {
  fail('file-backed production sanitization must run through the worker adapter')
}
if (!localDataBootstrap.includes('new WorkerThreadRetentionMaintenance(') ||
    !mainIndex.includes('new RetentionMaintenanceOwner(') ||
    !mainIndex.includes('retentionMaintenance?.start()') ||
    !retentionOwner.includes('RETENTION_MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000') ||
    !retentionWorker.includes('new RetentionMaintenanceService(repository') ||
    !retentionWorkerAdapter.includes("name: 'posita-retention-maintenance'") ||
    !electronViteConfig.includes('retentionMaintenanceWorker: resolve(')) {
  fail('automatic file-backed retention must remain bounded, worker-owned, and built for production')
}
if (!sharedContracts.includes("applicationStateChanged: 'posita:application:state-changed:v1'") ||
    !applicationStateService.includes('retention: this.retention.status()') ||
    !preload.includes('onApplicationStateChanged') ||
    !retentionStatusPanel.includes('Automatic 90-day local cleanup') ||
    !retentionStatusPanel.includes('Gmail is never changed')) {
  fail('retention status must remain bounded, observable, and truthful across the desktop boundary')
}
if (!localDataBootstrap.includes('new AccountDataRemovalService(repository)')) {
  fail('production composition must expose account-data removal through the application service')
}
if (localDataBootstrap.includes('new SqliteMailRepository(')) {
  fail('production composition must not write mail through the legacy plaintext repository')
}
if (localDataBootstrap.includes('DeterministicFakeStringProtector')) {
  fail('production composition must not use the deterministic fake credential protector')
}
if (localDataBootstrap.includes('DeterministicFakeAccountAuthorizationAdapter')) {
  fail('production composition must not use the deterministic fake authorization adapter')
}
if (localDataBootstrap.includes('GoogleDesktopAccountAuthorizationAdapter') ||
    localDataBootstrap.includes('GoogleOAuthLoopbackRedirectServer') ||
    localDataBootstrap.includes('GoogleOAuthSystemBrowserLauncher') ||
    mainIndex.includes('GoogleDesktopAccountAuthorizationAdapter') ||
    mainIndex.includes('GoogleOAuthLoopbackRedirectServer') ||
    mainIndex.includes('GoogleOAuthSystemBrowserLauncher')) {
  fail('Google desktop authorization infrastructure must stay out of bootstrap and direct index wiring')
}
if (localDataBootstrap.includes('AccountConnectionService') ||
    mainIndex.includes('AccountConnectionService') ||
    localDataBootstrap.includes('AccountConnectionActivationService') ||
    mainIndex.includes('AccountConnectionActivationService')) {
  fail('account connection must stay behind the reviewed composition boundary')
}
if (localDataBootstrap.includes('MailSyncCoordinator') ||
    mainIndex.includes('MailSyncCoordinator') ||
    localDataBootstrap.includes('DeterministicFakeMailProviderAdapter') ||
    mainIndex.includes('DeterministicFakeMailProviderAdapter')) {
  fail('provider mail sync must stay behind the reviewed composition boundary')
}
for (const required of [
  'new GoogleDesktopAccountAuthorizationAdapter(',
  'new AccountConnectionService(',
  'new AccountConnectionActivationService(',
  'new GoogleOAuthAccessTokenSource(',
  'new GoogleMailReadAdapter(',
  'new MailSyncCoordinator(',
  'new GoogleOAuthRevoker(',
  'new DisconnectAccountService(',
  'new ProviderMailLifecycleOwner('
]) {
  if (!googleProviderLifecycleComposition.includes(required)) {
    fail(`Google lifecycle composition is missing its reviewed owner: ${required}`)
  }
}
if (!mainIndex.includes('loadGoogleOAuthClientConfiguration(') ||
    !mainIndex.includes('composeGoogleProviderLifecycle({') ||
    !mainIndex.includes('await composition.lifecycle.start([])')) {
  fail('production Google composition must remain configuration-gated and provider-inert')
}
if (mainIndex.includes('lifecycle.start(runtime.providerMailStartupInventory.accounts)') ||
    mainIndex.includes('connectionActivation.connect(')) {
  fail('startup must not automatically sync or launch Google authorization')
}
if (!localDataBootstrap.includes('new AccountConnectionRecoveryService(') ||
    !localDataBootstrap.includes('new AccountConnectionRecoveryConfirmationService(') ||
    !localDataBootstrap.includes('new SqliteAccountConnectionRecoveryConfirmationRepository(') ||
    !mainIndex.includes('runtime.accountConnectionRecoveryCommandService') ||
    !preload.includes('prepareAccountConnectionRecovery') ||
    !preload.includes('executeAccountConnectionRecovery') ||
    !accountConnectionRecoveryClient.includes('isPrepareAccountConnectionRecoveryRequest') ||
    !accountConnectionRecoveryClient.includes('isExecuteAccountConnectionRecoveryRequest') ||
    !applicationIpc.includes('recoveryAuthorization.revokeSender(id)') ||
    !accountConnectionRecoveryCommand.includes("consistency.status === 'connected'") ||
    !accountConnectionRecoveryCommand.includes("consistency.status === 'absent'") ||
    !accountConnectionRecoveryPanel.includes('Gmail is not contacted') ||
    !accountConnectionRecoveryPanel.includes('This sample build has no live Gmail account')) {
  fail('approved account recovery must remain local-only, confirmed, window-bound, and truthful')
}

const gitignore = await readText('.gitignore')
for (const ignored of ['node_modules/', 'out/', '.env', '*.tsbuildinfo']) {
  if (!gitignore.includes(ignored)) fail(`.gitignore must include ${ignored}`)
}

if (failures.length > 0) {
  console.error('Posita structure check failed:\n')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log('Posita structure check passed.')
  console.log(`Checked ${requiredFiles.length} required files and the renderer security boundary.`)
}
