import initial from './001_initial'

export type Migration = { version: number; name: string; sql: string }

/**
 * Ordered list of migrations. Add new ones as `NNN_name.ts` (default export: SQL
 * string) and append them here. Never edit a migration that has shipped.
 */
export const migrations: Migration[] = [{ version: 1, name: '001_initial', sql: initial }]
