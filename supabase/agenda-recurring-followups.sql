-- Agenda and calendar feed, recurring transactions, publication follow-ups.
-- Run after card-spending-habit-periods-reminders.sql. Rerunnable.
begin;

-- ── Settings ─────────────────────────────────────────────────────────────────
-- calendar_token: secret for the read-only calendar feed (null = feed off).
alter table public.ws_settings add column if not exists calendar_token uuid;
create unique index if not exists ws_settings_calendar_token_key on public.ws_settings (calendar_token) where calendar_token is not null;
-- Remind to chase a paper that has been Under Review / Revision Requested this many days (null = off).
alter table public.ws_settings add column if not exists publication_followup_days int default 60;
alter table public.ws_settings drop constraint if exists ws_settings_publication_followup_days_check;
alter table public.ws_settings add constraint ws_settings_publication_followup_days_check check (publication_followup_days is null or publication_followup_days > 0);

-- ── Recurring transactions ──────────────────────────────────────────────────
create table if not exists public.ws_recurring (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('income', 'expense')),
  description     text not null check (length(trim(description)) > 0),
  amount          numeric(14, 2) not null check (amount > 0),
  currency        text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  category_id     uuid references public.ws_budget_categories(id) on delete set null,
  loan_id         uuid references public.ws_loans(id) on delete set null,   -- card it is charged to
  payment_method  text,
  day_of_month    int not null check (day_of_month between 1 and 31),
  interval_months int not null default 1 check (interval_months between 1 and 12),
  next_on         date not null,
  ends_on         date,
  paused          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
select ws_private.secure_table('public.ws_recurring');
drop trigger if exists recurring_touch on public.ws_recurring;
create trigger recurring_touch before update on public.ws_recurring for each row execute function ws_private.touch_updated_at();
drop trigger if exists ws_check_links on public.ws_recurring;
create trigger ws_check_links before insert or update on public.ws_recurring for each row execute function ws_private.check_links();
alter table public.ws_transactions add column if not exists recurring_id uuid references public.ws_recurring(id) on delete set null;

-- Same day of month, `months` later, clamped to the month's last day.
create or replace function ws_private.next_monthly(d date, dom int, months int) returns date
language sql immutable set search_path = '' as $$
 select (m + (least(dom, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1))::date
   from (select (date_trunc('month', d) + make_interval(months => months))::date as m) x
$$;

-- Turn every due occurrence into a transaction (at most 24 per rule, so a long pause can't flood the budget).
create or replace function ws_private.post_recurring(p_user uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; tz text; today date; n int := 0; guard int; nxt date;
begin
 select coalesce((select s.timezone from public.ws_settings s where s.user_id = p_user), 'Asia/Kolkata') into tz;
 today := (now() at time zone tz)::date;
 for r in select * from public.ws_recurring where user_id = p_user and not paused and next_on <= today for update loop
  nxt := r.next_on; guard := 0;
  while nxt <= today and (r.ends_on is null or nxt <= r.ends_on) and guard < 24 loop
   insert into public.ws_transactions (user_id, kind, description, amount, currency, category_id, occurred_on, payment_method, notes, loan_id, recurring_id)
   values (p_user, r.kind, r.description, r.amount, r.currency, r.category_id, nxt, r.payment_method, 'Recurring', r.loan_id, r.id);
   nxt := ws_private.next_monthly(nxt, r.day_of_month, r.interval_months);
   n := n + 1; guard := guard + 1;
  end loop;
  update public.ws_recurring set next_on = nxt where id = r.id;
 end loop;
 return n;
end $$;
revoke all on function ws_private.post_recurring(uuid) from public, anon, authenticated;

-- The Budget page calls this on load, so recurring items appear even without the scheduled sweep.
create or replace function public.ws_post_recurring() returns int
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then return 0; end if;
 return ws_private.post_recurring(auth.uid());
end $$;
revoke all on function public.ws_post_recurring() from public, anon;
grant execute on function public.ws_post_recurring() to authenticated;

-- ── Agenda ──────────────────────────────────────────────────────────────────
-- Everything dated in one list. `path` is the dashboard hash after "#/".
create or replace function ws_private.agenda_rows(p_user uuid, p_from date, p_to date)
returns table (kind text, ref_id uuid, title text, day date, at timestamptz, detail text, path text, urgent boolean)
language sql stable security definer set search_path = '' as $$
 with s as (select coalesce((select st.timezone from public.ws_settings st where st.user_id = p_user), 'Asia/Kolkata') as tz),
 loans as (
  select l.*, coalesce(l.account_name, c.name, 'Loan') as label,
         coalesce((select sum(p.amount) from public.ws_loan_payments p where p.loan_id = l.id), 0) as paid,
         coalesce((select sum(case when t.kind = 'expense' then t.amount when t.kind = 'income' then -t.amount else 0 end) from public.ws_transactions t where t.loan_id = l.id), 0) as charged
    from public.ws_loans l left join public.ws_contacts c on c.id = l.contact_id
   where l.user_id = p_user and l.direction = 'borrowed'
 )
 select 'task', t.id, t.title, (t.due_at at time zone s.tz)::date, t.due_at, t.priority || ' priority', 'tools/tasks', t.priority = 'High'
   from public.tasks t, s
  where t.user_id = p_user and t.deleted_at is null and t.status <> 'Done' and not coalesce(t.cancelled, false)
    and t.due_at is not null and (t.due_at at time zone s.tz)::date between p_from and p_to
 union all
 select 'deadline', d.id, d.title, d.due_date, case when d.due_time is not null then (d.due_date + d.due_time) at time zone s.tz end,
        replace(d.category, '_', ' '), 'tools/deadlines/' || d.id, d.priority in ('high', 'urgent')
   from public.ws_deadlines d, s
  where d.user_id = p_user and d.status in ('upcoming', 'in_progress') and d.due_date between p_from and p_to
 union all
 select 'meeting', m.id, m.title, (m.starts_at at time zone s.tz)::date, m.starts_at, m.location, 'tools/meetings/' || m.id, false
   from public.ws_meetings m, s
  where m.user_id = p_user and m.archived_at is null and (m.starts_at at time zone s.tz)::date between p_from and p_to
 union all
 select 'publication', p.id, p.title, (p.due_at at time zone s.tz)::date, p.due_at, p.stage::text || coalesce(' · ' || p.next_action, ''), 'publication/' || p.id, false
   from public.publications p, s
  where p.user_id = p_user and p.deleted_at is null and p.stage not in ('Published', 'Rejected')
    and p.due_at is not null and (p.due_at at time zone s.tz)::date between p_from and p_to
 union all
 select 'opportunity', o.id, o.role || coalesce(' · ' || o.organization, ''), (o.deadline at time zone s.tz)::date, o.deadline, 'Application deadline', 'opportunities', true
   from public.opportunities o, s
  where o.user_id = p_user and o.deleted_at is null and o.status in ('Shortlisted', 'Tracked')
    and o.deadline is not null and (o.deadline at time zone s.tz)::date between p_from and p_to
 union all
 select 'emi', l.id, 'EMI · ' || l.label, e.d, null::timestamptz, ws_private.money(l.emi_amount, l.currency), 'tools/loans', e.d < (now() at time zone s.tz)::date
   from loans l cross join s
   cross join lateral (
    select (l.emi_first_on + make_interval(months => i))::date as d
      from generate_series(floor(l.paid / l.emi_amount)::int, coalesce(l.emi_tenure, floor(l.paid / l.emi_amount)::int + 36) - 1) i
   ) e
  where l.emi_amount is not null and l.emi_first_on is not null and l.amount + l.charged - l.paid > 0 and e.d between p_from and p_to
 union all
 select 'card', l.id, 'Card bill · ' || l.label, l.statement_due_on, null::timestamptz,
        ws_private.money(l.statement_amount - x.since, l.currency) || ' left on the statement', 'tools/loans', l.statement_due_on < (now() at time zone s.tz)::date
   from loans l cross join s
   cross join lateral (select coalesce((select sum(p.amount) from public.ws_loan_payments p where p.loan_id = l.id and p.paid_on >= l.statement_on), 0) as since) x
  where l.account_type = 'credit_card' and l.statement_amount is not null and l.statement_on is not null and l.statement_due_on is not null
    and l.statement_amount - x.since > 0 and l.statement_due_on between p_from and p_to
 union all
 select 'recurring', r.id, r.description, r.next_on, null::timestamptz, (case when r.kind = 'income' then '+' else '' end) || ws_private.money(r.amount, r.currency), 'tools/budget', false
   from public.ws_recurring r
  where r.user_id = p_user and not r.paused and r.next_on between p_from and p_to and (r.ends_on is null or r.next_on <= r.ends_on)
$$;
revoke all on function ws_private.agenda_rows(uuid, date, date) from public, anon, authenticated;

create or replace function public.ws_agenda(p_from date, p_to date)
returns table (kind text, ref_id uuid, title text, day date, at timestamptz, detail text, path text, urgent boolean)
language sql stable security definer set search_path = '' as $$
 select * from ws_private.agenda_rows(auth.uid(), p_from, p_to) where auth.uid() is not null order by 4, 5 nulls first, 3
$$;
revoke all on function public.ws_agenda(date, date) from public, anon;
grant execute on function public.ws_agenda(date, date) to authenticated;

-- For the Telegram bot (service role only).
create or replace function public.ws_agenda_for_user(p_user uuid, p_from date, p_to date)
returns table (kind text, ref_id uuid, title text, day date, at timestamptz, detail text, path text, urgent boolean)
language sql stable security definer set search_path = '' as $$
 select * from ws_private.agenda_rows(p_user, p_from, p_to) order by 4, 5 nulls first, 3
$$;
revoke all on function public.ws_agenda_for_user(uuid, date, date) from public, anon, authenticated;
grant execute on function public.ws_agenda_for_user(uuid, date, date) to service_role;

-- For the calendar-feed Edge Function (service role only): 30 days back to a year ahead.
create or replace function public.ws_calendar_feed(p_token uuid)
returns table (kind text, ref_id uuid, title text, day date, at timestamptz, detail text, path text, urgent boolean, tz text)
language sql stable security definer set search_path = '' as $$
 select a.*, s.timezone from public.ws_settings s
  cross join lateral ws_private.agenda_rows(s.user_id, (now() at time zone s.timezone)::date - 30, (now() at time zone s.timezone)::date + 365) a
  where p_token is not null and s.calendar_token = p_token
$$;
revoke all on function public.ws_calendar_feed(uuid) from public, anon, authenticated;
grant execute on function public.ws_calendar_feed(uuid) to service_role;

-- ── Daily job, backup and restore (recreated to cover the above) ────────────
create or replace function public.ws_daily_nudges() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s record; tz text; local timestamp; d date; open_list text; n int := 0; loan uuid;
begin
 for s in select st.* from public.ws_settings st loop
  tz := coalesce(s.timezone, 'Asia/Kolkata');
  local := now() at time zone tz;
  d := local::date;

  -- Once a day after 08:00 local: refresh loan reminders, post due recurring transactions, nudge stalled papers.
  if local::time >= time '08:00' then
   update public.ws_settings set loans_synced_on = d where user_id = s.user_id and loans_synced_on is distinct from d;
   if found then
    for loan in select id from public.ws_loans where user_id = s.user_id loop perform ws_private.sync_loan_reminder(loan); end loop;
    perform ws_private.post_recurring(s.user_id);
    if s.publication_followup_days is not null then
     insert into public.reminders (user_id, title, body, remind_at, done, notified_at, project_id, nudge_key)
     select p.user_id, 'Follow up: ' || p.title,
            p.stage::text || ' for ' || x.days || ' days' || coalesce(' at ' || p.venue, '') || '. Consider writing to the editor.',
            now(), false, null, p.project_id,
            'pub:' || p.id || ':' || p.stage::text || ':' || (x.days / s.publication_followup_days)
       from public.publications p
       cross join lateral (
        select d - (coalesce((select max(e.created_at) from public.publication_stage_events e where e.publication_id = p.id and e.to_stage = p.stage), p.updated_at) at time zone tz)::date as days
       ) x
      where p.user_id = s.user_id and p.deleted_at is null and p.stage in ('Under Review', 'Revision Requested')
        and x.days >= s.publication_followup_days
     on conflict (user_id, nudge_key) where nudge_key is not null do nothing;
    end if;
   end if;
  end if;

  if s.habit_nudge_time is null or local::time < s.habit_nudge_time then continue; end if;
  if exists(select 1 from public.reminders where user_id = s.user_id and nudge_key = 'habits:' || d) then continue; end if;
  select string_agg(h.name || coalesce(' (' || trim(to_char(done_amt, 'FM999990.##')) || ' of ' || trim(to_char(h.target, 'FM999990.##')) || coalesce(' ' || h.unit, '')
           || case h.period when 'week' then ' this week' when 'month' then ' this month' else '' end || ')', ''), ', ' order by h.position, h.name)
    into open_list
    from public.ws_habits h
    cross join lateral (
     select coalesce(sum(coalesce(c.amount, h.target, 1)), 0) as done_amt from public.ws_habit_checkins c
      where c.habit_id = h.id and c.day >= case h.period when 'week' then d - (extract(isodow from d)::int - 1) when 'month' then date_trunc('month', d)::date else d end
        and c.day <= d
    ) x
   where h.user_id = s.user_id and h.archived_at is null and h.start_date <= d
     and not ws_private.habit_paused(s.habit_pauses, h.id, d)
     and (h.period <> 'day' or h.frequency = 'daily' or extract(isodow from d)::int = any(h.weekdays))
     and x.done_amt < coalesce(h.target, 1);
  if open_list is null then continue; end if;
  insert into public.reminders (user_id, title, body, remind_at, done, notified_at, nudge_key)
  values (s.user_id, 'Habits still open today', open_list, now(), false, null, 'habits:' || d)
  on conflict (user_id, nudge_key) where nudge_key is not null do nothing;
  n := n + 1;
 end loop;
 return jsonb_build_object('habit_nudges', n);
end $$;
revoke all on function public.ws_daily_nudges() from public, anon, authenticated;
grant execute on function public.ws_daily_nudges() to service_role;

create or replace function public.ws_backup_data() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t text; rows jsonb; result jsonb := '{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 foreach t in array array['people','projects','project_people','project_stages','project_links','project_fields','publications','publication_nodes','publication_stage_events','tags','documents','job_applications','inbox_items','reads','ws_settings','ws_contacts','ws_papers','ws_project_papers','ws_notes','ws_meetings','ws_meeting_projects','ws_meeting_participants','ws_deadlines','tasks','reminders','item_tags','ws_meeting_action_items','ws_loans','ws_loan_payments','ws_budget_categories','ws_recurring','ws_transactions','ws_monthly_budgets','ws_habits','ws_habit_checkins','ws_attachments'] loop
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
revoke all on function public.ws_backup_data() from public, anon;
grant execute on function public.ws_backup_data() to authenticated;

create or replace function public.ws_restore_data(owner_id uuid, payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t text; r jsonb; original jsonb; cols text; updates text; keys text; n int; result jsonb := '{}'; fresh boolean;
begin
 if auth.uid() is null or owner_id <> auth.uid() then raise exception 'Restore requires the original account'; end if;
 perform set_config('workspace.restoring','on',true);
 foreach t in array array['people','projects','project_people','project_stages','project_links','project_fields','publications','publication_nodes','publication_stage_events','tags','documents','job_applications','inbox_items','reads','ws_settings','ws_contacts','ws_papers','ws_project_papers','ws_notes','ws_meetings','ws_meeting_projects','ws_meeting_participants','ws_deadlines','tasks','reminders','item_tags','ws_meeting_action_items','ws_loans','ws_loan_payments','ws_budget_categories','ws_recurring','ws_transactions','ws_monthly_budgets','ws_habits','ws_habit_checkins','ws_attachments'] loop
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

notify pgrst,'reload schema';
commit;
