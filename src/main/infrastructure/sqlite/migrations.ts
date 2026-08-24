import type { DatabaseSync } from 'node:sqlite'
import { RepositoryError } from '../../application/mailRepository'

interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_local_mail_schema',
    sql: `
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        address TEXT NOT NULL UNIQUE,
        tone TEXT NOT NULL CHECK (tone IN ('sage', 'blue', 'sand')),
        display_order INTEGER NOT NULL UNIQUE
      ) STRICT;

      CREATE TABLE people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        initials TEXT NOT NULL,
        role TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        display_order INTEGER NOT NULL UNIQUE
      ) STRICT;

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL REFERENCES people(id),
        subject TEXT NOT NULL,
        preview TEXT NOT NULL,
        body TEXT NOT NULL,
        received_at TEXT NOT NULL,
        is_read INTEGER NOT NULL CHECK (is_read IN (0, 1)),
        display_order INTEGER NOT NULL UNIQUE
      ) STRICT;

      CREATE INDEX messages_account_received_idx
        ON messages(account_id, received_at);
      CREATE INDEX messages_thread_idx ON messages(thread_id);

      CREATE TABLE topics (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        eyebrow TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('needs-user', 'waiting', 'active')),
        priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
        next_step TEXT NOT NULL,
        display_order INTEGER NOT NULL UNIQUE
      ) STRICT;

      CREATE TABLE topic_participants (
        topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        person_id TEXT NOT NULL REFERENCES people(id),
        position INTEGER NOT NULL,
        PRIMARY KEY (topic_id, person_id),
        UNIQUE (topic_id, position)
      ) STRICT;

      CREATE TABLE topic_messages (
        topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        message_id TEXT NOT NULL REFERENCES messages(id),
        position INTEGER NOT NULL,
        PRIMARY KEY (topic_id, message_id),
        UNIQUE (topic_id, position)
      ) STRICT;

      CREATE TABLE timeline_events (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        date_label TEXT NOT NULL,
        description TEXT NOT NULL,
        citation_message_id TEXT NOT NULL REFERENCES messages(id),
        position INTEGER NOT NULL,
        UNIQUE (topic_id, position)
      ) STRICT;

      CREATE TABLE brief_items (
        id TEXT PRIMARY KEY,
        section TEXT NOT NULL CHECK (section IN ('needs-you', 'waiting', 'worth-knowing')),
        topic_id TEXT NOT NULL REFERENCES topics(id),
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        reason TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        due_label TEXT,
        display_order INTEGER NOT NULL UNIQUE
      ) STRICT;

      CREATE TABLE brief_citations (
        brief_item_id TEXT NOT NULL REFERENCES brief_items(id) ON DELETE CASCADE,
        message_id TEXT NOT NULL REFERENCES messages(id),
        position INTEGER NOT NULL,
        PRIMARY KEY (brief_item_id, message_id),
        UNIQUE (brief_item_id, position)
      ) STRICT;

      CREATE TABLE sync_state (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        provider_cursor TEXT,
        last_success_at TEXT,
        last_error_code TEXT
      ) STRICT;

      CREATE TABLE derived_artifacts (
        id TEXT PRIMARY KEY,
        artifact_type TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        generator_version TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        source_message_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE user_corrections (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        command_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        confirmation_id TEXT NOT NULL,
        result_code TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
    `
  }
]

export const CURRENT_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0

interface VersionRow {
  version: number
}

export const getSchemaVersion = (database: DatabaseSync): number => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    ) STRICT;
  `)

  const row = database
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as VersionRow | undefined

  return row?.version ?? 0
}

export const applyMigrations = (database: DatabaseSync): void => {
  const currentVersion = getSchemaVersion(database)

  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new RepositoryError(
      'MIGRATION_UNSUPPORTED',
      `Database schema ${currentVersion} is newer than supported schema ${CURRENT_SCHEMA_VERSION}.`
    )
  }

  const recordMigration = database.prepare(`
    INSERT INTO schema_migrations (version, name, applied_at)
    VALUES (?, ?, datetime('now'))
  `)

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue

    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(migration.sql)
      recordMigration.run(migration.version, migration.name)
      database.exec('COMMIT')
    } catch (error) {
      if (database.isTransaction) database.exec('ROLLBACK')
      throw new RepositoryError(
        'DATABASE_OPERATION_FAILED',
        `Failed to apply local database migration ${migration.version}.`,
        { cause: error }
      )
    }
  }
}
