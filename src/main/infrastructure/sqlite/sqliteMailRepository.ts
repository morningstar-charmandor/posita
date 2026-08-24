import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type {
  Account,
  BriefItem,
  MailDataset,
  Message,
  Person,
  TimelineEvent,
  Topic
} from '../../../shared/domain'
import { isMailDataset } from '../../../shared/validation'
import { RepositoryError, type MailRepository } from '../../application/mailRepository'
import { applyMigrations } from './migrations'

type SqlRow = Record<string, string | number | bigint | null>

type SqlParameter = string | number | bigint | null

const allRows = (statement: StatementSync, ...parameters: SqlParameter[]): SqlRow[] =>
  statement.all(...parameters) as SqlRow[]

const text = (row: SqlRow, key: string): string => {
  const value = row[key]
  if (typeof value !== 'string') throw new TypeError(`Expected text column ${key}.`)
  return value
}

const integer = (row: SqlRow, key: string): number => {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`Expected integer column ${key}.`)
  }
  return value
}

const optionalText = (row: SqlRow, key: string): string | undefined => {
  const value = row[key]
  if (value === null) return undefined
  if (typeof value !== 'string') throw new TypeError(`Expected nullable text column ${key}.`)
  return value
}

/** Gate 2A compatibility reader/writer used only by the controlled Gate 2C migration and tests. */
export class SqliteMailRepository implements MailRepository {
  constructor(private readonly database: DatabaseSync) {}

  initialize(): void {
    applyMigrations(this.database)
  }

  seedIfEmpty(dataset: MailDataset): boolean {
    try {
      const countRow = this.database.prepare('SELECT COUNT(*) AS count FROM accounts').get() as SqlRow
      if (integer(countRow, 'count') > 0) return false

      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.insertDataset(dataset)
        this.database.exec('COMMIT')
        return true
      } catch (error) {
        if (this.database.isTransaction) this.database.exec('ROLLBACK')
        throw error
      }
    } catch (error) {
      if (error instanceof RepositoryError) throw error
      throw new RepositoryError(
        'DATABASE_OPERATION_FAILED',
        'Failed to seed the local mail database.',
        { cause: error }
      )
    }
  }

  loadDataset(): MailDataset {
    try {
      const accounts: Account[] = allRows(this.database.prepare(`
        SELECT id, label, address, tone FROM accounts ORDER BY display_order
      `)).map((row) => ({
        id: text(row, 'id'),
        label: text(row, 'label'),
        address: text(row, 'address'),
        tone: text(row, 'tone') as Account['tone']
      }))

      const people: Person[] = allRows(this.database.prepare(`
        SELECT id, name, initials, role, email FROM people ORDER BY display_order
      `)).map((row) => ({
        id: text(row, 'id'),
        name: text(row, 'name'),
        initials: text(row, 'initials'),
        role: text(row, 'role'),
        email: text(row, 'email')
      }))

      const messages: Message[] = allRows(this.database.prepare(`
        SELECT id, thread_id, account_id, sender_id, subject, preview, body,
               received_at, is_read
        FROM messages
        ORDER BY display_order
      `)).map((row) => ({
        id: text(row, 'id'),
        threadId: text(row, 'thread_id'),
        accountId: text(row, 'account_id'),
        senderId: text(row, 'sender_id'),
        subject: text(row, 'subject'),
        preview: text(row, 'preview'),
        body: text(row, 'body'),
        receivedAt: text(row, 'received_at'),
        isRead: integer(row, 'is_read') === 1
      }))

      const participantQuery = this.database.prepare(`
        SELECT person_id FROM topic_participants
        WHERE topic_id = ? ORDER BY position
      `)
      const messageQuery = this.database.prepare(`
        SELECT message_id FROM topic_messages
        WHERE topic_id = ? ORDER BY position
      `)
      const eventQuery = this.database.prepare(`
        SELECT id, date_label, description, citation_message_id
        FROM timeline_events
        WHERE topic_id = ? ORDER BY position
      `)

      const topics: Topic[] = allRows(this.database.prepare(`
        SELECT id, name, eyebrow, summary, status, priority, next_step
        FROM topics
        ORDER BY display_order
      `)).map((row) => {
        const topicId = text(row, 'id')
        const events: TimelineEvent[] = allRows(eventQuery, topicId).map((eventRow) => ({
          id: text(eventRow, 'id'),
          dateLabel: text(eventRow, 'date_label'),
          description: text(eventRow, 'description'),
          citationMessageId: text(eventRow, 'citation_message_id')
        }))

        return {
          id: topicId,
          name: text(row, 'name'),
          eyebrow: text(row, 'eyebrow'),
          summary: text(row, 'summary'),
          status: text(row, 'status') as Topic['status'],
          priority: text(row, 'priority') as Topic['priority'],
          participantIds: allRows(participantQuery, topicId)
            .map((participantRow) => text(participantRow, 'person_id')),
          messageIds: allRows(messageQuery, topicId)
            .map((messageRow) => text(messageRow, 'message_id')),
          events,
          nextStep: text(row, 'next_step')
        }
      })

      const citationQuery = this.database.prepare(`
        SELECT message_id FROM brief_citations
        WHERE brief_item_id = ? ORDER BY position
      `)

      const briefItems: BriefItem[] = allRows(this.database.prepare(`
        SELECT id, section, topic_id, title, detail, reason, account_id, due_label
        FROM brief_items
        ORDER BY display_order
      `)).map((row) => {
        const itemId = text(row, 'id')
        const citationRows = citationQuery.all(itemId) as SqlRow[]
        return {
          id: itemId,
          section: text(row, 'section') as BriefItem['section'],
          topicId: text(row, 'topic_id'),
          title: text(row, 'title'),
          detail: text(row, 'detail'),
          reason: text(row, 'reason'),
          accountId: text(row, 'account_id'),
          citationMessageIds: citationRows.map((citationRow) => text(citationRow, 'message_id')),
          dueLabel: optionalText(row, 'due_label')
        }
      })

      const dataset: MailDataset = { accounts, people, messages, topics, briefItems }
      if (!isMailDataset(dataset)) throw new TypeError('Local mail data failed domain validation.')
      return dataset
    } catch (error) {
      if (error instanceof RepositoryError) throw error
      throw new RepositoryError(
        'DATABASE_OPERATION_FAILED',
        'Failed to load the local mail database.',
        { cause: error }
      )
    }
  }

  close(): void {
    if (this.database.isOpen) this.database.close()
  }

  private insertDataset(dataset: MailDataset): void {
    const insertAccount = this.database.prepare(`
      INSERT INTO accounts (id, label, address, tone, display_order)
      VALUES (?, ?, ?, ?, ?)
    `)
    dataset.accounts.forEach((account, index) =>
      insertAccount.run(account.id, account.label, account.address, account.tone, index))

    const insertPerson = this.database.prepare(`
      INSERT INTO people (id, name, initials, role, email, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    dataset.people.forEach((person, index) =>
      insertPerson.run(person.id, person.name, person.initials, person.role, person.email, index))

    const insertMessage = this.database.prepare(`
      INSERT INTO messages (
        id, thread_id, account_id, sender_id, subject, preview, body,
        received_at, is_read, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    dataset.messages.forEach((message, index) => insertMessage.run(
      message.id,
      message.threadId,
      message.accountId,
      message.senderId,
      message.subject,
      message.preview,
      message.body,
      message.receivedAt,
      message.isRead ? 1 : 0,
      index
    ))

    const insertTopic = this.database.prepare(`
      INSERT INTO topics (
        id, name, eyebrow, summary, status, priority, next_step, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertParticipant = this.database.prepare(`
      INSERT INTO topic_participants (topic_id, person_id, position) VALUES (?, ?, ?)
    `)
    const insertTopicMessage = this.database.prepare(`
      INSERT INTO topic_messages (topic_id, message_id, position) VALUES (?, ?, ?)
    `)
    const insertEvent = this.database.prepare(`
      INSERT INTO timeline_events (
        id, topic_id, date_label, description, citation_message_id, position
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)

    dataset.topics.forEach((topic, topicIndex) => {
      insertTopic.run(
        topic.id,
        topic.name,
        topic.eyebrow,
        topic.summary,
        topic.status,
        topic.priority,
        topic.nextStep,
        topicIndex
      )
      topic.participantIds.forEach((personId, index) =>
        insertParticipant.run(topic.id, personId, index))
      topic.messageIds.forEach((messageId, index) =>
        insertTopicMessage.run(topic.id, messageId, index))
      topic.events.forEach((event, index) => insertEvent.run(
        event.id,
        topic.id,
        event.dateLabel,
        event.description,
        event.citationMessageId,
        index
      ))
    })

    const insertBrief = this.database.prepare(`
      INSERT INTO brief_items (
        id, section, topic_id, title, detail, reason, account_id, due_label,
        display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertCitation = this.database.prepare(`
      INSERT INTO brief_citations (brief_item_id, message_id, position) VALUES (?, ?, ?)
    `)

    dataset.briefItems.forEach((item, itemIndex) => {
      insertBrief.run(
        item.id,
        item.section,
        item.topicId,
        item.title,
        item.detail,
        item.reason,
        item.accountId,
        item.dueLabel ?? null,
        itemIndex
      )
      item.citationMessageIds.forEach((messageId, index) =>
        insertCitation.run(item.id, messageId, index))
    })
  }
}
