import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  GOOGLE_OAUTH_CLIENT_CONFIGURATION_FILE,
  loadGoogleOAuthClientConfiguration
} from './googleOAuthClientConfiguration'

const clientId = '123456789-posita.apps.googleusercontent.com'
const directories: string[] = []

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'posita-google-client-'))
  directories.push(directory)
  return directory
}

const writeConfiguration = async (
  directory: string,
  value: unknown,
  mode = 0o600
): Promise<string> => {
  const path = join(directory, GOOGLE_OAUTH_CLIENT_CONFIGURATION_FILE)
  await writeFile(path, JSON.stringify(value), { mode })
  await chmod(path, mode)
  return path
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })))
})

describe('loadGoogleOAuthClientConfiguration', () => {
  it('loads one exact owner-readable client identifier from application data', async () => {
    const directory = await createDirectory()
    await writeConfiguration(directory, { version: 1, provider: 'google', clientId })

    await expect(loadGoogleOAuthClientConfiguration(directory)).resolves.toEqual({
      status: 'available',
      configuration: { version: 1, provider: 'google', clientId }
    })
  })

  it('reports a missing file without searching another location', async () => {
    const directory = await createDirectory()

    await expect(loadGoogleOAuthClientConfiguration(directory)).resolves.toEqual({
      status: 'missing'
    })
  })

  it('rejects a relative application-data location', async () => {
    await expect(loadGoogleOAuthClientConfiguration('relative/config')).resolves.toEqual({
      status: 'invalid',
      code: 'UNSAFE_CONFIGURATION_LOCATION'
    })
  })

  it('rejects group-readable or world-readable files on macOS', async () => {
    const directory = await createDirectory()
    await writeConfiguration(directory, { version: 1, provider: 'google', clientId }, 0o644)

    await expect(loadGoogleOAuthClientConfiguration(directory, 'darwin')).resolves.toEqual({
      status: 'invalid',
      code: 'UNSAFE_CONFIGURATION_PERMISSIONS'
    })
  })

  it('refuses symlinks even when their target is valid and private', async () => {
    const directory = await createDirectory()
    const target = join(directory, 'target.json')
    await writeFile(target, JSON.stringify({ version: 1, provider: 'google', clientId }), {
      mode: 0o600
    })
    await symlink(target, join(directory, GOOGLE_OAUTH_CLIENT_CONFIGURATION_FILE))

    const result = await loadGoogleOAuthClientConfiguration(directory)
    expect(result).toEqual({ status: 'invalid', code: 'UNSAFE_CONFIGURATION_FILE' })
  })

  it.each([
    ['extra secret field', {
      version: 1,
      provider: 'google',
      clientId,
      clientSecret: 'must-not-enter-posita-config'
    }],
    ['wrong provider', { version: 1, provider: 'example', clientId }],
    ['invalid client id', { version: 1, provider: 'google', clientId: 'not-a-client-id' }],
    ['unknown version', { version: 2, provider: 'google', clientId }]
  ])('rejects %s', async (_label, value) => {
    const directory = await createDirectory()
    await writeConfiguration(directory, value)

    await expect(loadGoogleOAuthClientConfiguration(directory)).resolves.toEqual({
      status: 'invalid',
      code: 'INVALID_CONFIGURATION_CONTENT'
    })
  })

  it('rejects an oversized configuration before parsing', async () => {
    const directory = await createDirectory()
    const path = join(directory, GOOGLE_OAUTH_CLIENT_CONFIGURATION_FILE)
    await writeFile(path, 'x'.repeat(4_097), { mode: 0o600 })

    await expect(loadGoogleOAuthClientConfiguration(directory)).resolves.toEqual({
      status: 'invalid',
      code: 'UNSAFE_CONFIGURATION_FILE'
    })
  })
})
