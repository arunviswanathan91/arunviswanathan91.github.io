-- Experiment log: one record per experiment (aim, protocol, samples, results, outcome),
-- linked to a project, the manuscript it feeds, and the earlier run it repeats.
-- Run after savings-accounts.sql. Rerunnable.
--
-- Besides the new table this file re-creates five existing functions so they know about
-- experiments. Each is copied unchanged from the file named below, with only the
-- experiment line added:
--   ws_private.check_links       (workspace-extension.sql)       links must be your own records
--   public.ws_search_workspace   (workspace-extension.sql)       experiments appear in search
--   public.ws_trash              (trash-workspace.sql)           experiments go to Trash
--   public.ws_backup_data        (agenda-recurring-followups.sql) and restore: included in backups
--   public.ws_restore_data       (agenda-recurring-followups.sql)
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

create or replace function ws_private.check_links() returns trigger language plpgsql security invoker set search_path='' as $$
declare fk record; ok boolean; value uuid;
begin
 for fk in select * from (values ('project_id','projects'),('task_id','tasks'),('paper_id','ws_papers'),('meeting_id','ws_meetings'),('note_id','ws_notes'),('deadline_id','ws_deadlines'),('contact_id','ws_contacts'),('loan_id','ws_loans'),('category_id','ws_budget_categories'),('habit_id','ws_habits'),('publication_id','publications'),('experiment_id','ws_experiments')) as refs(col,tbl) loop
  value:=(to_jsonb(new)->>fk.col)::uuid;
  if value is not null then
   execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',fk.tbl) into ok using value,new.user_id;
   if not ok then raise exception 'Linked record must belong to this account';end if;
  end if;
 end loop;return new;
end $$;
drop trigger if exists ws_check_links on public.ws_experiments;
create trigger ws_check_links before insert or update on public.ws_experiments
  for each row execute function ws_private.check_links();

create or replace function public.ws_search_workspace(q text, max_results int default 30)
returns table (kind text, id uuid, title text, snippet text, project_id uuid, updated_at timestamptz, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  with query as (
    select websearch_to_tsquery('english', q) as tsq, '%' || q || '%' as pattern
  ),
  docs as (
    select 'project' as kind, p.id, p.title, coalesce(p.description, '') as body, p.id as project_id, p.updated_at, p.tags
    from public.ws_projects p
    union all
    select 'task', t.id, t.title, coalesce(t.description, ''), t.project_id, t.updated_at, t.tags
    from public.ws_tasks t
    union all
    select 'paper', pa.id, pa.title,
           concat_ws(' ', array_to_string(pa.authors, ', '), pa.publication, pa.abstract, pa.summary, pa.methods,
                     pa.findings, pa.relevance, pa.ideas, pa.doi, pa.arxiv_id, pa.pmid),
           null, pa.updated_at, pa.tags
    from public.ws_papers pa
    union all
    select 'note', n.id, n.title, n.body, n.project_id, n.updated_at, n.tags
    from public.ws_notes n where n.archived_at is null
    union all
    select 'meeting', m.id, m.title, concat_ws(' ', m.agenda, m.discussion, m.decisions, m.next_steps),
           null, m.updated_at, m.tags
    from public.ws_meetings m
    union all
    select 'deadline', d.id, d.title, concat_ws(' ', d.description, d.notes), d.project_id, d.updated_at, d.tags
    from public.ws_deadlines d
    union all
    select 'experiment', e.id, e.title,
           concat_ws(' ', e.technique, e.aim, e.protocol, e.results, e.conclusion, e.next_steps),
           e.project_id, e.updated_at, e.tags
    from public.ws_experiments e where e.archived_at is null
    union all
    select 'publication', id, title, concat_ws(' ',venue,doi,notes,next_action), project_id, updated_at, array[]::text[] from public.publications where deleted_at is null
    union all
    select 'document', id, title, concat_ws(' ',kind,notes), project_id, updated_at, array[]::text[] from public.documents where deleted_at is null
    union all
    select 'job', id, concat_ws(' — ',organization,role), concat_ws(' ',notes,next_action), null, updated_at, array[]::text[] from public.job_applications where deleted_at is null
    union all
    select 'read', id, coalesce(title,url), concat_ws(' ',notes,url), project_id, updated_at, array[]::text[] from public.reads where deleted_at is null
    union all
    select 'reminder', id, title, coalesce(body,''), project_id, updated_at, array[]::text[] from public.reminders where deleted_at is null
    union all
    select 'clipping', id, left(body,100), body, null, created_at, array[]::text[] from public.inbox_items
  ),
  scored as (
    select d.*,
           ts_rank(setweight(to_tsvector('english', d.title), 'A') || to_tsvector('english', d.body), query.tsq)
             + case when d.title ilike query.pattern then 1 else 0 end
             + case when exists (select 1 from unnest(d.tags) tag where tag ilike query.pattern) then 0.5 else 0 end
             as rank,
           query.tsq
    from docs d, query
    where (to_tsvector('english', d.title || ' ' || d.body) @@ query.tsq)
       or d.title ilike query.pattern
       or exists (select 1 from unnest(d.tags) tag where tag ilike query.pattern)
  )
  select s.kind, s.id, s.title,
         ts_headline('english', s.body, s.tsq, 'MaxWords=20, MinWords=8, MaxFragments=1'),
         s.project_id, s.updated_at, s.rank::real
  from scored s
  order by s.rank desc, s.updated_at desc
  limit greatest(least(max_results, 100), 1)
$$;

create or replace function public.ws_trash(p_table text,p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_full text;v_type text;v_exists boolean;v_snap jsonb;v_row jsonb;v_title text;
  v_days int;v_deleted timestamptz:=clock_timestamp();v_trash uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_table in ('tasks','projects') then return public.move_to_trash(p_table,p_id); end if;
  v_type:=case p_table
    when 'papers' then 'paper' when 'notes' then 'note' when 'meetings' then 'meeting' when 'deadlines' then 'deadline'
    when 'loans' then 'loan' when 'loan_payments' then 'repayment' when 'transactions' then 'transaction'
    when 'budget_categories' then 'budget_category' when 'recurring' then 'recurring_transaction'
    when 'contacts' then 'contact' when 'resumes' then 'resume' when 'meeting_action_items' then 'action_item'
    when 'habits' then 'habit' when 'savings_accounts' then 'savings_account' when 'experiments' then 'experiment' else null end;
  if v_type is null then raise exception 'Table is not trash-enabled: %',p_table; end if;
  v_full:='ws_'||p_table;
  execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',v_full) into v_exists using p_id,v_user;
  if not v_exists then raise exception 'Record not found or deletion is not permitted'; end if;

  v_snap:=ws_private.trash_capture(('public.'||quote_ident(v_full))::regclass,'id',array[p_id]);
  v_row:=v_snap->'rows'->0;
  v_title:=coalesce(nullif(v_row->>'title',''),nullif(v_row->>'name',''),nullif(v_row->>'description',''),nullif(v_row->>'text',''),
    nullif(v_row->>'account_name',''),initcap(replace(v_type,'_',' ')));
  if p_table='loans' then
    v_title:=coalesce(nullif(v_row->>'account_name',''),(select name from public.ws_contacts where id=(v_row->>'contact_id')::uuid),'Loan')
      ||' — '||(v_row->>'amount')||' '||(v_row->>'currency');
  elsif p_table='loan_payments' then
    v_title:='Repayment '||(v_row->>'amount')||' on '||(v_row->>'paid_on');
  end if;
  select coalesce(trash_retention_days,30) into v_days from public.profiles where id=v_user;
  v_days:=coalesce(v_days,30);

  execute format('delete from public.%I where id=$1 and user_id=$2',v_full) using p_id,v_user;
  insert into public.trash_items(user_id,source_table,record_id,item_type,title,snapshot,deleted_at,purge_at)
  values(v_user,v_full,p_id,v_type,left(v_title,300),v_snap,v_deleted,v_deleted+make_interval(days=>v_days))
  on conflict(source_table,record_id) do update set item_type=excluded.item_type,title=excluded.title,snapshot=excluded.snapshot,
    deleted_at=excluded.deleted_at,purge_at=excluded.purge_at
  returning id into v_trash;
  return v_trash;
end $$;

create or replace function public.ws_backup_data() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t text; rows jsonb; result jsonb := '{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 foreach t in array array['people','projects','project_people','project_stages','project_links','project_fields','publications','publication_nodes','publication_stage_events','tags','documents','job_applications','inbox_items','reads','ws_settings','ws_contacts','ws_papers','ws_project_papers','ws_notes','ws_meetings','ws_meeting_projects','ws_meeting_participants','ws_deadlines','tasks','reminders','item_tags','ws_meeting_action_items','ws_loans','ws_loan_payments','ws_budget_categories','ws_recurring','ws_transactions','ws_monthly_budgets','ws_habits','ws_habit_checkins','ws_experiments','ws_attachments'] loop
  if t = 'item_tags' then
   select coalesce(jsonb_agg(to_jsonb(x)), '[]') into rows from public.item_tags x
    where exists(select 1 from public.tags where id=x.tag_id and user_id=auth.uid());
  else
   execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x where user_id=auth.uid() and to_jsonb(x)->>''deleted_at'' is null',t) into rows;
  end if;
  result := result || jsonb_build_object(t,rows);
 end loop;
 return result;
end $$;

create or replace function public.ws_restore_data(owner_id uuid, payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t text; r jsonb; original jsonb; cols text; updates text; keys text; n int; result jsonb := '{}'; fresh boolean;
begin
 if auth.uid() is null or owner_id <> auth.uid() then raise exception 'Restore requires the original account'; end if;
 perform set_config('workspace.restoring','on',true);
 foreach t in array array['people','projects','project_people','project_stages','project_links','project_fields','publications','publication_nodes','publication_stage_events','tags','documents','job_applications','inbox_items','reads','ws_settings','ws_contacts','ws_papers','ws_project_papers','ws_notes','ws_meetings','ws_meeting_projects','ws_meeting_participants','ws_deadlines','tasks','reminders','item_tags','ws_meeting_action_items','ws_loans','ws_loan_payments','ws_budget_categories','ws_recurring','ws_transactions','ws_monthly_budgets','ws_habits','ws_habit_checkins','ws_experiments','ws_attachments'] loop
  n := 0;
  -- Immutable publication history is exported for reference; existing history is retained.
  if t='publication_stage_events' then result:=result||jsonb_build_object(t,0); continue; end if;
  select string_agg(quote_ident(a.attname),',' order by a.attnum),
         string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum)
    into cols,updates from pg_catalog.pg_attribute a
    where a.attrelid=('public.'||t)::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated='';
  select string_agg(quote_ident(a.attname),',' order by k.ord) into keys
    from pg_catalog.pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ord)
    join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
    where i.indrelid=('public.'||t)::regclass and i.indisprimary;
  for original in select value from jsonb_array_elements(coalesce(payload->t,'[]')) loop
   r := original;
   -- Loan and habit reminders are derived; the loan triggers and the nightly job recreate them.
   if t='reminders' and (coalesce(r->>'loan_id','')<>'' or coalesce(r->>'nudge_key','')<>'') then continue; end if;
   if t='ws_loans' then r:=jsonb_build_object('account_type','personal')||r; end if;
   if t <> 'item_tags' and (r->>'user_id') is distinct from auth.uid()::text then raise exception 'Backup contains a different owner'; end if;
   if t='tasks' then r:=r || '{"previous_id":null,"recurrence":null}'::jsonb; end if;
   fresh := false;
   if t='projects' then select not exists(select 1 from public.projects where id=(r->>'id')::uuid) into fresh; end if;
   execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(%s) %s',
     t,cols,cols,t,keys,case when t='publication_stage_events' then 'do nothing' else 'do update set '||updates end) using r;
   -- The original app seeds starter columns on insert; the backup supplies their stable ids.
   if fresh then delete from public.project_stages where project_id=(r->>'id')::uuid; end if;
   n:=n+1;
  end loop;
  result:=result||jsonb_build_object(t,n);
 end loop;
 for r in select value from jsonb_array_elements(coalesce(payload->'tasks','[]')) loop
  update public.tasks set previous_id=(r->>'previous_id')::uuid, recurrence=nullif(r->'recurrence','null'::jsonb)
    where id=(r->>'id')::uuid and user_id=auth.uid();
 end loop;
 perform set_config('workspace.restoring','off',true);
 return result;
end $$;

-- Only the new function's grants change. (A blanket grant on ws_private would re-open the
-- Trash internals that trash-workspace.sql deliberately keeps from signed-in users.)
revoke all on function ws_private.check_experiment_repeat() from public, anon;
grant execute on function ws_private.check_experiment_repeat() to authenticated;

commit;
