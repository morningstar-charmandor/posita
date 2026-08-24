import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { fixtures } from '../../shared/fixtures'
import { MailApplicationService } from '../application/mailApplicationService'
import type { MailRepository } from '../application/mailRepository'
import { createLoadSnapshotHandler } from './applicationIpc'

const event = {} as IpcMainInvokeEvent
const repository: MailRepository = {
  initialize: () => undefined,
  seedIfEmpty: () => false,
  loadDataset: () => fixtures,
  close: () => undefined
}
const service = new MailApplicationService(repository, {
  now: () => new Date('2026-08-24T05:30:00.000Z')
})

describe('load snapshot IPC handler', () => {
  it('rejects untrusted senders before inspecting the request', () => {
    const handler = createLoadSnapshotHandler(service, () => false)

    expect(handler(event, { version: 1 })).toEqual({
      ok: false,
      error: {
        version: 1,
        code: 'UNTRUSTED_SENDER',
        message: 'This window is not allowed to access local mail data.',
        retryable: false
      }
    })
  })

  it('rejects unknown protocol versions and additional capabilities', () => {
    const handler = createLoadSnapshotHandler(service, () => true)

    expect(handler(event, { version: 2, channel: 'send-mail' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', retryable: false }
    })
  })

  it('returns the validated application snapshot for an allowed request', () => {
    const handler = createLoadSnapshotHandler(service, () => true)

    expect(handler(event, { version: 1 })).toEqual({
      ok: true,
      value: {
        version: 1,
        dataMode: 'fixture-seeded',
        loadedAt: '2026-08-24T05:30:00.000Z',
        dataset: fixtures
      }
    })
  })
})
