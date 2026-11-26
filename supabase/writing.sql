-- Writing workspace: documents, immutable versions, personal lexicon and paraphrase-server settings.
-- Safe to re-run. Apply after schema.sql.

create table if not exists public.writing_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per saved rewrite. Rows are never updated.
create table if not exists public.writing_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id uuid not null references public.writing_documents(id) on delete cascade,
  original text not null,
  revised text not null,
  settings jsonb not null default '{}'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists writing_versions_document_idx on public.writing_versions(document_id, created_at desc);

-- locked = keep the phrase exactly; otherwise replace it with one of the replacements.
create table if not exists public.writing_lexicon (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  phrase text not null,
  replacements text[] not null default '{}',
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, phrase)
);

create table if not exists public.writing_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  server_url text not null default '',
  server_token text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.writing_documents enable row level security;
alter table public.writing_versions enable row level security;
alter table public.writing_lexicon enable row level security;
alter table public.writing_settings enable row level security;

drop policy if exists "own writing_documents" on public.writing_documents;
create policy "own writing_documents" on public.writing_documents for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "read own writing_versions" on public.writing_versions;
create policy "read own writing_versions" on public.writing_versions for select using (auth.uid()=user_id);
drop policy if exists "add own writing_versions" on public.writing_versions;
create policy "add own writing_versions" on public.writing_versions for insert with check (
  auth.uid()=user_id and exists (select 1 from public.writing_documents d where d.id=document_id and d.user_id=auth.uid())
);

drop policy if exists "own writing_lexicon" on public.writing_lexicon;
create policy "own writing_lexicon" on public.writing_lexicon for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "own writing_settings" on public.writing_settings;
create policy "own writing_settings" on public.writing_settings for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- The notebook that runs the rewriting model reports its temporary address through this function.
-- It holds a secret; only the secret's SHA-256 is stored here. Register one with:
--   insert into public.writing_server_keys (user_id, secret_hash) values ('<your user id>', '<sha256 hex of the secret>');
create table if not exists public.writing_server_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_hash text not null unique,
  created_at timestamptz not null default now()
);
-- No policies: only the function below reads this table.
alter table public.writing_server_keys enable row level security;
revoke all on public.writing_server_keys from anon, authenticated;

create or replace function public.set_writing_server(p_secret text, p_url text, p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  if p_secret is null or length(p_secret) < 32 then return false; end if;
  if p_url <> '' and p_url !~ '^https://[a-z0-9-]+\.trycloudflare\.com$' then return false; end if;
  if length(coalesce(p_token, '')) > 200 then return false; end if;
  select k.user_id into owner from public.writing_server_keys k
   where k.secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  if owner is null then return false; end if;
  insert into public.writing_settings (user_id, server_url, server_token, updated_at)
  values (owner, p_url, coalesce(p_token, ''), now())
  on conflict (user_id) do update set server_url = excluded.server_url, server_token = excluded.server_token, updated_at = now();
  return true;
end $$;
revoke all on function public.set_writing_server(text, text, text) from public;
grant execute on function public.set_writing_server(text, text, text) to anon;

-- Progress messages from the notebook: which start-up step it is on, how long that step usually takes, when it will stop.
alter table public.writing_settings add column if not exists server_status jsonb not null default '{}'::jsonb;
alter table public.writing_settings add column if not exists server_status_at timestamptz;

create or replace function public.set_writing_status(p_secret text, p_status jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  if p_secret is null or length(p_secret) < 32 then return false; end if;
  if p_status is null or jsonb_typeof(p_status) <> 'object' or length(p_status::text) > 2000 then return false; end if;
  select k.user_id into owner from public.writing_server_keys k
   where k.secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  if owner is null then return false; end if;
  insert into public.writing_settings (user_id, server_status, server_status_at, updated_at)
  values (owner, p_status, now(), now())
  on conflict (user_id) do update set server_status = excluded.server_status, server_status_at = now();
  return true;
end $$;
revoke all on function public.set_writing_status(text, jsonb) from public;
grant execute on function public.set_writing_status(text, jsonb) to anon;
