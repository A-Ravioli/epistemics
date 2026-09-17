# Cross-device sync

Epistemics is local-first: every shell (web, desktop) keeps a complete SQLite database and works without
a network. Signing in to a Supabase project adds background replication between devices. This document is
the protocol reference; setup is in [supabase/README.md](../supabase/README.md).

## Model

Row-level, last-writer-wins replication of the learner's tables through the server. Every synced row has

| column | set by | meaning |
|---|---|---|
| primary key | app | UUIDv7 ids, or the natural composite key (`curricula(id, version)`, `concept_state(course_id, concept_id)`, `settings(key)`, …) |
| `updated_at` | app, ms since epoch | the client clock at the last local write; the LWW version |
| `deleted_at` | app | soft-delete tombstone where deletion exists (`courses`, `curricula`, `sources`, `chunks`, `fsrs_params`, `settings`) |
| `user_id` | server (default `auth.uid()`) | owner; part of every primary key server-side; RLS restricts all access to the owner |
| `server_updated_at` | server trigger | wall-clock of the accepted write; the pull cursor |

Tables synced: `curricula`, `sources`, `chunks` (without `embedding`), `gen_cache`, `courses`, `cards`, `review_log`,
`concept_state`, `fsrs_params`, `sessions`, `turns`, `receipts`, `jol`, `llm_calls`, `settings`.

Not synced: `concepts`, `items`, `concept_edges` (projections rebuilt from `curricula.curriculum_json`),
`chunks.embedding` (recomputed locally with the hash embedder), `outbox`, `_sync_state`, `_migrations`, and
settings keys beginning with `llm`, `sync` or `supabase` (device/transport configuration).

`review_log` and `llm_calls` are append-only and have no `updated_at` column locally; `review_time` /
`created_at` play that role on the wire, and a pull never overwrites an existing row of these tables.

## Local bookkeeping (`packages/db`)

- Every repository write sets `updated_at = now` and inserts one `outbox(id, table_name, row_id, op)` row per
  touched primary key in the same transaction. `row_id` is the JSON-encoded key: `"<id>"`, or
  `{"id":…,"version":…}` / `{"courseId":…,"conceptId":…}` for composite keys.
- Deletions that must reach other devices are soft (`deleted_at`); readers filter tombstones. Purely local
  deletes (`deleteCards`, `deleteCached`, `pruneCache`, embeddings) neither tombstone nor enqueue.
- Writes coming from a pull pass `{ fromSync: true }` (repositories) or go through raw executor statements
  (the engine), so pulled rows never re-enter the outbox.
- `_sync_state(table_name, last_pull_server_ts, last_push_at, last_pull_at)` holds per-table cursors.

## Engine (`packages/sync`)

`createSyncEngine({ db, executor, client, userId, tables?, onPulled?, … })` with `push()`, `pull()`,
`syncOnce()`, `requestSync()` (debounced), `start({ intervalMs, onStatus })`, `stop()`, `status()`.

**Push.** Read the outbox oldest-first in batches of 500, group by table, dedupe keys, load the current
local rows, and `upsert` them to PostgREST with `user_id` and `updated_at` (`onConflict = user_id + pk`).
Rows that no longer exist locally are dropped. On success the batch's outbox rows are deleted; on failure they
stay and the next sync retries (upserts are idempotent).

**Server-side LWW.** A `BEFORE INSERT OR UPDATE` trigger sets `server_updated_at = clock_timestamp()` and, on
update, returns `NULL` (skips the write) when `NEW.updated_at < OLD.updated_at`. A late push from an offline
device therefore never overwrites a newer row; the device learns the winner on its next pull.

**Pull.** Per table: `select * where server_updated_at >= cursor order by server_updated_at, pk limit 1000`,
looping while pages are full. Each row is applied only if it is missing locally or
`incoming.updated_at > local.updated_at` (equal timestamps are ignored, so the re-fetched boundary row is a
no-op). The upsert is a raw `INSERT … ON CONFLICT DO UPDATE … WHERE excluded.updated_at > local.updated_at`,
so the guard also holds in SQL. The cursor advances to the page's last `server_updated_at`; if a full page
shares one timestamp the next request uses `>` to step past it (rows beyond the page with that exact
timestamp would be skipped; `clock_timestamp()` makes that practically impossible).

After applying `curricula`, projections are rebuilt with `rebuildProjections` for the highest pulled version of
each curriculum id (only if it is also the highest version stored locally). After `chunks`, the app's
`onPulled` hook recomputes missing embeddings. Every applied batch fires `onPulled(table, rows)`.

**Conflict policy.** Row-granular last-writer-wins by client clock (`updated_at`), ties keep the existing
row. There is no field-level merge: if the same card is reviewed on two offline devices, the later review's
scheduling state wins and the other device's `review_log` entries still arrive (append-only, distinct ids),
so history is complete even when card state was overwritten. Clock skew between devices skews the outcome
accordingly; a device with a badly wrong clock will "win" or "lose" consistently. Tombstones win like any
other write (`deleted_at` is just a column).

## App wiring (`apps/web/src/lib/sync.ts`)

- The Supabase client is built from the `sync` setting (URL + anon key), falling back to
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Sessions persist in `localStorage` via supabase-js.
- While a session exists the engine runs: on start, when the document becomes visible, on
  `syncEvents.emit('activity')` (after `applyReview`, lesson completion and checkpoint completion, debounced
  2 s) and every 60 s. `syncEvents.emit('pulled')` lets the app state refresh courses after a pull.
- The Account screen (`/account`) shows status (state, pending outbox rows, last push/pull, last error),
  "Sync now", sign in / sign up / magic link, sign out, and the "Tutor via Supabase edge function" toggle
  (`llm.viaSupabase`): the Anthropic provider then uses `${supabaseUrl}/functions/v1/anthropic-proxy` with
  `Authorization: Bearer <access token>` and no `x-api-key`.

## Known gaps

- No realtime channel; changes appear on the next poll (≤ 60 s) or visibility change.
- LWW is per row; concurrent offline edits to the same row lose one side's field changes.
- The desktop CSP (`apps/desktop/src-tauri/tauri.conf.json`) has to allow `connect-src` to the Supabase
  URL before sync works in the Tauri shell.
- Hard local deletes (`deleteCards`, cache pruning) do not propagate.
- Chunk embeddings are recomputed with the hash embedder only; transformer embeddings are not restored.
