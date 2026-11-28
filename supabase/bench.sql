-- Bench tools: saved calculations, recipes, master mixes, standard curves, timer sets and plate maps.
-- The inputs of each are kept as JSON and worked out again in the app, so a saved item can be
-- reopened, changed and rescaled. Rerunnable. Run after library.sql.

create table if not exists public.ws_bench_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind             text not null check (kind in ('dilution','cell_dilution','haemocytometer','molarity','recipe','master_mix','curve','timer_set')),
  title            text not null default 'Untitled' check (length(trim(title)) > 0),
  -- The tool's inputs (and nothing derived from them).
  data             jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  notes            text not null default '',
  tags             text[] not null default '{}',
  project_id       uuid references public.projects(id) on delete set null,
  -- The protocol this recipe, mix or timer set belongs to, and the run a calculation was made for.
  -- Deferred so a backup can be restored in any table order.
  library_entry_id uuid references public.ws_library_entries(id) on delete set null deferrable initially deferred,
  experiment_id    uuid references public.ws_experiments(id) on delete set null deferrable initially deferred,
  pinned           boolean not null default false,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists bench_items_recent_idx on public.ws_bench_items (user_id, kind, updated_at desc);
create index if not exists bench_items_protocol_idx on public.ws_bench_items (library_entry_id) where library_entry_id is not null;
create index if not exists bench_items_experiment_idx on public.ws_bench_items (experiment_id) where experiment_id is not null;
-- The kinds grow with the tools: plate maps joined later, so the check is named and replaced here.
alter table public.ws_bench_items drop constraint if exists ws_bench_items_kind_check;
alter table public.ws_bench_items add constraint ws_bench_items_kind_check
  check (kind in ('dilution','cell_dilution','haemocytometer','molarity','recipe','master_mix','curve','timer_set','plate'));
-- The power / sample-size tool is added here, keeping the file rerunnable.
alter table public.ws_bench_items drop constraint if exists ws_bench_items_kind_check;
alter table public.ws_bench_items add constraint ws_bench_items_kind_check
  check (kind in ('dilution','cell_dilution','haemocytometer','molarity','recipe','master_mix','curve','timer_set','plate','power_analysis'));
-- The cell-lines tool is added here, keeping the file rerunnable.
alter table public.ws_bench_items drop constraint if exists ws_bench_items_kind_check;
alter table public.ws_bench_items add constraint ws_bench_items_kind_check
  check (kind in ('dilution','cell_dilution','haemocytometer','molarity','recipe','master_mix','curve','timer_set','plate','power_analysis','cell_line'));
select ws_private.secure_table('public.ws_bench_items');
drop trigger if exists bench_items_touch on public.ws_bench_items;
create trigger bench_items_touch before update on public.ws_bench_items
  for each row execute function ws_private.touch_updated_at();
revoke truncate, references, trigger on public.ws_bench_items from authenticated, anon, public;

-- Links must be your own records (project and experiment through check_links; the protocol here).
drop trigger if exists ws_check_links on public.ws_bench_items;
create trigger ws_check_links before insert or update on public.ws_bench_items
  for each row execute function ws_private.check_links();
drop trigger if exists bench_item_protocol on public.ws_bench_items;
create trigger bench_item_protocol before insert or update of library_entry_id, user_id on public.ws_bench_items
  for each row execute function ws_private.check_owned_link('library_entry_id', 'ws_library_entries');

-- Search, Trash, backup and restore, each patched in place as in experiments.sql.
do $patch$
declare
  p record; def text; n int;
begin
  for p in select * from (values
    ('public.ws_search_workspace(text,integer)', 'ws_bench_items',
     $s$select 'publication', id,$s$,
     $s$select 'bench', b.id, b.title, concat_ws(' ', replace(b.kind, '_', ' '), b.notes), b.project_id, b.updated_at, b.tags
    from public.ws_bench_items b where b.archived_at is null
    union all
    select 'publication', id,$s$),
    ('public.ws_trash(text,uuid)', $s$'bench_item'$s$,
     $s$when 'experiments' then 'experiment'$s$,
     $s$when 'experiments' then 'experiment' when 'bench_items' then 'bench_item'$s$),
    ('public.ws_backup_data()', 'ws_bench_items', $s$'ws_attachments'$s$, $s$'ws_bench_items','ws_attachments'$s$),
    ('public.ws_restore_data(uuid,jsonb)', 'ws_bench_items', $s$'ws_attachments'$s$, $s$'ws_bench_items','ws_attachments'$s$)
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
