/**
 * Migrations as ordered SQL strings. Generated from drizzle-kit output (`pnpm --filter @epistemics/db generate`)
 * and copied here so every executor (node, web worker, tauri) can apply them without filesystem access.
 * Each executor keeps a `_migrations(name TEXT PRIMARY KEY, applied_at INTEGER)` table.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [];
