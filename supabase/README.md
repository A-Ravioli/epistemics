# Supabase backend for Epistemics

Optional. The app is fully local without it; signing in adds cross-device sync and (optionally) a
key-less tutor through an edge function. Protocol and conflict policy: [docs/SYNC.md](../docs/SYNC.md).

## 1. Create a project

1. Create a project at https://supabase.com (or `supabase start` for a local stack).
2. Install the CLI (`npm i -g supabase`), then from the repository root:
   ```sh
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
3. Authentication → Providers → Email: keep *Email* enabled. Turn "Confirm email" off for a
   friction-free start, or leave it on and use the magic-link button in the app.
   Add your app origins (e.g. `http://localhost:5173`, your deployed URL, `tauri://localhost`) to
   Authentication → URL configuration → Redirect URLs so magic links come back to the app.

## 2. Apply the schema

```sh
supabase db push
```

`migrations/0001_init.sql` creates one Postgres table per synced SQLite table (same column names),
each with `user_id` (defaults to `auth.uid()`), `updated_at` (client clock) and `server_updated_at`
(set by trigger), row-level security limited to the owner, a `BEFORE UPDATE` trigger that drops writes
older than the stored row (server-side last-writer-wins), and the `llm_budget` table used by the edge
function.

## 3. Deploy the edge function (optional, for "Tutor via Supabase")

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... DAILY_BUDGET_USD=5
supabase functions deploy anthropic-proxy
```

Keep JWT verification on (the default; do not pass `--no-verify-jwt`): the function also resolves the
user itself to charge the right budget row. `DAILY_BUDGET_USD` is per user per UTC day (0 = unlimited);
`ANTHROPIC_BASE_URL` overrides the upstream for testing.

The function forwards `/v1/messages` (and any other Messages API path) to Anthropic with the secret
key injected, streaming SSE straight through, and only copies the `anthropic-version`, `anthropic-beta`
and `content-type` request headers. Responses carry `x-budget-remaining-usd`; once the budget is spent
it answers `402 budget_exhausted` until midnight UTC.

## 4. Point the app at the project

Project settings → API gives you the **Project URL** and the **anon public key**. Either:

- enter them on the app's **Account** screen (stored locally in the `sync` setting, never synced), or
- bake defaults into the web build: create `apps/web/.env.local`
  ```
  VITE_SUPABASE_URL=https://<ref>.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...
  ```
  The Account screen then offers "Use defaults".

Sign in or sign up with email and password (or request a magic link). Sync runs on start, when the tab
becomes visible, after a lesson/review/checkpoint ends, and every 60 s; "Sync now" forces one.
Flip "Tutor via Supabase edge function" on the Account screen to route LLM calls through the function
with your session token; no Anthropic key is stored on the device in that mode.
