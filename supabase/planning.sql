-- Thesis tracker, yearly goals and conference trips. Run after experiments.sql. Rerunnable.
--
-- Thesis milestones (DAC meetings, synopsis, pre-submission seminar) and trip deadlines
-- (abstracts, registration) are ordinary rows in ws_deadlines, so they already reach the
-- agenda, the calendar feed and Telegram reminders.
--
-- Like experiments.sql, existing functions are taught about the new tables by patching
-- them in place (search, Trash, backup and restore); nothing is re-created from a copy.
begin;

-- ── Thesis ─────────────────────────────────────────────────────────────────
create table if not exists public.ws_thesis (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  title          text not null default '',
  submission_on  date,
  target_words   int check (target_words is null or target_words > 0),
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select ws_private.secure_table('public.ws_thesis');
drop trigger if exists thesis_touch on public.ws_thesis;
create trigger thesis_touch before update on public.ws_thesis for each row execute function ws_private.touch_updated_at();

create table if not exists public.ws_thesis_chapters (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position       int not null default 0,
  title          text not null default 'Untitled chapter' check (length(trim(title)) > 0),
  status         text not null default 'not_started'
                 check (status in ('not_started','outlining','drafting','revising','with_supervisor','final')),
  words          int not null default 0 check (words >= 0),
  target_words   int check (target_words is null or target_words > 0),
  due_on         date,
  -- The manuscript a chapter is built on, if any.
  publication_id uuid references public.publications(id) on delete set null,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists thesis_chapters_order_idx on public.ws_thesis_chapters (user_id, position);
select ws_private.secure_table('public.ws_thesis_chapters');
drop trigger if exists thesis_chapters_touch on public.ws_thesis_chapters;
create trigger thesis_chapters_touch before update on public.ws_thesis_chapters for each row execute function ws_private.touch_updated_at();

create table if not exists public.ws_thesis_feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- null: about the thesis as a whole.
  chapter_id   uuid references public.ws_thesis_chapters(id) on delete cascade,
  source       text not null default 'supervisor' check (source in ('supervisor','dac','examiner','peer','other')),
  given_on     date not null default current_date,
  body         text not null check (length(trim(body)) > 0),
  addressed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists thesis_feedback_chapter_idx on public.ws_thesis_feedback (chapter_id);
create index if not exists thesis_feedback_open_idx on public.ws_thesis_feedback (user_id) where addressed_at is null;
select ws_private.secure_table('public.ws_thesis_feedback');

-- ── Goals ──────────────────────────────────────────────────────────────────
create table if not exists public.ws_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year        int not null default extract(year from current_date)::int check (year between 2000 and 2100),
  title       text not null check (length(trim(title)) > 0),
  area        text not null default 'research' check (area in ('research','career','learning','health','money','personal')),
  -- How progress is measured: a number you update, a checklist, a project's tasks,
  -- days a habit was done this year, or a savings account's balance.
  measure     text not null default 'manual' check (measure in ('manual','milestones','project','habit','savings')),
  target      numeric check (target is null or target > 0),
  current     numeric not null default 0,
  unit        text not null default '',
  milestones  jsonb not null default '[]'::jsonb check (jsonb_typeof(milestones) = 'array'),
  project_id  uuid references public.projects(id) on delete set null,
  habit_id    uuid references public.ws_habits(id) on delete set null,
  account_id  uuid references public.ws_savings_accounts(id) on delete set null,
  due_on      date,
  status      text not null default 'active' check (status in ('active','achieved','dropped')),
  notes       text not null default '',
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists goals_year_idx on public.ws_goals (user_id, year, position);
select ws_private.secure_table('public.ws_goals');
drop trigger if exists goals_touch on public.ws_goals;
create trigger goals_touch before update on public.ws_goals for each row execute function ws_private.touch_updated_at();

-- ── Trips (conferences, workshops, courses, lab visits) ─────────────────────
create table if not exists public.ws_trips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title            text not null default 'Untitled trip' check (length(trim(title)) > 0),
  kind             text not null default 'conference' check (kind in ('conference','workshop','course','lab_visit','other')),
  status           text not null default 'considering'
                   check (status in ('considering','abstract_submitted','accepted','registered','booked','attended','cancelled')),
  location         text not null default '',
  url              text,
  starts_on        date,
  ends_on          date,
  abstract_due     date,
  registration_due date,
  presentation     text not null default 'none' check (presentation in ('none','poster','oral','invited','attending')),
  abstract_title   text not null default '',
  abstract         text not null default '',
  project_id       uuid references public.projects(id) on delete set null,
  publication_id   uuid references public.publications(id) on delete set null,
  currency         text not null default 'INR',
  -- [{label, amount, paid, transaction_id}]: transaction_id once recorded in the budget.
  costs            jsonb not null default '[]'::jsonb check (jsonb_typeof(costs) = 'array'),
  -- [{source, amount, status: applied|awarded|declined, due_on}]: travel awards and grants.
  funding          jsonb not null default '[]'::jsonb check (jsonb_typeof(funding) = 'array'),
  checklist        jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists trips_dates_idx on public.ws_trips (user_id, starts_on);
select ws_private.secure_table('public.ws_trips');
drop trigger if exists trips_touch on public.ws_trips;
create trigger trips_touch before update on public.ws_trips for each row execute function ws_private.touch_updated_at();

-- RLS does not cover TRUNCATE, so signed-in users must not hold it (or REFERENCES/TRIGGER).
revoke truncate, references, trigger on public.ws_thesis, public.ws_thesis_chapters, public.ws_thesis_feedback, public.ws_goals, public.ws_trips
  from authenticated, anon, public;

-- ── Links must be your own records ─────────────────────────────────────────
-- check_links (patched by experiments.sql) covers project_id, publication_id and habit_id.
-- The two links it does not know are checked here; skipped while a backup is restored
-- (rows come back in any order, and the backup holds only the owner's rows).
create or replace function ws_private.check_owned_link() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare col text := tg_argv[0]; tbl text := tg_argv[1]; v uuid; ok boolean;
begin
  if coalesce(current_setting('workspace.restoring', true), '') = 'on' then return new; end if;
  v := (to_jsonb(new) ->> col)::uuid;
  if v is not null then
    execute format('select exists(select 1 from public.%I where id = $1 and user_id = $2)', tbl) into ok using v, new.user_id;
    if not ok then raise exception 'Linked record must belong to this account'; end if;
  end if;
  return new;
end $$;
revoke all on function ws_private.check_owned_link() from public, anon;
grant execute on function ws_private.check_owned_link() to authenticated;

drop trigger if exists ws_check_links on public.ws_thesis_chapters;
create trigger ws_check_links before insert or update on public.ws_thesis_chapters for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_goals;
create trigger ws_check_links before insert or update on public.ws_goals for each row execute function ws_private.check_links();
drop trigger if exists ws_check_links on public.ws_trips;
create trigger ws_check_links before insert or update on public.ws_trips for each row execute function ws_private.check_links();
drop trigger if exists feedback_check_chapter on public.ws_thesis_feedback;
create trigger feedback_check_chapter before insert or update of chapter_id, user_id on public.ws_thesis_feedback
  for each row execute function ws_private.check_owned_link('chapter_id', 'ws_thesis_chapters');
drop trigger if exists goals_check_account on public.ws_goals;
create trigger goals_check_account before insert or update of account_id, user_id on public.ws_goals
  for each row execute function ws_private.check_owned_link('account_id', 'ws_savings_accounts');

-- ── Teach existing functions about the new tables (patched in place) ───────
do $patch$
declare p record; def text; n int;
begin
  for p in select * from (values
    ('public.ws_search_workspace(text,integer)', 'ws_trips',
     $s$select 'publication', id,$s$,
     $s$select 'trip', tr.id, tr.title, concat_ws(' ', tr.location, tr.abstract_title, tr.abstract, tr.notes), tr.project_id, tr.updated_at, array[]::text[]
    from public.ws_trips tr
    union all
    select 'goal', g.id, g.title, g.notes, g.project_id, g.updated_at, array[]::text[]
    from public.ws_goals g where g.status <> 'dropped'
    union all
    select 'publication', id,$s$),
    ('public.ws_trash(text,uuid)', $s$'thesis_chapter'$s$,
     $s$when 'experiments' then 'experiment'$s$,
     $s$when 'experiments' then 'experiment' when 'thesis_chapters' then 'thesis_chapter' when 'goals' then 'goal' when 'trips' then 'trip'$s$),
    ('public.ws_backup_data()', 'ws_trips', $s$'ws_attachments'$s$,
     $s$'ws_thesis','ws_thesis_chapters','ws_thesis_feedback','ws_goals','ws_trips','ws_attachments'$s$),
    ('public.ws_restore_data(uuid,jsonb)', 'ws_trips', $s$'ws_attachments'$s$,
     $s$'ws_thesis','ws_thesis_chapters','ws_thesis_feedback','ws_goals','ws_trips','ws_attachments'$s$)
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

commit;
