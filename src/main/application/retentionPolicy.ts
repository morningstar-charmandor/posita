export const PRIVATE_ALPHA_RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000
const ABSOLUTE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/

export const isRetentionTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && ABSOLUTE_TIMESTAMP_PATTERN.test(value) &&
  Number.isFinite(Date.parse(value))

export class RetentionError extends Error {
  readonly code: 'RETENTION_CLOCK_INVALID' | 'RETENTION_TIMESTAMP_MISSING' |
    'RETENTION_TIMESTAMP_INVALID' | 'RETENTION_FIXTURE_REFERENCE_INVALID' |
    'RETENTION_COMPATIBILITY_UNRECOGNIZED'

  constructor(code: RetentionError['code'], message: string) {
    super(message)
    this.name = 'RetentionError'
    this.code = code
  }
}

export interface RetentionResult {
  cutoffAt: string
  changed: boolean
  removed: {
    messages: number
    topics: number
    briefItems: number
    people: number
  }
}

export const retentionCutoffTime = (
  now: Date,
  retentionDays = PRIVATE_ALPHA_RETENTION_DAYS
): number => {
  const nowTime = now.getTime()
  if (!Number.isFinite(nowTime) || !Number.isSafeInteger(retentionDays) || retentionDays < 1) {
    throw new RetentionError('RETENTION_CLOCK_INVALID', 'Retention clock or window is invalid.')
  }
  return nowTime - retentionDays * DAY_MS
}
