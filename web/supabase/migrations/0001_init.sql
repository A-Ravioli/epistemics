-- Epistemics sync schema: one Postgres table per synced SQLite table (docs/SYNC.md).
-- Columns mirror packages/db/src/schema.ts (snake_case, same names); every table additionally carries
--   user_id            owner, defaults to the caller; primary key prefix; RLS scopes everything to it
--   updated_at         client clock (ms since epoch) used for last-writer-wins
--   server_updated_at  set by trigger on every accepted write; clients page on it when pulling
-- SQLite integers become bigint, reals double precision, JSON stays text.

create or replace function public.sync_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;                      -- server-side LWW: keep the existing, newer row
  end if;
  new.server_updated_at := clock_timestamp();   -- per row, so rows of one batch are distinguishable when paging
  return new;
end $$;

create or replace procedure public.sync_enable(tbl text)
language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', tbl || '_select', tbl);
  execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())', tbl || '_insert', tbl);
  execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', tbl || '_update', tbl);
  execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', tbl || '_delete', tbl);
  execute format('create trigger %I before insert or update on public.%I for each row execute function public.sync_touch()', tbl || '_touch', tbl);
  execute format('create index %I on public.%I (user_id, server_updated_at)', tbl || '_sync_idx', tbl);
end $$;

-- ---------------- content ----------------

create table public.curricula (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  version bigint not null,
  title text, subject text, content_hash text, manifest_json text, curriculum_json text,
  frozen_at bigint, created_at bigint, deleted_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id, version)
);
call public.sync_enable('curricula');

create table public.sources (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  curriculum_id text, title text, kind text, hash text, licence text, page_count bigint,
  created_at bigint, deleted_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('sources');

create table public.chunks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  source_id text, ordinal bigint, heading_path text, page_start bigint, page_end bigint,
  text text, token_count bigint, hash text, deleted_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('chunks');

create table public.gen_cache (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  kind text, json text, created_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
call public.sync_enable('gen_cache');

-- ---------------- learner ----------------

create table public.courses (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  curriculum_id text, curriculum_version bigint, title text, goals_json text, settings_json text, scaffolding text,
  created_at bigint, deleted_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('courses');

create table public.cards (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  course_id text, item_id text, concept_id text, state bigint, due bigint, last_review bigint,
  stability double precision, difficulty double precision, scheduled_days bigint, learning_steps bigint,
  reps bigint, lapses bigint, suspended bigint, provisional bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('cards');

create table public.review_log (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  card_id text, course_id text, review_time bigint, rating bigint, state_before bigint, elapsed_days bigint,
  scheduled_days bigint, stability double precision, difficulty double precision, duration_ms bigint,
  confidence bigint, source text, assisted bigint,
  updated_at bigint not null default 0,          -- = review_time (append-only table)
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('review_log');

create table public.concept_state (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id text not null,
  concept_id text not null,
  mastery double precision, successful_sessions bigint, last_success_day text, misconceptions_json text,
  assisted_pass bigint, assisted_n bigint, unassisted_pass bigint, unassisted_n bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, course_id, concept_id)
);
call public.sync_enable('concept_state');

create table public.fsrs_params (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id text not null,
  w_json text, desired_retention double precision, optimized_at bigint, n_reviews bigint, logloss double precision,
  deleted_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
call public.sync_enable('fsrs_params');

create table public.sessions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  course_id text, type text, lesson_id text, unit_id text, started_at bigint, ended_at bigint,
  summary_json text, state_json text,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('sessions');

create table public.turns (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  session_id text, ordinal bigint, role text, content text, phase text, concept_id text, hint_level bigint,
  observer_json text, created_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('turns');

create table public.receipts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  session_id text, course_id text, item_id text, concept_id text, answer text, confidence bigint, grade_json text,
  rating bigint, assisted bigint, disputed bigint, created_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('receipts');

create table public.jol (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  session_id text, course_id text, concept_id text, predicted_recall double precision, actual_outcome bigint,
  checked_at bigint, created_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('jol');

create table public.llm_calls (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  session_id text, course_id text, role text, model text, input_tokens bigint, cache_read bigint, cache_write bigint,
  output_tokens bigint, cost_usd double precision, latency_ms bigint, created_at bigint,
  updated_at bigint not null default 0,          -- = created_at (append-only table)
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
call public.sync_enable('llm_calls');

create table public.settings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value_json text, deleted_at bigint,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
call public.sync_enable('settings');

-- ---------------- edge-function budget ----------------
-- Written only by the anthropic-proxy function (service role); users may read their own spend.

create table public.llm_budget (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  spent_usd double precision not null default 0,
  primary key (user_id, day)
);
alter table public.llm_budget enable row level security;
create policy llm_budget_select on public.llm_budget for select to authenticated using (user_id = auth.uid());

create or replace function public.llm_budget_charge(p_user uuid, p_day date, p_usd double precision)
returns double precision
language sql security definer set search_path = public as $$
  insert into public.llm_budget (user_id, day, spent_usd) values (p_user, p_day, p_usd)
  on conflict (user_id, day) do update set spent_usd = llm_budget.spent_usd + excluded.spent_usd
  returning spent_usd;
$$;
revoke all on function public.llm_budget_charge(uuid, date, double precision) from public, anon, authenticated;
