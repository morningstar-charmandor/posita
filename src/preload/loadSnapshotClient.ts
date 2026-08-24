import {
  POSITA_PROTOCOL_VERSION,
  type LoadSnapshotResponseV1
} from '../shared/contracts'
import { isLoadSnapshotResponse } from '../shared/validation'

export type InvokeLoadSnapshot = (request: { version: 1 }) => Promise<unknown>

export const createLoadSnapshotClient = (invoke: InvokeLoadSnapshot) =>
  async (): Promise<LoadSnapshotResponseV1> => {
    const response = await invoke({ version: POSITA_PROTOCOL_VERSION })
    if (isLoadSnapshotResponse(response)) return response

    return {
      ok: false,
      error: {
        version: POSITA_PROTOCOL_VERSION,
        code: 'PROTOCOL_ERROR',
        message: 'The desktop backend returned an unsupported response.',
        retryable: false
      }
    }
  }
