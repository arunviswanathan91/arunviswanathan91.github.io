-- Morning briefing on Telegram, daily paper alerts and a funding finder.
-- Run after planning.sql. Rerunnable.
--
-- Everything runs from the existing telegram-reminder-sweep (every minute, service role):
--  · ws_morning_briefing() queues one "Good morning" reminder a day at each user's chosen time;
--  · the sweep fetches new papers (Europe PMC: PubMed + bioRxiv/medRxiv preprints) and funding
--    calls (Grants.gov and any feeds you add) once a day, and stores them here.
-- Delivery reuses reminders, so a failed Telegram send is retried like any other reminder.
begin;

-- ── Settings ───────────────────────────────────────────────────────────────
alter table public.ws_settings add column if not exists briefing_time time;               -- null: no briefing
alter table public.ws_settings add column if not exists paper_alert_topics text[] not null default '{}';
alter table public.ws_settings add column if not exists paper_alerts_checked_on date;
alter table public.ws_settings add column if not exists funding_topics text[] not null default '{}';
alter table public.ws_settings add column if not exists funding_feeds text[] not null default '{}';
alter table public.ws_settings add column if not exists funding_checked_on date;

-- ── Paper alerts ───────────────────────────────────────────────────────────
create table if not exists public.ws_paper_alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source       text not null check (source in ('pubmed','preprint')),
  external_id  text not null,                      -- Europe PMC id: a PMID, or PPR… for preprints
  pmid         text,
  doi          text,
  title        text not null check (length(trim(title)) > 0),
  authors      text[] not null default '{}',
  journal      text,                               -- journal, or the preprint server
  published_on date,
  abstract     text,
  url          text,
  topics       text[] not null default '{}',       -- which of your topics it matched
  score        real not null default 0,
  status       text not null default 'new' check (status in ('new','saved','dismissed')),
  paper_id     uuid references public.ws_papers(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (user_id, external_id)
);
create index if not exists paper_alerts_new_idx on public.ws_paper_alerts (user_id, status, score desc);
select ws_private.secure_table('public.ws_paper_alerts');

-- ── Funding calls ──────────────────────────────────────────────────────────
create table if not exists public.ws_funding_calls (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source       text not null default 'manual' check (source in ('grants_gov','feed','manual')),
  external_id  text,                               -- the source's id; null for ones you add
  title        text not null check (length(trim(title)) > 0),
  funder       text not null default '',
  kind         text not null default 'grant' check (kind in ('grant','fellowship','travel','award','other')),
  url          text,
  amount       text not null default '',
  opens_on     date,
  closes_on    date,
  summary      text not null default '',
  topics       text[] not null default '{}',
  status       text not null default 'new' check (status in ('new','interested','applying','submitted','awarded','rejected','dismissed')),
  deadline_id  uuid references public.ws_deadlines(id) on delete set null,
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- One row per call per source (calls you add yourself have no external_id; NULLs never clash).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'funding_calls_source_key') then
    alter table public.ws_funding_calls add constraint funding_calls_source_key unique (user_id, source, external_id);
  end if;
end $$;
create index if not exists funding_calls_status_idx on public.ws_funding_calls (user_id, status, closes_on);
select ws_private.secure_table('public.ws_funding_calls');
drop trigger if exists funding_calls_touch on public.ws_funding_calls;
create trigger funding_calls_touch before update on public.ws_funding_calls for each row execute function ws_private.touch_updated_at();
drop trigger if exists funding_check_deadline on public.ws_funding_calls;
create trigger funding_check_deadline before insert or update of deadline_id, user_id on public.ws_funding_calls
  for each row execute function ws_private.check_owned_link('deadline_id', 'ws_deadlines');
drop trigger if exists alerts_check_paper on public.ws_paper_alerts;
create trigger alerts_check_paper before insert or update of paper_id, user_id on public.ws_paper_alerts
  for each row execute function ws_private.check_owned_link('paper_id', 'ws_papers');

revoke truncate, references, trigger on public.ws_paper_alerts, public.ws_funding_calls from authenticated, anon, public;

-- ── Morning briefing ───────────────────────────────────────────────────────
-- Called every minute by telegram-reminder-sweep. Once a day, at or after each user's
-- briefing_time (their time zone), it queues one reminder that the sweep then sends.
create or replace function public.ws_morning_briefing() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s record; tz text; local timestamp; d date; n int := 0; lines text[]; x text; cnt int;
begin
  for s in select st.* from public.ws_settings st where st.briefing_time is not null loop
    tz := coalesce((select timezone from public.profiles where id = s.user_id), s.timezone, 'Asia/Kolkata');
    local := now() at time zone tz;
    d := local::date;
    if local::time < s.briefing_time then continue; end if;
    if exists (select 1 from public.reminders where user_id = s.user_id and nudge_key = 'briefing:' || d) then continue; end if;
    lines := '{}';

    -- Tasks due today, and how many are overdue.
    select string_agg('• ' || t.title, E'\n' order by t.due_at), count(*) into x, cnt
      from (select title, due_at from public.tasks
             where user_id = s.user_id and deleted_at is null and not coalesce(cancelled, false) and status <> 'Done'
               and (due_at at time zone tz)::date = d order by due_at limit 8) t;
    if cnt > 0 then lines := lines || ('✅ Due today' || E'\n' || x); end if;
    select count(*) into cnt from public.tasks
     where user_id = s.user_id and deleted_at is null and not coalesce(cancelled, false) and status <> 'Done'
       and (due_at at time zone tz)::date < d;
    if cnt > 0 then lines := lines || ('⚠️ ' || cnt || ' overdue task' || case when cnt > 1 then 's' else '' end); end if;

    -- Meetings today.
    select string_agg('• ' || to_char(m.starts_at at time zone tz, 'HH24:MI') || '  ' || m.title, E'\n' order by m.starts_at) into x
      from public.ws_meetings m where m.user_id = s.user_id and (m.starts_at at time zone tz)::date = d;
    if x is not null then lines := lines || ('👥 Meetings' || E'\n' || x); end if;

    -- Deadlines in the next 3 days.
    select string_agg('• ' || dl.title || ' — ' || case when dl.due_date = d then 'today' when dl.due_date = d + 1 then 'tomorrow' else to_char(dl.due_date, 'Dy DD Mon') end, E'\n' order by dl.due_date) into x
      from public.ws_deadlines dl
     where dl.user_id = s.user_id and dl.status in ('upcoming','in_progress') and dl.due_date between d and d + 3;
    if x is not null then lines := lines || ('📅 Coming up' || E'\n' || x); end if;

    -- Experiments on the bench.
    select string_agg('• ' || e.title, E'\n' order by e.updated_at desc) into x
      from (select title, updated_at from public.ws_experiments
             where user_id = s.user_id and archived_at is null and status in ('running','analysing') order by updated_at desc limit 5) e;
    if x is not null then lines := lines || ('🧪 On the bench' || E'\n' || x); end if;

    -- New paper alerts and funding calls closing within two weeks.
    select count(*) into cnt from public.ws_paper_alerts where user_id = s.user_id and status = 'new';
    if cnt > 0 then lines := lines || ('📚 ' || cnt || ' new paper' || case when cnt > 1 then 's' else '' end || ' match your topics'); end if;
    select string_agg('• ' || f.title || ' — closes ' || to_char(f.closes_on, 'DD Mon'), E'\n' order by f.closes_on) into x
      from public.ws_funding_calls f
     where f.user_id = s.user_id and f.status in ('interested','applying') and f.closes_on between d and d + 14;
    if x is not null then lines := lines || ('💰 Funding closing soon' || E'\n' || x); end if;

    insert into public.reminders (user_id, title, body, remind_at, done, notified_at, nudge_key)
    values (s.user_id, 'Good morning — ' || to_char(d, 'FMDay FMDD FMMonth'),
            coalesce(nullif(array_to_string(lines, E'\n\n'), ''), 'Nothing due today. A clear day for deep work.'),
            now(), false, null, 'briefing:' || d)
    on conflict (user_id, nudge_key) where nudge_key is not null do nothing;
    n := n + 1;
  end loop;
  return jsonb_build_object('briefings', n);
end $$;
revoke all on function public.ws_morning_briefing() from public, anon, authenticated;
grant execute on function public.ws_morning_briefing() to service_role;

-- ── Backup and restore include the new tables (patched in place) ───────────
do $patch$
declare p record; def text; n int;
begin
  for p in select * from (values
    ('public.ws_backup_data()', 'ws_funding_calls', $s$'ws_attachments'$s$, $s$'ws_paper_alerts','ws_funding_calls','ws_attachments'$s$),
    ('public.ws_restore_data(uuid,jsonb)', 'ws_funding_calls', $s$'ws_attachments'$s$, $s$'ws_paper_alerts','ws_funding_calls','ws_attachments'$s$)
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
