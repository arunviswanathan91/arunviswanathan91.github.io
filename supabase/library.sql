-- Library: protocols and code you keep and reuse. An entry has saved versions; an experiment
-- can point at the protocol version it used. Rerunnable. Run after publication-submissions.sql.

create table if not exists public.ws_library_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind               text not null check (kind in ('protocol','code')),
  title              text not null default 'Untitled' check (length(trim(title)) > 0),
  -- A protocol's technique (Western blot, IHC…); a code entry's language (R, Python…).
  technique          text not null default '',
  language           text not null default '',
  purpose            text not null default '',
  tags               text[] not null default '{}',
  project_id         uuid references public.projects(id) on delete set null,
  -- The library paper a protocol came from; the manuscript a piece of analysis code belongs to.
  paper_id           uuid references public.ws_papers(id) on delete set null,
  publication_id     uuid references public.publications(id) on delete set null,
  -- Where the original lives: a repository, a gist, protocols.io.
  source_url         text not null default '',
  current_version_id uuid,
  pinned             boolean not null default false,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists library_entries_recent_idx on public.ws_library_entries (user_id, kind, updated_at desc);
create index if not exists library_entries_project_idx on public.ws_library_entries (project_id);
create index if not exists library_entries_tags_idx on public.ws_library_entries using gin (tags);
select ws_private.secure_table('public.ws_library_entries');
drop trigger if exists library_entries_touch on public.ws_library_entries;
create trigger library_entries_touch before update on public.ws_library_entries
  for each row execute function ws_private.touch_updated_at();

-- A saved version: the steps or the code as they were, with what changed. Never edited afterwards.
create table if not exists public.ws_library_versions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Deferred so a backup can be restored in any row order.
  entry_id    uuid not null references public.ws_library_entries(id) on delete cascade deferrable initially deferred,
  version     int not null check (version > 0),
  -- Protocol: the steps. Code: the code.
  body        text not null default '',
  -- Protocol: reagents and materials. Code: packages and versions it needs.
  materials   text not null default '',
  -- Protocol: notes and troubleshooting. Code: how to run it.
  notes       text not null default '',
  change_note text not null default '',
  created_at  timestamptz not null default now(),
  unique (entry_id, version)
);
create index if not exists library_versions_entry_idx on public.ws_library_versions (entry_id, version desc);
select ws_private.secure_table('public.ws_library_versions');
revoke truncate, references, trigger on public.ws_library_entries, public.ws_library_versions from authenticated, anon, public;

do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'library_entries_current_version_fk') then
  alter table public.ws_library_entries add constraint library_entries_current_version_fk
   foreign key (current_version_id) references public.ws_library_versions(id) on delete set null deferrable initially deferred;
 end if;
end $$;

-- A saved version is a record of what was done: it can be added or removed, not changed.
create or replace function ws_private.library_version_frozen() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(current_setting('workspace.restoring', true), '') = 'on' then return new; end if;
  if (new.body, new.materials, new.notes, new.version, new.entry_id) is distinct from (old.body, old.materials, old.notes, old.version, old.entry_id) then
    raise exception 'A saved version cannot be changed: save a new version instead';
  end if;
  return new;
end $$;
revoke all on function ws_private.library_version_frozen() from public, anon;
grant execute on function ws_private.library_version_frozen() to authenticated;
drop trigger if exists library_versions_frozen on public.ws_library_versions;
create trigger library_versions_frozen before update on public.ws_library_versions
  for each row execute function ws_private.library_version_frozen();

-- Links must be your own records (skipped while a backup is restored).
drop trigger if exists ws_check_links on public.ws_library_entries;
create trigger ws_check_links before insert or update on public.ws_library_entries
  for each row execute function ws_private.check_links();
-- Checked at the end of the transaction: Trash brings an entry back before its versions.
drop trigger if exists library_entry_current_version on public.ws_library_entries;
create constraint trigger library_entry_current_version after insert or update of current_version_id, user_id on public.ws_library_entries
  deferrable initially deferred for each row execute function ws_private.check_owned_link('current_version_id', 'ws_library_versions');
drop trigger if exists library_version_entry on public.ws_library_versions;
create trigger library_version_entry before insert or update of entry_id, user_id on public.ws_library_versions
  for each row execute function ws_private.check_owned_link('entry_id', 'ws_library_entries');

-- The protocol version an experiment was run from.
alter table public.ws_experiments add column if not exists protocol_version_id uuid
  references public.ws_library_versions(id) on delete set null deferrable initially deferred;
create index if not exists experiments_protocol_version_idx on public.ws_experiments (protocol_version_id) where protocol_version_id is not null;
drop trigger if exists experiment_protocol_version on public.ws_experiments;
create trigger experiment_protocol_version before insert or update of protocol_version_id, user_id on public.ws_experiments
  for each row execute function ws_private.check_owned_link('protocol_version_id', 'ws_library_versions');

-- Files attached to a library entry (a PDF, a kit manual, a script file).
alter table public.ws_attachments add column if not exists library_entry_id uuid
  references public.ws_library_entries(id) on delete cascade deferrable initially deferred;
create index if not exists attachments_library_entry_idx on public.ws_attachments (library_entry_id);
alter table public.ws_attachments drop constraint if exists attachments_one_owner;
alter table public.ws_attachments add constraint attachments_one_owner
  check (num_nonnulls(project_id, paper_id, note_id, meeting_id, deadline_id, experiment_id, library_entry_id) = 1);
drop trigger if exists attachment_library_entry on public.ws_attachments;
create trigger attachment_library_entry before insert or update of library_entry_id, user_id on public.ws_attachments
  for each row execute function ws_private.check_owned_link('library_entry_id', 'ws_library_entries');

-- Teach search, Trash, backup and restore about the library, each patched in place as in experiments.sql.
do $patch$
declare
  p record; def text; n int;
begin
  for p in select * from (values
    ('public.ws_search_workspace(text,integer)', 'ws_library_entries',
     $s$select 'publication', id,$s$,
     $s$select l.kind, l.id, l.title,
           concat_ws(' ', l.technique, l.language, l.purpose, v.body, v.materials, v.notes),
           l.project_id, l.updated_at, l.tags
    from public.ws_library_entries l left join public.ws_library_versions v on v.id = l.current_version_id
    where l.archived_at is null
    union all
    select 'publication', id,$s$),
    ('public.ws_trash(text,uuid)', $s$'library_entry'$s$,
     $s$when 'experiments' then 'experiment'$s$,
     $s$when 'experiments' then 'experiment' when 'library_entries' then 'library_entry'$s$),
    ('public.ws_backup_data()', 'ws_library_entries', $s$'ws_attachments'$s$, $s$'ws_library_entries','ws_library_versions','ws_attachments'$s$),
    ('public.ws_restore_data(uuid,jsonb)', 'ws_library_entries', $s$'ws_attachments'$s$, $s$'ws_library_entries','ws_library_versions','ws_attachments'$s$)
  ) as t(fn, done_marker, needle, replacement) loop
    select pg_catalog.pg_get_functiondef(p.fn::regprocedure) into def;
    continue when position(p.done_marker in def) > 0;
    n := (length(def) - length(replace(def, p.needle, ''))) / length(p.needle);
    if n <> 1 then
      raise exception 'Cannot patch %: expected the text % once, found it % times', p.fn, p.needle, n;
    end if;
    execute replace(def, p.needle, p.replacement);
  end loop;
end $patch$;
