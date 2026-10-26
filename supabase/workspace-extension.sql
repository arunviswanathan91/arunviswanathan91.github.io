-- Additive workspace integration. Existing projects, tasks and permissions are preserved.
-- Adapted from Justin Seby's MIT-licensed workspace (8b636b2).
begin;

create schema if not exists ws_private; grant usage on schema ws_private to authenticated;
-- ── secure_table: one place that locks a table down ──────────────────────────
-- Enables RLS, removes anonymous access, and allows only the owner to touch rows
-- they own. Every private table is passed through this.

create or replace function ws_private.secure_table(t regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table %s enable row level security', t);
  execute format('revoke all on %s from anon, public', t);
  execute format('grant select, insert, update, delete on %s to authenticated', t);
  execute format('drop policy if exists owner_all on %s', t);
  execute format(
    'create policy owner_all on %s for all to authenticated
       using (user_id = (select auth.uid()))
       with check (user_id = (select auth.uid()))', t);
end
$$;
revoke all on function ws_private.secure_table(regclass) from public, authenticated;

-- ── updated_at helper ───────────────────────────────────────────────────────

create or replace function ws_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ── Settings ────────────────────────────────────────────────────────────────

create table if not exists public.ws_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  default_currency text not null default 'INR' check (default_currency ~ '^[A-Z]{3}$'),
  timezone         text not null default 'Asia/Kolkata',
  updated_at       timestamptz not null default now()
);
select ws_private.secure_table('public.ws_settings');

drop trigger if exists settings_touch on public.ws_settings;
create trigger settings_touch before update on public.ws_settings
  for each row execute function ws_private.touch_updated_at();

-- ── Private file storage ────────────────────────────────────────────────────
-- Files live at  workspace-files/<owner-user-id>/<anything>.  Max 50 MB each.

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists workspace_files_owner on storage.objects;
create policy workspace_files_owner on storage.objects
  for all to authenticated
  using (
    bucket_id = 'workspace-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
   
  )
  with check (
    bucket_id = 'workspace-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
   
  );


alter table public.projects add column if not exists ws_status text not null default 'active';
alter table public.projects add column if not exists area text not null default 'research';
alter table public.projects add column if not exists completed_on date;
alter table public.projects add column if not exists pinned boolean not null default false;
alter table public.tasks add column if not exists recurrence jsonb;
alter table public.tasks add column if not exists series_id uuid;
alter table public.tasks add column if not exists previous_id uuid references public.tasks(id) on delete set null;
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists cancelled boolean not null default false;
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check(priority in ('Low','Medium','High','Urgent'));
create unique index if not exists tasks_previous_occurrence_unique on public.tasks(previous_id) where previous_id is not null;

-- Loans: people you lend to or borrow from, each loan, and repayments against it.
-- Run after 000_foundation.sql. Safe to re-run.
-- contacts is also the shared people list (meeting participants).

create table if not exists public.ws_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  phone      text,
  email      text,
  notes      text,
  created_at timestamptz not null default now()
);
alter table public.ws_contacts add column if not exists affiliation text;

create table if not exists public.ws_loans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid not null references public.ws_contacts(id) on delete restrict,
  direction  text not null check (direction in ('lent', 'borrowed')),
  amount     numeric(14, 2) not null check (amount > 0),
  currency   text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  issued_on  date not null default current_date,
  due_on     date,
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.ws_loan_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loan_id    uuid not null references public.ws_loans(id) on delete cascade,
  amount     numeric(14, 2) not null check (amount > 0),
  paid_on    date not null default current_date,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists loans_user_contact_idx on public.ws_loans (user_id, contact_id);
create index if not exists loan_payments_loan_idx on public.ws_loan_payments (loan_id);

select ws_private.secure_table('public.ws_contacts');
select ws_private.secure_table('public.ws_loans');
select ws_private.secure_table('public.ws_loan_payments');

-- Policies from the first version of this file, replaced by owner_all above.
drop policy if exists contacts_owner on public.ws_contacts;
drop policy if exists loans_owner on public.ws_loans;
drop policy if exists loan_payments_owner on public.ws_loan_payments;

-- Papers library. A paper is stored once and linked to any number of projects. Run after 002.

create table if not exists public.ws_papers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title             text not null check (length(trim(title)) > 0),
  authors           text[] not null default '{}',
  year              int check (year between 1600 and 2200),
  publication       text,                -- journal, conference or preprint server
  abstract          text,
  doi               text check (doi is null or doi = lower(doi)),
  arxiv_id          text,
  pmid              text check (pmid is null or pmid ~ '^[0-9]+$'),
  url               text,
  status            text not null default 'to_read'
                    check (status in ('to_read', 'reading', 'read', 'to_cite', 'archived')),
  rating            int check (rating between 1 and 5),
  priority          text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  tags              text[] not null default '{}',
  -- structured reading notes
  summary           text,
  research_question text,
  methods           text,
  findings          text,
  strengths         text,
  limitations       text,
  relevance         text,
  ideas             text,
  page_refs         jsonb not null default '[]' check (jsonb_typeof(page_refs) = 'array'),  -- [{page, note}]
  started_on        date,
  finished_on       date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- The same paper cannot be added twice under the same identifier.
create unique index if not exists papers_doi_uq   on public.ws_papers (user_id, doi)      where doi is not null;
create unique index if not exists papers_arxiv_uq on public.ws_papers (user_id, arxiv_id) where arxiv_id is not null;
create unique index if not exists papers_pmid_uq  on public.ws_papers (user_id, pmid)     where pmid is not null;
create index if not exists papers_status_idx on public.ws_papers (user_id, status);
create index if not exists papers_tags_idx on public.ws_papers using gin (tags);
select ws_private.secure_table('public.ws_papers');
drop trigger if exists papers_touch on public.ws_papers;
create trigger papers_touch before update on public.ws_papers
  for each row execute function ws_private.touch_updated_at();

create table if not exists public.ws_project_papers (
  project_id uuid not null references public.projects(id) on delete cascade,
  paper_id   uuid not null references public.ws_papers(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (project_id, paper_id)
);
create index if not exists project_papers_paper_idx on public.ws_project_papers (paper_id);
select ws_private.secure_table('public.ws_project_papers');

-- Notes (markdown) and meetings (free date/time, action items → tasks). Run after 003.

create table if not exists public.ws_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default 'Untitled',
  body        text not null default '',          -- markdown
  type        text not null default 'general'
              check (type in ('research_idea', 'literature', 'daily_log', 'lab_notebook',
                              'meeting_prep', 'general', 'personal')),
  project_id  uuid references public.projects(id) on delete set null,
  paper_id    uuid references public.ws_papers(id) on delete set null,
  tags        text[] not null default '{}',
  pinned      boolean not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notes_recent_idx on public.ws_notes (user_id, updated_at desc);
create index if not exists notes_project_idx on public.ws_notes (project_id);
create index if not exists notes_paper_idx on public.ws_notes (paper_id);
create index if not exists notes_tags_idx on public.ws_notes using gin (tags);
select ws_private.secure_table('public.ws_notes');
drop trigger if exists notes_touch on public.ws_notes;
create trigger notes_touch before update on public.ws_notes
  for each row execute function ws_private.touch_updated_at();

create table if not exists public.ws_meetings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title              text not null check (length(trim(title)) > 0),
  type               text not null default 'other'
                     check (type in ('supervisor', 'lab', 'research_discussion', 'collaboration',
                                     'administration', 'other')),
  starts_at          timestamptz not null,       -- chosen freely, no fixed schedule
  ends_at            timestamptz check (ends_at is null or ends_at >= starts_at),
  location           text,
  other_participants text,                       -- free text for people not in contacts
  agenda             text not null default '',   -- markdown sections, all optional
  discussion         text not null default '',
  decisions          text not null default '',
  next_steps         text not null default '',
  tags               text[] not null default '{}',
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists meetings_when_idx on public.ws_meetings (user_id, starts_at);
create index if not exists meetings_type_idx on public.ws_meetings (user_id, type);
select ws_private.secure_table('public.ws_meetings');
drop trigger if exists meetings_touch on public.ws_meetings;
create trigger meetings_touch before update on public.ws_meetings
  for each row execute function ws_private.touch_updated_at();

create table if not exists public.ws_meeting_projects (
  meeting_id uuid not null references public.ws_meetings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (meeting_id, project_id)
);
create index if not exists meeting_projects_project_idx on public.ws_meeting_projects (project_id);
select ws_private.secure_table('public.ws_meeting_projects');

create table if not exists public.ws_meeting_participants (
  meeting_id uuid not null references public.ws_meetings(id) on delete cascade,
  contact_id uuid not null references public.ws_contacts(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (meeting_id, contact_id)
);
select ws_private.secure_table('public.ws_meeting_participants');

-- Tasks can come from a meeting.
alter table public.tasks add column if not exists meeting_id uuid references public.ws_meetings(id) on delete set null;
create index if not exists tasks_meeting_idx on public.tasks (meeting_id);

create table if not exists public.ws_meeting_action_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meeting_id uuid not null references public.ws_meetings(id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  owner      text,                               -- who is responsible, free text
  done       boolean not null default false,
  task_id    uuid unique references public.tasks(id) on delete set null,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists meeting_action_items_meeting_idx on public.ws_meeting_action_items (meeting_id, position);
select ws_private.secure_table('public.ws_meeting_action_items');


-- Deadlines and milestones; tasks can be preparation for a deadline. Run after 004.

create table if not exists public.ws_deadlines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  description  text,
  category     text not null default 'other'
               check (category in ('conference', 'abstract_submission', 'paper_submission', 'course',
                                   'credits', 'isp', 'half_time_review', 'dissertation',
                                   'administration', 'personal', 'other')),
  due_date     date not null,
  due_time     time,                             -- optional, e.g. 23:59 AoE submissions
  status       text not null default 'upcoming'
               check (status in ('upcoming', 'in_progress', 'done', 'missed', 'cancelled')),
  priority     text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  project_id   uuid references public.projects(id) on delete set null,
  links        jsonb not null default '[]' check (jsonb_typeof(links) = 'array'),
  tags         text[] not null default '{}',
  notes        text not null default '',         -- markdown
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists deadlines_due_idx on public.ws_deadlines (user_id, status, due_date);
create index if not exists deadlines_project_idx on public.ws_deadlines (project_id);
create index if not exists deadlines_tags_idx on public.ws_deadlines using gin (tags);
select ws_private.secure_table('public.ws_deadlines');
drop trigger if exists deadlines_touch on public.ws_deadlines;
create trigger deadlines_touch before update on public.ws_deadlines
  for each row execute function ws_private.touch_updated_at();

-- Preparation tasks for a deadline.
alter table public.tasks add column if not exists deadline_id uuid references public.ws_deadlines(id) on delete set null;
create index if not exists tasks_deadline_idx on public.tasks (deadline_id);

-- Budget: categories, transactions (income / expense / transfer), monthly budgets. Run after 005.
-- Loans stay in their own tables (001) and are not mixed into budget totals.

create table if not exists public.ws_budget_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  kind        text not null default 'expense' check (kind in ('income', 'expense')),
  color       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, name)
);
select ws_private.secure_table('public.ws_budget_categories');

create table if not exists public.ws_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('income', 'expense', 'transfer')),
  description    text not null check (length(trim(description)) > 0),
  amount         numeric(14, 2) not null check (amount > 0),   -- always positive; kind gives direction
  currency       text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  category_id    uuid references public.ws_budget_categories(id) on delete restrict,
  occurred_on    date not null default current_date,
  payment_method text,                                          -- e.g. card, Swish, cash, bank
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- transfers move money between your own accounts and have no category
  check (kind <> 'transfer' or category_id is null)
);
create index if not exists transactions_month_idx on public.ws_transactions (user_id, occurred_on desc);
create index if not exists transactions_category_idx on public.ws_transactions (category_id);
select ws_private.secure_table('public.ws_transactions');
drop trigger if exists transactions_touch on public.ws_transactions;
create trigger transactions_touch before update on public.ws_transactions
  for each row execute function ws_private.touch_updated_at();

create table if not exists public.ws_monthly_budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.ws_budget_categories(id) on delete cascade,
  month       date not null check (extract(day from month) = 1),  -- first day of the month
  amount      numeric(14, 2) not null check (amount >= 0),
  currency    text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  unique (category_id, month, currency)
);
select ws_private.secure_table('public.ws_monthly_budgets');

-- Budget vs actual per category for one month, per currency. Runs as the caller, so RLS applies.
create or replace function public.ws_budget_month(month_start date)
returns table (category_id uuid, category text, kind text, currency text, budgeted numeric, actual numeric, remaining numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with spend as (
    select t.category_id, t.currency, sum(t.amount) as actual
    from public.ws_transactions t
    where t.kind <> 'transfer'
      and t.occurred_on >= month_start and t.occurred_on < (month_start + interval '1 month')::date
    group by 1, 2
  ),
  plan as (
    select b.category_id, b.currency, b.amount as budgeted
    from public.ws_monthly_budgets b where b.month = month_start
  )
  select c.id, c.name, c.kind, coalesce(p.currency, s.currency),
         coalesce(p.budgeted, 0), coalesce(s.actual, 0), coalesce(p.budgeted, 0) - coalesce(s.actual, 0)
  from public.ws_budget_categories c
  join (select category_id, currency from plan union select category_id, currency from spend) k on k.category_id = c.id
  left join plan p on p.category_id = k.category_id and p.currency = k.currency
  left join spend s on s.category_id = k.category_id and s.currency = k.currency
  order by c.kind, c.name
$$;
grant execute on function public.ws_budget_month(date) to authenticated;
revoke all on function public.ws_budget_month(date) from public, anon;

-- Habits: daily or on chosen weekdays. Archiving keeps all check-ins. Run after 006.

create table if not exists public.ws_habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  description text,
  frequency   text not null default 'daily' check (frequency in ('daily', 'weekdays')),
  weekdays    int[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),  -- ISO: 1 = Mon
  start_date  date not null default current_date,
  archived_at timestamptz,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (frequency = 'daily' or cardinality(weekdays) > 0)
);
select ws_private.secure_table('public.ws_habits');
drop trigger if exists habits_touch on public.ws_habits;
create trigger habits_touch before update on public.ws_habits
  for each row execute function ws_private.touch_updated_at();

create table if not exists public.ws_habit_checkins (
  habit_id uuid not null references public.ws_habits(id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day      date not null,
  primary key (habit_id, day)
);
create index if not exists habit_checkins_day_idx on public.ws_habit_checkins (user_id, day);
select ws_private.secure_table('public.ws_habit_checkins');


create or replace function ws_private.row_tags(kind text, target uuid) returns text[] language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(t.name order by t.name),'{}') from public.tags t join public.item_tags i on t.id=i.tag_id where i.entity_type=kind and i.entity_id=target and t.deleted_at is null;
$$;
create or replace function ws_private.set_tags(kind text,target uuid,labels text[]) returns void language plpgsql security invoker set search_path='' as $$
declare label text; tid uuid;
begin
 delete from public.item_tags where entity_type=kind and entity_id=target;
 foreach label in array coalesce(labels,'{}') loop
  if trim(label)='' then continue; end if;
  insert into public.tags(user_id,name) values(auth.uid(),trim(label)) on conflict(user_id,name) do update set deleted_at=null returning id into tid;
  insert into public.item_tags(tag_id,entity_type,entity_id) values(tid,kind,target) on conflict do nothing;
 end loop;
end $$;
create or replace view public.ws_projects with(security_invoker=true) as
select p.id,p.user_id,p.name as title,p.description,
 case when p.status='Archived' then 'archived' else p.ws_status end as status,p.area,p.start_date,p.target_date,p.completed_on,
 ws_private.row_tags('project',p.id) as tags,
 coalesce((select jsonb_agg(jsonb_build_object('label',l.label,'url',l.url) order by l.position) from public.project_links l where l.project_id=p.id and l.deleted_at is null),'[]'::jsonb) as links,
 p.pinned,p.created_at,p.updated_at from public.projects p where p.deleted_at is null;
create or replace view public.ws_tasks with(security_invoker=true) as
select t.id,t.user_id,t.title,t.notes as description,
 case when t.cancelled then 'cancelled' when t.status='Done' then 'done' when t.status in ('In progress','Review') then 'in_progress' else 'todo' end as status,
 lower(t.priority) as priority,(t.due_at at time zone coalesce((select timezone from public.profiles where id=t.user_id),'Asia/Kolkata'))::date as due_date,
 t.project_id,t.meeting_id,t.deadline_id,ws_private.row_tags('task',t.id) as tags,t.recurrence,t.series_id,t.previous_id,t.completed_at,t.created_at,t.updated_at
 from public.tasks t where t.deleted_at is null;
grant select,insert,update,delete on public.ws_projects,public.ws_tasks to authenticated;
revoke all on public.ws_projects,public.ws_tasks from anon;
create or replace function ws_private.write_project() returns trigger language plpgsql security invoker set search_path='' as $$
declare link jsonb;
begin
 if TG_OP='DELETE' then perform public.move_to_trash('projects',old.id);return old;end if;
 if TG_OP='INSERT' then
  insert into public.projects(id,user_id,name,description,status,ws_status,area,start_date,target_date,completed_on,pinned)
  values(coalesce(new.id,gen_random_uuid()),auth.uid(),new.title,new.description,case when new.status='archived' then 'Archived' else 'Active' end,coalesce(new.status,'active'),coalesce(new.area,'research'),new.start_date,new.target_date,new.completed_on,coalesce(new.pinned,false)) returning id into new.id;
 else
  update public.projects set name=new.title,description=new.description,status=case when new.status='archived' then 'Archived' else 'Active' end,ws_status=new.status,area=new.area,start_date=new.start_date,target_date=new.target_date,completed_on=new.completed_on,pinned=new.pinned where id=old.id;
 end if;
 if TG_OP='INSERT' or new.tags is distinct from old.tags then perform ws_private.set_tags('project',new.id,new.tags);end if;
 if TG_OP='INSERT' or new.links is distinct from old.links then
  update public.project_links set deleted_at=now() where project_id=new.id and deleted_at is null;
  for link in select value from jsonb_array_elements(coalesce(new.links,'[]')) loop
   insert into public.project_links(user_id,project_id,label,url) values(auth.uid(),new.id,link->>'label',link->>'url');
  end loop;
 end if;
 select * into new from public.ws_projects where id=new.id;return new;
end $$;
drop trigger if exists ws_projects_write on public.ws_projects;
create trigger ws_projects_write instead of insert or update or delete on public.ws_projects for each row execute function ws_private.write_project();
create or replace function ws_private.write_task() returns trigger language plpgsql security invoker set search_path='' as $$
declare zone text; target_status public.task_status; target_stage uuid; transition boolean;
begin
 if TG_OP='DELETE' then perform public.move_to_trash('tasks',old.id);return old;end if;
 select coalesce(timezone,'Asia/Kolkata') into zone from public.profiles where id=auth.uid();zone:=coalesce(zone,'Asia/Kolkata');
 target_status:=case when new.status in ('done','cancelled') then 'Done'::public.task_status when new.status='in_progress' then 'In progress'::public.task_status else 'Backlog'::public.task_status end;
 transition:=TG_OP='INSERT' or new.status is distinct from old.status or new.project_id is distinct from old.project_id;
 if TG_OP='UPDATE' and new.status is not distinct from old.status then
  select status into target_status from public.tasks where id=old.id;
 end if;
 if transition and new.project_id is not null then
  select id into target_stage from public.project_stages where project_id=new.project_id and category=target_status and deleted_at is null order by position,id limit 1;
  if target_stage is null then
   insert into public.project_stages(user_id,project_id,name,category,position)
    values(auth.uid(),new.project_id,target_status::text||' · '||left(gen_random_uuid()::text,6),target_status,100) returning id into target_stage;
  end if;
 end if;
 if TG_OP='INSERT' then
  insert into public.tasks(id,user_id,title,notes,status,stage_id,priority,due_at,project_id,meeting_id,deadline_id,recurrence,cancelled)
  values(coalesce(new.id,gen_random_uuid()),auth.uid(),new.title,new.description,target_status,target_stage,initcap(coalesce(new.priority,'medium')),new.due_date::timestamp at time zone zone,new.project_id,new.meeting_id,new.deadline_id,new.recurrence,coalesce(new.status='cancelled',false)) returning id into new.id;
 else
  -- Do not touch stage/project columns for ordinary edits: the legacy trigger derives status from them.
  update public.tasks set title=new.title,notes=new.description,
   priority=initcap(new.priority),due_at=case when new.due_date is distinct from old.due_date then new.due_date::timestamp at time zone zone else due_at end,
   meeting_id=new.meeting_id,deadline_id=new.deadline_id,recurrence=new.recurrence,cancelled=new.status='cancelled' where id=old.id;
  if transition then update public.tasks set project_id=new.project_id,stage_id=target_stage,status=target_status where id=old.id; end if;
 end if;
 if TG_OP='INSERT' or new.tags is distinct from old.tags then perform ws_private.set_tags('task',new.id,new.tags);end if;
 select * into new from public.ws_tasks where id=new.id;return new;
end $$;
drop trigger if exists ws_tasks_write on public.ws_tasks;
create trigger ws_tasks_write instead of insert or update or delete on public.ws_tasks for each row execute function ws_private.write_task();

-- Turn an action item into a task linked back to the meeting. Converting twice returns the same task.
create or replace function public.ws_convert_action_item(item_id uuid, due date default null, project uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item     public.ws_meeting_action_items;
  new_task uuid;
  proj     uuid := project;
begin
  select * into item from public.ws_meeting_action_items where id = item_id for update;
  if not found then
    raise exception 'Action item not found';
  end if;
  if item.task_id is not null then
    return item.task_id;
  end if;
  if proj is null then
    select min(mp.project_id::text)::uuid into proj
    from public.ws_meeting_projects mp where mp.meeting_id = item.meeting_id
    having count(*) = 1;
  end if;
  insert into public.ws_tasks (title, due_date, project_id, meeting_id, status)
  values (item.text, due, proj, item.meeting_id, case when item.done then 'done' else 'todo' end)
  returning id into new_task;
  update public.ws_meeting_action_items set task_id = new_task where id = item_id;
  return new_task;
end
$$;
revoke all on function public.ws_convert_action_item(uuid, date, uuid) from public, anon;
grant execute on function public.ws_convert_action_item(uuid, date, uuid) to authenticated;

create or replace function public.ws_next_occurrence(d date, rule jsonb)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  step     int := greatest(coalesce((rule->>'interval')::int, 1), 1);
  days     int[];
  candidate date;
  result   date;
begin
  case rule->>'freq'
    when 'daily' then result := d + step;
    when 'monthly' then result := (d + make_interval(months => step))::date;
    when 'yearly' then result := (d + make_interval(years => step))::date;
    when 'weekly' then
      select array_agg(x::int) into days from jsonb_array_elements_text(coalesce(rule->'weekdays', '[]')) x;
      if days is null then
        result := d + 7 * step;
      else
        -- first listed weekday after d, in a week that is a multiple of `step` weeks away
        for i in 1 .. 7 * step + 7 loop
          candidate := d + i;
          if extract(isodow from candidate)::int = any (days)
             and ((date_trunc('week', candidate)::date - date_trunc('week', d)::date) / 7) % step = 0 then
            result := candidate;
            exit;
          end if;
        end loop;
      end if;
    else
      return null;
  end case;
  if rule ? 'until' and result > (rule->>'until')::date then
    return null;
  end if;
  return result;
end
$$;

-- Stamp completion time, and give recurring tasks a series id.
create or replace function ws_private.tasks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.meeting_id is not null and not exists(select 1 from public.ws_meetings where id=new.meeting_id and user_id=new.user_id) then raise exception 'Linked meeting must belong to this account'; end if;
  if new.deadline_id is not null and not exists(select 1 from public.ws_deadlines where id=new.deadline_id and user_id=new.user_id) then raise exception 'Linked deadline must belong to this account'; end if;
  if new.previous_id is not null and not exists(select 1 from public.tasks where id=new.previous_id and user_id=new.user_id) then raise exception 'Previous task must belong to this account'; end if;
  if new.recurrence is not null and new.series_id is null then
    new.series_id := new.id;
  end if;
  if new.status = 'Done' and (tg_op = 'INSERT' or old.status is distinct from 'Done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'Done' then
    new.completed_at := null;
  end if;
  return new;
end
$$;
drop trigger if exists tasks_before_write on public.tasks;
create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function ws_private.tasks_before_write();

-- Completing a recurring task creates the next occurrence (once). The done task stays as history.
create or replace function ws_private.tasks_spawn_next()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  next_due date; next_id uuid; zone text;
begin
  zone:=coalesce((select timezone from public.profiles where id=new.user_id),'Asia/Kolkata');
  if current_setting('workspace.restoring',true) = 'on' then return null; end if;
  if new.status = 'Done' and old.status is distinct from 'Done' and new.recurrence is not null and not new.cancelled
     and not exists (select 1 from public.tasks t where t.previous_id = new.id) then
    next_due := public.ws_next_occurrence(coalesce((new.due_at at time zone coalesce((select timezone from public.profiles where id=new.user_id),'Asia/Kolkata'))::date, current_date), new.recurrence);
    if next_due is not null then
      insert into public.tasks (user_id, title, notes, priority, due_at, project_id,
                                recurrence, series_id, previous_id, assignee_id, publication_id)
      values (new.user_id, new.title, new.notes, new.priority, (next_due+coalesce((new.due_at at time zone zone)::time,'00:00'::time)) at time zone zone, new.project_id,
              new.recurrence, new.series_id, new.id, new.assignee_id, new.publication_id) returning id into next_id;
      insert into public.item_tags(tag_id,entity_type,entity_id) select tag_id,entity_type,next_id from public.item_tags where entity_type='task' and entity_id=new.id;
    end if;
  end if;
  return null;
end
$$;
drop trigger if exists tasks_spawn_next on public.tasks;
create trigger tasks_spawn_next after update of status on public.tasks
  for each row execute function ws_private.tasks_spawn_next();

-- Attachments (file metadata; the files themselves are in Storage) and global search. Run last.

create table if not exists public.ws_attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null unique,          -- <owner-uid>/<uuid>/<file name> in bucket workspace-files
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  project_id   uuid references public.projects(id) on delete cascade,
  paper_id     uuid references public.ws_papers(id) on delete cascade,
  note_id      uuid references public.ws_notes(id) on delete cascade,
  meeting_id   uuid references public.ws_meetings(id) on delete cascade,
  deadline_id  uuid references public.ws_deadlines(id) on delete cascade,
  created_at   timestamptz not null default now(),
  check (num_nonnulls(project_id, paper_id, note_id, meeting_id, deadline_id) = 1),
  check (split_part(storage_path, '/', 1) = user_id::text)
);
create index if not exists attachments_project_idx on public.ws_attachments (project_id);
create index if not exists attachments_paper_idx on public.ws_attachments (paper_id);
create index if not exists attachments_note_idx on public.ws_attachments (note_id);
create index if not exists attachments_meeting_idx on public.ws_attachments (meeting_id);
create index if not exists attachments_deadline_idx on public.ws_attachments (deadline_id);
select ws_private.secure_table('public.ws_attachments');

-- Search across the main record types. Runs as the caller, so RLS limits it to the owner's rows.
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
grant execute on function public.ws_search_workspace(text, int) to authenticated;
revoke all on function public.ws_search_workspace(text, int) from public, anon;

-- All tags in use, for autocomplete and filters.
create or replace function public.ws_all_tags()
returns table (tag text, uses bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select tag, count(*) from (
    select unnest(tags) as tag from public.ws_projects
    union all select unnest(tags) from public.ws_tasks
    union all select unnest(tags) from public.ws_papers
    union all select unnest(tags) from public.ws_notes
    union all select unnest(tags) from public.ws_meetings
    union all select unnest(tags) from public.ws_deadlines
  ) t
  group by tag
  order by count(*) desc, tag
$$;
grant execute on function public.ws_all_tags() to authenticated;
revoke all on function public.ws_all_tags() from public, anon;


create or replace function ws_private.check_links() returns trigger language plpgsql security invoker set search_path='' as $$
declare fk record; ok boolean; value uuid;
begin
 for fk in select * from (values ('project_id','projects'),('task_id','tasks'),('paper_id','ws_papers'),('meeting_id','ws_meetings'),('note_id','ws_notes'),('deadline_id','ws_deadlines'),('contact_id','ws_contacts'),('loan_id','ws_loans'),('category_id','ws_budget_categories'),('habit_id','ws_habits')) as refs(col,tbl) loop
  value:=(to_jsonb(new)->>fk.col)::uuid;
  if value is not null then
   execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',fk.tbl) into ok using value,new.user_id;
   if not ok then raise exception 'Linked record must belong to this account';end if;
  end if;
 end loop;return new;
end $$;

drop trigger if exists ws_check_links on public.ws_attachments; create trigger ws_check_links before insert or update on public.ws_attachments for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_budget_categories; create trigger ws_check_links before insert or update on public.ws_budget_categories for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_contacts; create trigger ws_check_links before insert or update on public.ws_contacts for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_deadlines; create trigger ws_check_links before insert or update on public.ws_deadlines for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_habit_checkins; create trigger ws_check_links before insert or update on public.ws_habit_checkins for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_habits; create trigger ws_check_links before insert or update on public.ws_habits for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_loan_payments; create trigger ws_check_links before insert or update on public.ws_loan_payments for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_loans; create trigger ws_check_links before insert or update on public.ws_loans for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_meeting_action_items; create trigger ws_check_links before insert or update on public.ws_meeting_action_items for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_meeting_participants; create trigger ws_check_links before insert or update on public.ws_meeting_participants for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_meeting_projects; create trigger ws_check_links before insert or update on public.ws_meeting_projects for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_meetings; create trigger ws_check_links before insert or update on public.ws_meetings for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_monthly_budgets; create trigger ws_check_links before insert or update on public.ws_monthly_budgets for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_notes; create trigger ws_check_links before insert or update on public.ws_notes for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_papers; create trigger ws_check_links before insert or update on public.ws_papers for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_project_papers; create trigger ws_check_links before insert or update on public.ws_project_papers for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_settings; create trigger ws_check_links before insert or update on public.ws_settings for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_transactions; create trigger ws_check_links before insert or update on public.ws_transactions for each row execute function ws_private.check_links();
revoke all on all functions in schema ws_private from public; grant execute on all functions in schema ws_private to authenticated; revoke execute on function ws_private.secure_table(regclass) from authenticated;

-- Portable owned-record export; no OAuth tokens, Telegram codes, or sharing ACLs.
create or replace function public.ws_backup_data() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t text; rows jsonb; result jsonb := '{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 foreach t in array array['people','projects','project_people','project_stages','project_links','project_fields','publications','publication_nodes','publication_stage_events','tags','documents','job_applications','inbox_items','reads','ws_settings','ws_contacts','ws_papers','ws_project_papers','ws_notes','ws_meetings','ws_meeting_projects','ws_meeting_participants','ws_deadlines','tasks','reminders','item_tags','ws_meeting_action_items','ws_loans','ws_loan_payments','ws_budget_categories','ws_transactions','ws_monthly_budgets','ws_habits','ws_habit_checkins','ws_attachments'] loop
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
revoke all on function public.ws_backup_data() from public,anon;
grant execute on function public.ws_backup_data() to authenticated;

-- Restore is one transaction, respects all RLS, and never changes account ownership.
create or replace function public.ws_restore_data(owner_id uuid, payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t text; r jsonb; original jsonb; cols text; updates text; keys text; n int; result jsonb := '{}'; fresh boolean;
begin
 if auth.uid() is null or owner_id <> auth.uid() then raise exception 'Restore requires the original account'; end if;
 perform set_config('workspace.restoring','on',true);
 foreach t in array array['people','projects','project_people','project_stages','project_links','project_fields','publications','publication_nodes','publication_stage_events','tags','documents','job_applications','inbox_items','reads','ws_settings','ws_contacts','ws_papers','ws_project_papers','ws_notes','ws_meetings','ws_meeting_projects','ws_meeting_participants','ws_deadlines','tasks','reminders','item_tags','ws_meeting_action_items','ws_loans','ws_loan_payments','ws_budget_categories','ws_transactions','ws_monthly_budgets','ws_habits','ws_habit_checkins','ws_attachments'] loop
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
revoke all on function public.ws_restore_data(uuid,jsonb) from public,anon;
grant execute on function public.ws_restore_data(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
