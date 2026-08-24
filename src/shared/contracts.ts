import type { MailDataset } from './domain'

export const POSITA_PROTOCOL_VERSION = 1 as const

export const IPC_CHANNELS = Object.freeze({
  loadSnapshot: 'posita:data:load-snapshot:v1'
})

export interface LoadSnapshotRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
}

export interface AppSnapshotV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  dataMode: 'fixture-seeded'
  loadedAt: string
  dataset: MailDataset
}

export type AppErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'DATABASE_UNAVAILABLE'
  | 'PROTOCOL_ERROR'

export interface AppErrorV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  code: AppErrorCodeV1
  message: string
  retryable: boolean
}

export type AppResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppErrorV1 }

export type LoadSnapshotResponseV1 = AppResultV1<AppSnapshotV1>

export interface PositaDesktopApi {
  platform: string
  prototypeMode: true
  loadSnapshot(): Promise<LoadSnapshotResponseV1>
}
