import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'

export type MailProvider = 'google'

export interface ProviderAccountRecordV1 {
  version: 1
  accountId: string
  provider: MailProvider
  providerAccountId: string
  consentVersion: typeof GOOGLE_CONNECT_CONSENT.consentVersion
  connectedAt: string
}

export type SyncFailureCode =
  | 'AUTHENTICATION_EXPIRED'
  | 'PERMISSION_REVOKED'
  | 'QUOTA_EXHAUSTED'
  | 'OFFLINE'
  | 'MALFORMED_PAYLOAD'
  | 'INVALID_CURSOR'
  | 'PROVIDER_UNAVAILABLE'

export interface ProviderSyncStateV1 {
  version: 1
  accountId: string
  provider: MailProvider
  status: 'idle' | 'syncing' | 'error' | 'disabled'
  cursor?: string
  lastSuccessAt?: string
  lastErrorCode?: SyncFailureCode
}

export interface AccountStateRepository {
  saveProviderAccount(record: ProviderAccountRecordV1): void
  loadProviderAccount(accountId: string): ProviderAccountRecordV1 | undefined
  saveSyncState(state: ProviderSyncStateV1): void
  loadSyncState(accountId: string): ProviderSyncStateV1 | undefined
  deleteAccountState(accountId: string): boolean
  deleteAllAccountState(): boolean
}

export class AccountStateError extends Error {
  readonly code: 'INVALID_ACCOUNT_STATE' | 'ACCOUNT_STATE_STORAGE_FAILED'

  constructor(code: AccountStateError['code'], message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AccountStateError'
    this.code = code
  }
}

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const PROVIDER_ACCOUNT_ID_PATTERN = /^[A-Za-z0-9._:@+-]{1,512}$/
const MAX_CURSOR_LENGTH = 16_384

export const isAccountId = (value: unknown): value is string =>
  typeof value === 'string' && ACCOUNT_ID_PATTERN.test(value)

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value))

export const isProviderAccountRecordV1 = (
  value: unknown
): value is ProviderAccountRecordV1 => {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).every((key) => [
    'version', 'accountId', 'provider', 'providerAccountId', 'consentVersion', 'connectedAt'
  ].includes(key)) &&
    record.version === 1 &&
    isAccountId(record.accountId) &&
    record.provider === 'google' &&
    typeof record.providerAccountId === 'string' &&
    PROVIDER_ACCOUNT_ID_PATTERN.test(record.providerAccountId) &&
    record.consentVersion === GOOGLE_CONNECT_CONSENT.consentVersion &&
    isTimestamp(record.connectedAt)
}

const syncFailureCodes = new Set<SyncFailureCode>([
  'AUTHENTICATION_EXPIRED',
  'PERMISSION_REVOKED',
  'QUOTA_EXHAUSTED',
  'OFFLINE',
  'MALFORMED_PAYLOAD',
  'INVALID_CURSOR',
  'PROVIDER_UNAVAILABLE'
])

export const isProviderSyncStateV1 = (value: unknown): value is ProviderSyncStateV1 => {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  const statusValid = state.status === 'idle' || state.status === 'syncing' ||
    state.status === 'error' || state.status === 'disabled'
  const cursorValid = state.cursor === undefined ||
    (typeof state.cursor === 'string' && state.cursor.length > 0 &&
      state.cursor.length <= MAX_CURSOR_LENGTH)
  const successValid = state.lastSuccessAt === undefined || isTimestamp(state.lastSuccessAt)
  const errorValid = state.lastErrorCode === undefined ||
    (typeof state.lastErrorCode === 'string' &&
      syncFailureCodes.has(state.lastErrorCode as SyncFailureCode))

  return Object.keys(state).every((key) => [
    'version', 'accountId', 'provider', 'status', 'cursor', 'lastSuccessAt', 'lastErrorCode'
  ].includes(key)) &&
    state.version === 1 &&
    isAccountId(state.accountId) &&
    state.provider === 'google' &&
    statusValid && cursorValid && successValid && errorValid &&
    (state.status === 'error' ? state.lastErrorCode !== undefined : state.lastErrorCode === undefined)
}
