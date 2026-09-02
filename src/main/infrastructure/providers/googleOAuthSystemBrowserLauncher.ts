import { isExactGoogleAuthorizationUrl } from './googleOAuthProtocol'

export type GoogleOAuthOpenExternal = (
  url: string,
  options: Readonly<{ activate: true }>
) => Promise<void>

export type GoogleOAuthBrowserLaunchErrorCode =
  | 'INVALID_AUTHORIZATION_URL'
  | 'BROWSER_LAUNCH_FAILED'

export class GoogleOAuthBrowserLaunchError extends Error {
  constructor(
    readonly code: GoogleOAuthBrowserLaunchErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'GoogleOAuthBrowserLaunchError'
  }
}

/**
 * Narrow trusted-main boundary for one exact Google authorization URL. The
 * Electron delegate is injected so deterministic tests never open a browser.
 */
export class GoogleOAuthSystemBrowserLauncher {
  constructor(
    private readonly clientId: string,
    private readonly openExternal: GoogleOAuthOpenExternal
  ) {}

  async open(authorizationUrl: string): Promise<void> {
    if (!isExactGoogleAuthorizationUrl(authorizationUrl, this.clientId)) {
      throw new GoogleOAuthBrowserLaunchError(
        'INVALID_AUTHORIZATION_URL',
        'The Google authorization page could not be verified.',
        false
      )
    }
    try {
      await this.openExternal(authorizationUrl, { activate: true })
    } catch (error) {
      throw new GoogleOAuthBrowserLaunchError(
        'BROWSER_LAUNCH_FAILED',
        'Posita could not ask the system browser to open Google authorization.',
        true,
        { cause: error }
      )
    }
  }
}
