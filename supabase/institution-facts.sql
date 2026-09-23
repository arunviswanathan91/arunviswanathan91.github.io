-- Shared, profile-independent cache of AI-generated institution/city facts
-- (institution, place, population, climate, transport), keyed by
-- organization+city+country. Reused across every opportunity and every
-- user with the same employer/city instead of regenerating the same five
-- facts on every single decision brief -- cuts AI token usage and free-tier
-- provider calls substantially once a run has warmed a few institutions.
--
-- Optional: the pipeline works without this table (it just always
-- regenerates institution facts, same as before this cache existed) and
-- silently tolerates the table being absent. Run this once in the Supabase
-- SQL editor to enable cross-run/cross-user reuse.

create table if not exists public.institution_facts (
  cache_key text primary key,
  sections jsonb not null,
  provider text,
  model text,
  updated_at timestamptz not null default now()
);

comment on table public.institution_facts is
  'Shared, profile-independent AI facts about an institution/city (see pipeline/src/enrich/context.ts institutionCacheKey). Safe to truncate at any time; the pipeline regenerates on a cache miss.';

alter table public.institution_facts enable row level security;

-- Only the discovery worker (service role) reads/writes this table; it
-- holds no user-specific data, so there is no per-user policy to add.
drop policy if exists "service role manages institution facts" on public.institution_facts;
create policy "service role manages institution facts" on public.institution_facts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
