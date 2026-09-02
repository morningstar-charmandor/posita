import { describe, expect, it, vi } from 'vitest'
import { buildGmailOriginalUrl, OpenProviderMailOriginalService } from './openProviderMailOriginal'

const request = {
  version: 1 as const,
  action: 'open-original' as const,
  accountId: 'account-work-1',
  messageId: 'message-1'
}
const found = {
  version: 1 as const,
  status: 'found' as const,
  accountId: request.accountId,
  messageId: request.messageId,
  provider: 'google' as const,
  mailboxAddress: 'owner+work@example.test',
  providerMessageId: 'provider/message?#%'
}

describe('OpenProviderMailOriginalService', () => {
  it('derives the Gmail target in main and returns no URL or provider ID', async () => {
    const open = vi.fn(async (_url: string) => undefined)
    const service = new OpenProviderMailOriginalService(
      { loadOriginalSourceLocator: async () => found },
      { open }
    )
    await expect(service.execute(request)).resolves.toEqual({
      ok: true,
      value: { version: 1, status: 'external-open-requested' }
    })
    expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://mail.google.com/mail/u/?authuser=owner%2Bwork%40example.test#all/provider%2Fmessage%3F%23%25'
    )
    expect(JSON.stringify(await service.execute(request))).not.toContain('provider/message')
  })

  it('returns safe exact missing, identity, binding, and opener failures', async () => {
    const opener = { open: async (_url: string) => undefined }
    await expect(new OpenProviderMailOriginalService({
      loadOriginalSourceLocator: async () => ({
        version: 1, status: 'missing', accountId: request.accountId, messageId: request.messageId
      })
    }, opener).execute(request)).resolves.toMatchObject({ error: { code: 'SOURCE_NOT_FOUND' } })
    await expect(new OpenProviderMailOriginalService({
      loadOriginalSourceLocator: async () => ({
        version: 1, status: 'account-identity-unavailable',
        accountId: request.accountId, messageId: request.messageId
      })
    }, opener).execute(request)).resolves.toMatchObject({
      error: { code: 'ACCOUNT_IDENTITY_UNAVAILABLE' }
    })
    await expect(new OpenProviderMailOriginalService({
      loadOriginalSourceLocator: async () => ({ ...found, messageId: 'message-other-1' })
    }, opener).execute(request)).resolves.toMatchObject({ error: { code: 'PROTOCOL_ERROR' } })
    await expect(new OpenProviderMailOriginalService({
      loadOriginalSourceLocator: async () => found
    }, { open: async () => { throw new Error('/private/browser') } }).execute(request))
      .resolves.toMatchObject({ error: { code: 'OPEN_FAILED', retryable: true } })
  })

  it('is unavailable without live composition', async () => {
    await expect(new OpenProviderMailOriginalService().execute(request)).resolves.toMatchObject({
      error: { code: 'OPEN_UNAVAILABLE', retryable: false }
    })
    expect(buildGmailOriginalUrl(found)).not.toContain('provider/message')
  })
})
