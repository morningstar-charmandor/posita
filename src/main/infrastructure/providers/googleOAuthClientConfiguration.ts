import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { GOOGLE_OAUTH_CLIENT_ID_PATTERN } from './googleOAuthProtocol'

export const GOOGLE_OAUTH_CLIENT_CONFIGURATION_FILE = 'google-oauth-client.json'
const MAX_CONFIGURATION_BYTES = 4_096
const ALLOWED_KEYS = ['version', 'provider', 'clientId'] as const

export interface GoogleOAuthClientConfigurationV1 {
  version: 1
  provider: 'google'
  clientId: string
}

export type GoogleOAuthClientConfigurationFailureCode =
  | 'UNSAFE_CONFIGURATION_LOCATION'
  | 'UNSAFE_CONFIGURATION_FILE'
  | 'UNSAFE_CONFIGURATION_PERMISSIONS'
  | 'INVALID_CONFIGURATION_CONTENT'
  | 'CONFIGURATION_UNAVAILABLE'

export type GoogleOAuthClientConfigurationLoadResult =
  | { status: 'missing' }
  | { status: 'available'; configuration: GoogleOAuthClientConfigurationV1 }
  | { status: 'invalid'; code: GoogleOAuthClientConfigurationFailureCode }

const invalid = (
  code: GoogleOAuthClientConfigurationFailureCode
): GoogleOAuthClientConfigurationLoadResult => ({ status: 'invalid', code })

const isNodeError = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && 'code' in value

const parseConfiguration = (text: string): GoogleOAuthClientConfigurationV1 | undefined => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== ALLOWED_KEYS.length ||
      !keys.every((key) => ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) ||
      record.version !== 1 || record.provider !== 'google' ||
      typeof record.clientId !== 'string' ||
      !GOOGLE_OAUTH_CLIENT_ID_PATTERN.test(record.clientId)) return undefined
  return {
    version: 1,
    provider: 'google',
    clientId: record.clientId
  }
}

/**
 * Loads the one local-only Google desktop client identifier from Posita's
 * application-data directory. The file is never searched for in the repository,
 * and its contents are never returned to renderer contracts or logs.
 */
export const loadGoogleOAuthClientConfiguration = async (
  userDataDirectory: string,
  platform: NodeJS.Platform = process.platform
): Promise<GoogleOAuthClientConfigurationLoadResult> => {
  if (!isAbsolute(userDataDirectory)) return invalid('UNSAFE_CONFIGURATION_LOCATION')
  const path = join(userDataDirectory, GOOGLE_OAUTH_CLIENT_CONFIGURATION_FILE)
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return { status: 'missing' }
    if (isNodeError(error) && error.code === 'ELOOP') return invalid('UNSAFE_CONFIGURATION_FILE')
    return invalid('CONFIGURATION_UNAVAILABLE')
  }

  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_CONFIGURATION_BYTES) {
      return invalid('UNSAFE_CONFIGURATION_FILE')
    }
    if (platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
      return invalid('UNSAFE_CONFIGURATION_PERMISSIONS')
    }
    const configuration = parseConfiguration(await handle.readFile({ encoding: 'utf8' }))
    return configuration === undefined
      ? invalid('INVALID_CONFIGURATION_CONTENT')
      : { status: 'available', configuration }
  } catch {
    return invalid('CONFIGURATION_UNAVAILABLE')
  } finally {
    await handle.close().catch(() => undefined)
  }
}
