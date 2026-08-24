import { DatabaseSync } from 'node:sqlite'

export const openPositaDatabase = (path: string): DatabaseSync => {
  const database = new DatabaseSync(path, {
    allowExtension: false,
    defensive: true,
    timeout: 5_000
  })

  database.exec('PRAGMA foreign_keys = ON')
  database.exec('PRAGMA busy_timeout = 5000')

  if (path !== ':memory:') {
    database.exec('PRAGMA journal_mode = WAL')
    database.exec('PRAGMA synchronous = NORMAL')
  }

  return database
}
