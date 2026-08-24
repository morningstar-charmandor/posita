export type AccountTone = 'sage' | 'blue' | 'sand'
export type BriefSection = 'needs-you' | 'waiting' | 'worth-knowing'
export type Priority = 'high' | 'medium' | 'low'

export interface Account {
  id: string
  label: string
  address: string
  tone: AccountTone
}

export interface Person {
  id: string
  name: string
  initials: string
  role: string
  email: string
}

export interface Message {
  id: string
  threadId: string
  accountId: string
  senderId: string
  subject: string
  preview: string
  body: string
  receivedAt: string
  receivedAtIso?: string
  isRead: boolean
}

export interface TimelineEvent {
  id: string
  dateLabel: string
  description: string
  citationMessageId: string
}

export interface Topic {
  id: string
  name: string
  eyebrow: string
  summary: string
  status: 'needs-user' | 'waiting' | 'active'
  priority: Priority
  participantIds: string[]
  messageIds: string[]
  events: TimelineEvent[]
  nextStep: string
}

export interface BriefItem {
  id: string
  section: BriefSection
  topicId: string
  title: string
  detail: string
  reason: string
  accountId: string
  citationMessageIds: string[]
  dueLabel?: string
}

export interface MailDataset {
  accounts: Account[]
  people: Person[]
  messages: Message[]
  topics: Topic[]
  briefItems: BriefItem[]
}
