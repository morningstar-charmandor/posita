import type { ApplicationStateChangedEventV1 } from '../shared/contracts'
import { isApplicationStateChangedEvent } from '../shared/validation'

type Subscribe = (listener: (payload: unknown) => void) => () => void

export const createApplicationStateChangedClient = (subscribe: Subscribe) =>
  (listener: (event: ApplicationStateChangedEventV1) => void): (() => void) =>
    subscribe((payload) => {
      if (isApplicationStateChangedEvent(payload)) listener(Object.freeze(payload))
    })
