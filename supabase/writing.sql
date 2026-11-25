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
