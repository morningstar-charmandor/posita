import { describe, expect, it, vi } from 'vitest'
import { GmailExternalUrlOpener, isTrustedGmailOriginalUrl } from './gmailExternalUrlOpener'

const trusted = 'https://mail.google.com/mail/u/?authuser=owner%40example.test#all/provider-message-1'

describe('GmailExternalUrlOpener', () => {
  it('allows only the exact HTTPS Gmail message target shape', async () => {
    expect(isTrustedGmailOriginalUrl(trusted)).toBe(true)
    for (const candidate of [
      'http://mail.google.com/mail/u/?authuser=owner%40example.test#all/provider-message-1',
      'https://evil.example/mail/u/?authuser=owner%40example.test#all/provider-message-1',
      'https://mail.google.com/mail/u/?authuser=owner%40example.test&next=https://evil.example#all/id',
      'https://mail.google.com/mail/u/?authuser=not-an-address#all/id',
      'https://mail.google.com/mail/u/?authuser=owner%40example.test#inbox'
    ]) expect(isTrustedGmailOriginalUrl(candidate)).toBe(false)

    const openExternal = vi.fn(async (_url: string) => undefined)
    await expect(new GmailExternalUrlOpener(openExternal).open(trusted)).resolves.toBeUndefined()
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(trusted)
  })

  it('refuses an untrusted target before calling the operating system', async () => {
    const openExternal = vi.fn(async (_url: string) => undefined)
    await expect(new GmailExternalUrlOpener(openExternal).open('https://evil.example/'))
      .rejects.toThrow('Untrusted Gmail original URL.')
    expect(openExternal).not.toHaveBeenCalled()
  })
})
