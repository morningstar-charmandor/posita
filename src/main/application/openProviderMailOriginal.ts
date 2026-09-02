import {
  POSITA_PROTOCOL_VERSION,
  type OpenLiveMailOriginalRequestV1,
  type OpenLiveMailOriginalResponseV1
} from '../../shared/contracts'
import { isLiveMailMessageDetailRequestV1 } from '../../shared/liveMailDetail'
import type {
  ProviderMailOriginalSourceLocatorSource,
  ProviderMailOriginalSourceLocatorResultV1
} from './providerMailOriginalSource'

export interface ExternalUrlOpener {
  open(url: string): Promise<void>
}

export const buildGmailOriginalUrl = (
  locator: Extract<ProviderMailOriginalSourceLocatorResultV1, { status: 'found' }>
): string => {
  const target = new URL('https://mail.google.com/mail/u/')
  target.searchParams.set('authuser', locator.mailboxAddress)
  target.hash = `all/${encodeURIComponent(locator.providerMessageId)}`
  return target.href
}

export class OpenProviderMailOriginalService {
  constructor(
    private readonly source?: ProviderMailOriginalSourceLocatorSource,
    private readonly opener?: ExternalUrlOpener
  ) {}

  async execute(request: OpenLiveMailOriginalRequestV1): Promise<OpenLiveMailOriginalResponseV1> {
    const detailRequest = { version: request.version, accountId: request.accountId, messageId: request.messageId }
    if (!this.source || !this.opener) return this.fail('OPEN_UNAVAILABLE', 'Opening Gmail is unavailable in this state.', false)
    if (request.action !== 'open-original' || !isLiveMailMessageDetailRequestV1(detailRequest)) {
      return this.fail('INVALID_REQUEST', 'The open-original request was invalid.', false)
    }
    try {
      const locator = await this.source.loadOriginalSourceLocator(detailRequest)
      if (locator.status === 'missing') {
        return this.fail('SOURCE_NOT_FOUND', 'The original source is no longer retained locally.', false)
      }
      if (locator.status === 'account-identity-unavailable') {
        return this.fail('ACCOUNT_IDENTITY_UNAVAILABLE', 'Posita cannot identify the Gmail account for this source.', false)
      }
      if (locator.status !== 'found') {
        return this.fail('PROTOCOL_ERROR', 'Posita returned an invalid original-source response.', false)
      }
      if (locator.accountId !== request.accountId || locator.messageId !== request.messageId) {
        return this.fail('PROTOCOL_ERROR', 'Posita returned an invalid original-source response.', false)
      }
      await this.opener.open(buildGmailOriginalUrl(locator))
      return { ok: true, value: { version: POSITA_PROTOCOL_VERSION, status: 'external-open-requested' } }
    } catch {
      return this.fail('OPEN_FAILED', 'Posita could not ask the system browser to open Gmail.', true)
    }
  }

  private fail(
    code: Exclude<OpenLiveMailOriginalResponseV1, { ok: true }>['error']['code'],
    message: string,
    retryable: boolean
  ): OpenLiveMailOriginalResponseV1 {
    return { ok: false, error: { version: POSITA_PROTOCOL_VERSION, code, message, retryable } }
  }
}
