-- Additive migration for independent broad discovery, focused search and an
-- auditable per-run decision ledger. Safe to run more than once.
alter table public.discovery_runs
  add column if not exists run_mode text not null default 'discovery';

alter table public.discovery_run_sources
  add column if not exists items_evaluated integer not null default 0,
  add column if not exists items_filtered integer not null default 0,
  add column if not exists items_matched integer not null default 0,
  add column if not exists items_unchanged integer not null default 0,
  add column if not exists filter_reasons jsonb not null default '{}'::jsonb;

create table if not exists public.discovery_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.discovery_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  external_id text not null,
  content_hash text not null,
  opportunity_id uuid,
  url text not null,
  title text not null,
  organization text,
  location text,
  country text,
  opportunity_type text,
  disposition text not null check (disposition in ('accepted','ranked_low','excluded')),
  reason text,
  score integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, source_key, external_id, content_hash)
);

create index if not exists discovery_run_items_run_disposition_idx
  on public.discovery_run_items(run_id, disposition, score desc);

alter table public.discovery_run_items enable row level security;
drop policy if exists "own discovery run items" on public.discovery_run_items;
create policy "own discovery run items" on public.discovery_run_items for all
  using (auth.uid()=user_id) with check (auth.uid()=user_id);
