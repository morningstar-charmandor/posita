import {
  POSITA_PROTOCOL_VERSION,
  type LoadLiveMailMessageDetailResponseV1
} from '../../shared/contracts'
import {
  isLiveMailMessageDetailRequestV1,
  isLiveMailMessageDetailResultV1,
  type LiveMailMessageDetailRequestV1
} from '../../shared/liveMailDetail'
import type { ProviderMailSourceDetailSource } from './providerMailSourceDetail'

export class LiveMailMessageDetailService {
  constructor(private readonly source?: ProviderMailSourceDetailSource) {}

  async load(
    request: LiveMailMessageDetailRequestV1
  ): Promise<LoadLiveMailMessageDetailResponseV1> {
    if (!this.source || !isLiveMailMessageDetailRequestV1(request)) {
      return this.unavailable('Posita cannot inspect encrypted source mail in this state.', false)
    }
    try {
      const result = await this.source.loadMessageDetail(request)
      return isLiveMailMessageDetailResultV1(result)
        ? { ok: true, value: result }
        : this.unavailable('Posita returned an invalid source-mail response.', false, 'PROTOCOL_ERROR')
    } catch {
      return this.unavailable('Posita could not inspect encrypted source mail. Please try again.', true)
    }
  }

  private unavailable(
    message: string,
    retryable: boolean,
    code: 'DATABASE_UNAVAILABLE' | 'PROTOCOL_ERROR' = 'DATABASE_UNAVAILABLE'
  ): LoadLiveMailMessageDetailResponseV1 {
    return {
      ok: false,
      error: { version: POSITA_PROTOCOL_VERSION, code, message, retryable }
    }
  }
}
