-- Experiment log: one record per experiment (aim, protocol, samples, results, outcome),
-- linked to a project, the manuscript it feeds, and the earlier run it repeats.
-- Run after savings-accounts.sql. Rerunnable.
--
-- Besides the new table it teaches five existing functions about experiments, by patching
-- each in place (see the block near the end): ws_private.check_links (links must be your own
-- records), ws_search_workspace, ws_trash, ws_backup_data and ws_restore_data.
begin;

create table if not exists public.ws_experiments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title          text not null default 'Untitled experiment' check (length(trim(title)) > 0),
  status         text not null default 'planned' check (status in ('planned','running','analysing','done','abandoned')),
  outcome        text check (outcome in ('worked','partial','failed','inconclusive')),
  technique      text not null default '',
  started_on     date,
  ended_on       date,
  project_id     uuid references public.projects(id) on delete set null,
  publication_id uuid references public.publications(id) on delete set null,
  -- Deferred so a backup can be restored in any row order.
  repeat_of      uuid references public.ws_experiments(id) on delete set null deferrable initially deferred,
  aim            text not null default '',
  protocol       text not null default '',
  samples        jsonb not null default '[]'::jsonb check (jsonb_typeof(samples) = 'array'),
  results        text not null default '',
  conclusion     text not null default '',
  next_steps     text not null default '',
  tags           text[] not null default '{}',
  pinned         boolean not null default false,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on),
  check (repeat_of is distinct from id)
);
create index if not exists experiments_recent_idx on public.ws_experiments (user_id, updated_at desc);
create index if not exists experiments_project_idx on public.ws_experiments (project_id);
create index if not exists experiments_publication_idx on public.ws_experiments (publication_id);
create index if not exists experiments_repeat_idx on public.ws_experiments (repeat_of);
create index if not exists experiments_tags_idx on public.ws_experiments using gin (tags);
select ws_private.secure_table('public.ws_experiments');
drop trigger if exists experiments_touch on public.ws_experiments;
create trigger experiments_touch before update on public.ws_experiments
  for each row execute function ws_private.touch_updated_at();
-- RLS does not cover TRUNCATE, so signed-in users must not hold it (or REFERENCES/TRIGGER).
revoke truncate, references, trigger on public.ws_experiments from authenticated, anon, public;

-- The run an experiment repeats must be one of your own. Checked separately from check_links
-- because, while a backup is being restored, the earlier run may not be back yet.
create or replace function ws_private.check_experiment_repeat() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.repeat_of is not null and coalesce(current_setting('workspace.restoring', true), '') <> 'on'
     and not exists (select 1 from public.ws_experiments where id = new.repeat_of and user_id = new.user_id) then
    raise exception 'Linked record must belong to this account';
  end if;
  return new;
end $$;
drop trigger if exists experiments_check_repeat on public.ws_experiments;
create trigger experiments_check_repeat before insert or update of repeat_of, user_id on public.ws_experiments
  for each row execute function ws_private.check_experiment_repeat();

-- Files (result images, raw data) attached to an experiment.
alter table public.ws_attachments add column if not exists experiment_id uuid references public.ws_experiments(id) on delete cascade;
create index if not exists attachments_experiment_idx on public.ws_attachments (experiment_id);
do $$
declare c record;
begin
  -- The original "exactly one owner" check was unnamed; replace it with a named one that includes experiments.
  for c in select conname from pg_catalog.pg_constraint
            where conrelid = 'public.ws_attachments'::regclass and contype = 'c'
              and pg_catalog.pg_get_constraintdef(oid) like '%num_nonnulls%' and conname <> 'attachments_one_owner' loop
    execute format('alter table public.ws_attachments drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.ws_attachments drop constraint if exists attachments_one_owner;
alter table public.ws_attachments add constraint attachments_one_owner
  check (num_nonnulls(project_id, paper_id, note_id, meeting_id, deadline_id, experiment_id) = 1);

drop trigger if exists ws_check_links on public.ws_experiments;
create trigger ws_check_links before insert or update on public.ws_experiments
  for each row execute function ws_private.check_links();

-- Teach five existing functions about experiments. Each is patched in place (like the savings
-- accounts in savings-accounts.sql) rather than re-created from a copy, so whatever is live,
-- including earlier in-place patches, is kept: only the experiment line is added. Already
-- patched: skipped. The text to patch not found exactly once: stop, change nothing.
do $patch$
declare
  p record; def text; n int;
begin
  for p in select * from (values
    -- links must be your own records (manuscripts and experiments too)
    ('ws_private.check_links()', 'ws_experiments',
     $s$('habit_id','ws_habits')$s$,
     $s$('habit_id','ws_habits'),('publication_id','publications'),('experiment_id','ws_experiments')$s$),
    -- workspace search
    ('public.ws_search_workspace(text,integer)', 'ws_experiments',
     $s$select 'publication', id,$s$,
     $s$select 'experiment', e.id, e.title,
           concat_ws(' ', e.technique, e.aim, e.protocol, e.results, e.conclusion, e.next_steps),
           e.project_id, e.updated_at, e.tags
    from public.ws_experiments e where e.archived_at is null
    union all
    select 'publication', id,$s$),
    -- Trash
    ('public.ws_trash(text,uuid)', $s$'experiment'$s$,
     $s$when 'savings_accounts' then 'savings_account'$s$,
     $s$when 'savings_accounts' then 'savings_account' when 'experiments' then 'experiment'$s$),
    -- backup and restore (before attachments, which may belong to an experiment)
    ('public.ws_backup_data()', 'ws_experiments', $s$'ws_attachments'$s$, $s$'ws_experiments','ws_attachments'$s$),
    ('public.ws_restore_data(uuid,jsonb)', 'ws_experiments', $s$'ws_attachments'$s$, $s$'ws_experiments','ws_attachments'$s$)
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

-- Only the new function's grants change. (A blanket grant on ws_private would re-open the
-- Trash internals that trash-workspace.sql deliberately keeps from signed-in users.)
revoke all on function ws_private.check_experiment_repeat() from public, anon;
grant execute on function ws_private.check_experiment_repeat() to authenticated;

commit;
