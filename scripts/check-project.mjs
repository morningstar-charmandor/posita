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
  'src/shared/domain.ts'
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
}

const preload = await readText('src/preload/index.ts')
if (/ipcRenderer\.(?:send|invoke|on)\s*[,}]/.test(preload)) {
  fail('preload must not expose an unscoped ipcRenderer method')
}

const rendererStyles = await readText('src/renderer/src/styles.css')
if (!rendererStyles.includes('@media (prefers-reduced-motion: reduce)')) {
  fail('renderer styles must respect the reduced-motion preference')
}

const localDataBootstrap = await readText('src/main/bootstrapLocalData.ts')
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
if (localDataBootstrap.includes('new SqliteMailRepository(')) {
  fail('production composition must not write mail through the legacy plaintext repository')
}
if (localDataBootstrap.includes('DeterministicFakeStringProtector')) {
  fail('production composition must not use the deterministic fake credential protector')
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
