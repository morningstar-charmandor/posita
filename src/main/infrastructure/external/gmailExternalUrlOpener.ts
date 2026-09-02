import type { ExternalUrlOpener } from '../../application/openProviderMailOriginal'

export type OpenExternal = (url: string) => Promise<void>

export const isTrustedGmailOriginalUrl = (candidate: string): boolean => {
  try {
    const url = new URL(candidate)
    const keys = Array.from(url.searchParams.keys())
    const authuser = url.searchParams.get('authuser')
    return url.protocol === 'https:' && url.hostname === 'mail.google.com' &&
      url.port === '' && url.username === '' && url.password === '' &&
      url.pathname === '/mail/u/' && keys.length === 1 && keys[0] === 'authuser' &&
      authuser !== null && authuser.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(authuser) &&
      url.hash.startsWith('#all/') && url.hash.length > 5 && url.hash.length <= 2052
  } catch {
    return false
  }
}

export class GmailExternalUrlOpener implements ExternalUrlOpener {
  constructor(private readonly openExternal: OpenExternal) {}

  async open(url: string): Promise<void> {
    if (!isTrustedGmailOriginalUrl(url)) throw new Error('Untrusted Gmail original URL.')
    await this.openExternal(url)
  }
}
