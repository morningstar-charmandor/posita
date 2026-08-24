import {
  POSITA_PROTOCOL_VERSION,
  type LoadApplicationStateResponseV1
} from '../shared/contracts'
import { isLoadApplicationStateResponse } from '../shared/validation'

export type InvokeLoadApplicationState = (request: { version: 1 }) => Promise<unknown>

export const createLoadApplicationStateClient = (invoke: InvokeLoadApplicationState) =>
  async (): Promise<LoadApplicationStateResponseV1> => {
    const response = await invoke({ version: POSITA_PROTOCOL_VERSION })
    if (isLoadApplicationStateResponse(response)) return response

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
