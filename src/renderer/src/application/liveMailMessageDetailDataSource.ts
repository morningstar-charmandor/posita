import type { LoadLiveMailMessageDetailResponseV1 } from '@shared/contracts'
import type { LiveMailMessageDetailRequestV1 } from '@shared/liveMailDetail'

export interface LiveMailMessageDetailDataSource {
  loadMessageDetail(
    request: LiveMailMessageDetailRequestV1
  ): Promise<LoadLiveMailMessageDetailResponseV1>
}

export const desktopLiveMailMessageDetailDataSource: LiveMailMessageDetailDataSource = {
  loadMessageDetail: (request) => window.posita.loadLiveMailMessageDetail(request)
}
