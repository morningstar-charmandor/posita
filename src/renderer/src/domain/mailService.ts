import type { BriefItem, BriefSection, MailDataset, Message, Topic } from '@shared/domain'

export interface BriefGroups {
  needsYou: BriefItem[]
  waiting: BriefItem[]
  worthKnowing: BriefItem[]
}

const bySection = (items: BriefItem[], section: BriefSection): BriefItem[] =>
  items.filter((item) => item.section === section)

export const buildDailyBrief = (dataset: MailDataset): BriefGroups => ({
  needsYou: bySection(dataset.briefItems, 'needs-you'),
  waiting: bySection(dataset.briefItems, 'waiting'),
  worthKnowing: bySection(dataset.briefItems, 'worth-knowing')
})

export const getTopic = (dataset: MailDataset, id: string): Topic | undefined =>
  dataset.topics.find((topic) => topic.id === id)

export const getMessage = (dataset: MailDataset, id: string): Message | undefined =>
  dataset.messages.find((message) => message.id === id)

export const getTopicMessages = (dataset: MailDataset, topic: Topic): Message[] =>
  topic.messageIds
    .map((id) => getMessage(dataset, id))
    .filter((message): message is Message => Boolean(message))

export const createGroundedDraft = (topic: Topic): string => {
  if (topic.id !== 'pulse') return ''
  return `Hi Rahul,\n\nConfirmed — let’s move forward with onboarding, the new dashboard, and migration notes for this release. We can move analytics to the following release as proposed.\n\nPlease update the launch plan, and let me know if you need anything else from me today.\n\nThanks,\nShafi`
}
