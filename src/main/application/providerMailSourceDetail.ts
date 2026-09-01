import type {
  LiveMailMessageDetailRequestV1,
  LiveMailMessageDetailResultV1
} from '../../shared/liveMailDetail'

/** Trusted source boundary for one bounded canonical message inspection. */
export interface ProviderMailSourceDetailSource {
  loadMessageDetail(
    request: LiveMailMessageDetailRequestV1
  ): Promise<LiveMailMessageDetailResultV1>
}
