import type {
  OpenLiveMailOriginalRequestV1,
  OpenLiveMailOriginalResponseV1
} from '@shared/contracts'

export interface OpenLiveMailOriginalDataSource {
  openOriginal(request: OpenLiveMailOriginalRequestV1): Promise<OpenLiveMailOriginalResponseV1>
}

export const desktopOpenLiveMailOriginalDataSource: OpenLiveMailOriginalDataSource = {
  openOriginal: (request) => window.posita.openLiveMailOriginal(request)
}
