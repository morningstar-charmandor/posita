import type { LiveMailMessageDetailRequestV1 } from '../../shared/liveMailDetail'

export type ProviderMailOriginalSourceLocatorResultV1 =
  | {
      version: 1
      status: 'found'
      accountId: string
      messageId: string
      provider: 'google'
      mailboxAddress: string
      providerMessageId: string
    }
  | {
      version: 1
      status: 'missing' | 'account-identity-unavailable'
      accountId: string
      messageId: string
    }

export interface ProviderMailOriginalSourceLocatorSource {
  loadOriginalSourceLocator(
    request: LiveMailMessageDetailRequestV1
  ): Promise<ProviderMailOriginalSourceLocatorResultV1>
}

type JsonRecord = Record<string, unknown>
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key))
const idPattern = /^[A-Za-z0-9_-]{1,128}$/
const providerIdPattern = /^[\u0021-\u007E]{1,512}$/
const mailboxPattern = /^[^\s@]+@[^\s@]+$/

export const isProviderMailOriginalSourceLocatorResultV1 = (
  value: unknown
): value is ProviderMailOriginalSourceLocatorResultV1 => {
  if (!isRecord(value) || value.version !== 1 ||
      typeof value.status !== 'string' || typeof value.accountId !== 'string' ||
      !idPattern.test(value.accountId) || typeof value.messageId !== 'string' ||
      !idPattern.test(value.messageId)) return false
  if (value.status === 'missing' || value.status === 'account-identity-unavailable') {
    return hasOnlyKeys(value, ['version', 'status', 'accountId', 'messageId'])
  }
  return value.status === 'found' && hasOnlyKeys(value, [
    'version', 'status', 'accountId', 'messageId', 'provider', 'mailboxAddress',
    'providerMessageId'
  ]) && value.provider === 'google' && typeof value.mailboxAddress === 'string' &&
    value.mailboxAddress.length <= 320 && mailboxPattern.test(value.mailboxAddress) &&
    typeof value.providerMessageId === 'string' && providerIdPattern.test(value.providerMessageId)
}
