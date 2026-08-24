import { describe, expect, it } from 'vitest'
import { fixtures } from '@shared/fixtures'
import { buildDailyBrief, createGroundedDraft, getMessage, getTopic, getTopicMessages } from './mailService'

describe('mail service', () => {
  it('groups the daily brief without losing or duplicating items', () => {
    const brief = buildDailyBrief(fixtures)
    const allIds = [...brief.needsYou, ...brief.waiting, ...brief.worthKnowing].map((item) => item.id)

    expect(brief.needsYou).toHaveLength(2)
    expect(brief.waiting).toHaveLength(1)
    expect(brief.worthKnowing).toHaveLength(1)
    expect(new Set(allIds).size).toBe(fixtures.briefItems.length)
  })

  it('keeps every Pulse timeline citation attached to a real source message', () => {
    const pulse = getTopic(fixtures, 'pulse')
    expect(pulse).toBeDefined()

    for (const event of pulse!.events) {
      const source = getMessage(fixtures, event.citationMessageId)
      expect(source, `missing source for ${event.id}`).toBeDefined()
      expect(pulse!.messageIds).toContain(event.citationMessageId)
    }
  })

  it('joins topic messages in the topic-defined order', () => {
    const pulse = getTopic(fixtures, 'pulse')!
    expect(getTopicMessages(fixtures, pulse).map((message) => message.id)).toEqual(pulse.messageIds)
  })

  it('creates a draft that reflects the agreed Pulse scope', () => {
    const draft = createGroundedDraft(getTopic(fixtures, 'pulse')!)
    expect(draft).toContain('onboarding')
    expect(draft).toContain('new dashboard')
    expect(draft).toContain('analytics')
    expect(draft).not.toMatch(/send automatically/i)
  })
})
