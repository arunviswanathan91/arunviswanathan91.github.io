-- Card spending through the budget, statement roll-over, habit periods and pauses, and reminders for
-- EMIs, card due dates and open habits. Run after emi-statements-habit-carry.sql. Rerunnable.
begin;

-- ── Card spending ────────────────────────────────────────────────────────────
-- An expense paid with a card raises that card's balance; an income (refund) lowers it.
alter table public.ws_transactions add column if not exists loan_id uuid references public.ws_loans(id) on delete set null;
alter table public.ws_transactions drop constraint if exists ws_transactions_loan_kind_check;
alter table public.ws_transactions add constraint ws_transactions_loan_kind_check check (loan_id is null or kind <> 'transfer');
create index if not exists transactions_loan_idx on public.ws_transactions (loan_id) where loan_id is not null;

-- A card can start with nothing owed and build its balance from spending.
alter table public.ws_loans drop constraint if exists ws_loans_amount_check;
alter table public.ws_loans add constraint ws_loans_amount_check check (amount > 0 or (account_type = 'credit_card' and amount >= 0));

-- ── Habits ───────────────────────────────────────────────────────────────────
-- period: the target is per day, per ISO week or per calendar month.
alter table public.ws_habits add column if not exists period text not null default 'day';
alter table public.ws_habits drop constraint if exists ws_habits_period_check;
alter table public.ws_habits add constraint ws_habits_period_check check (period in ('day','week','month') and (period = 'day' or target is not null));

-- habit_pauses: [{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","habit_id":null|uuid,"note":text}]; null habit_id pauses every habit.
alter table public.ws_settings add column if not exists habit_pauses jsonb not null default '[]';
alter table public.ws_settings drop constraint if exists ws_settings_habit_pauses_check;
alter table public.ws_settings add constraint ws_settings_habit_pauses_check check (jsonb_typeof(habit_pauses) = 'array');
-- Local time for the "habits still open" Telegram nudge; null turns it off.
alter table public.ws_settings add column if not exists habit_nudge_time time;
-- Day the nightly job last refreshed this user's loan reminders.
alter table public.ws_settings add column if not exists loans_synced_on date;

-- ── Reminders ────────────────────────────────────────────────────────────────
-- One pending reminder per loan (next EMI or card due date) and one habit nudge per user and day.
alter table public.reminders add column if not exists loan_id uuid references public.ws_loans(id) on delete cascade;
alter table public.reminders add column if not exists nudge_key text;
create unique index if not exists reminders_loan_id_key on public.reminders (loan_id) where loan_id is not null;
create unique index if not exists reminders_nudge_key on public.reminders (user_id, nudge_key) where nudge_key is not null;

create or replace function ws_private.money(n numeric, cur text) returns text language sql immutable set search_path = '' as $$
 select trim(to_char(n, 'FM999,999,999,990.00')) || ' ' || cur
$$;

-- Keep a loan's reminder in step with its schedule: 2 days before the next EMI or card due date at 09:00
-- local time, and again the day after if it is still unpaid. A reminder that already fired is only
-- re-sent when its date changes.
create or replace function ws_private.sync_loan_reminder(p_loan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
 l record; tz text; today date; paid numeric; charged numeric; balance numeric; covered int; next_emi date;
 due date; title text; body text; overdue boolean := false; at timestamptz; label text; since numeric;
begin
 select x.*, coalesce(x.account_name, c.name, 'Loan') as label into l
   from public.ws_loans x left join public.ws_contacts c on c.id = x.contact_id where x.id = p_loan;
 if not found or l.direction <> 'borrowed' then
  update public.reminders set done = true, updated_at = now() where loan_id = p_loan and done = false and notified_at is null;
  return;
 end if;
 select coalesce((select s.timezone from public.ws_settings s where s.user_id = l.user_id), 'Asia/Kolkata') into tz;
 today := (now() at time zone tz)::date;
 select coalesce(sum(amount), 0) into paid from public.ws_loan_payments where loan_id = p_loan;
 select coalesce(sum(case when kind = 'expense' then amount when kind = 'income' then -amount else 0 end), 0) into charged
   from public.ws_transactions where loan_id = p_loan;
 balance := l.amount + charged - paid;
 label := l.label;

 if balance > 0 and l.emi_amount is not null and l.emi_first_on is not null then
  covered := floor(paid / l.emi_amount);
  if l.emi_tenure is not null then covered := least(covered, l.emi_tenure); end if;
  if l.emi_tenure is null or covered < l.emi_tenure then
   next_emi := (l.emi_first_on + make_interval(months => covered))::date;
   due := next_emi; overdue := next_emi < today;
   title := case when overdue then 'EMI overdue: ' else 'EMI due: ' end || label;
   body := ws_private.money(least(l.emi_amount, balance), l.currency) || ' due on ' || to_char(next_emi, 'DD Mon YYYY');
  end if;
 end if;

 if due is null and balance > 0 and l.account_type = 'credit_card' and l.statement_amount is not null and l.statement_on is not null and l.statement_due_on is not null then
  select coalesce(sum(amount), 0) into since from public.ws_loan_payments where loan_id = p_loan and paid_on >= l.statement_on;
  if l.statement_amount - since > 0 then
   due := l.statement_due_on;
   overdue := l.statement_due_on < today and least(coalesce(l.minimum_due, 0), l.statement_amount) - since > 0;
   if l.statement_due_on < today and not overdue then due := null; end if; -- past due with the minimum paid: interest, not a reminder
   if due is not null then
    title := case when overdue then 'Card payment overdue: ' else 'Card payment due: ' end || label;
    body := 'Statement ' || ws_private.money(l.statement_amount - since, l.currency) || ' left'
      || case when coalesce(l.minimum_due, 0) - since > 0 then ', minimum ' || ws_private.money(least(l.minimum_due, l.statement_amount) - since, l.currency) else ', minimum paid' end
      || ', due ' || to_char(l.statement_due_on, 'DD Mon YYYY');
   end if;
  end if;
 end if;

 if due is null then
  update public.reminders set done = true, updated_at = now() where loan_id = p_loan and done = false and notified_at is null;
  return;
 end if;
 at := ((case when overdue then due + 1 else due - 2 end) + time '09:00') at time zone tz;
 insert into public.reminders (user_id, title, body, remind_at, done, notified_at, loan_id)
 values (l.user_id, title, body, at, false, null, p_loan)
 on conflict (loan_id) where loan_id is not null do update set
  title = excluded.title, body = excluded.body, remind_at = excluded.remind_at, done = false, deleted_at = null,
  notified_at = case when public.reminders.remind_at = excluded.remind_at then public.reminders.notified_at end,
  updated_at = now();
end $$;
revoke all on function ws_private.sync_loan_reminder(uuid) from public, anon, authenticated;

create or replace function ws_private.loan_reminder_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_table_name = 'ws_loans' then
  if tg_op <> 'DELETE' then perform ws_private.sync_loan_reminder(new.id); end if;
  return null;
 end if;
 if tg_op in ('UPDATE', 'DELETE') then
  if old.loan_id is not null then perform ws_private.sync_loan_reminder(old.loan_id); end if;
 end if;
 if tg_op = 'INSERT' then
  if new.loan_id is not null then perform ws_private.sync_loan_reminder(new.loan_id); end if;
 elsif tg_op = 'UPDATE' then
  if new.loan_id is not null and new.loan_id is distinct from old.loan_id then perform ws_private.sync_loan_reminder(new.loan_id); end if;
 end if;
 return null;
end $$;

drop trigger if exists loans_reminder on public.ws_loans;
create trigger loans_reminder after insert or update on public.ws_loans for each row execute function ws_private.loan_reminder_trigger();
drop trigger if exists loan_payments_reminder on public.ws_loan_payments;
create trigger loan_payments_reminder after insert or update or delete on public.ws_loan_payments for each row execute function ws_private.loan_reminder_trigger();
drop trigger if exists transactions_loan_reminder on public.ws_transactions;
create trigger transactions_loan_reminder after insert or update or delete on public.ws_transactions for each row execute function ws_private.loan_reminder_trigger();

-- Is the habit paused on this day by a pause for it or for every habit?
create or replace function ws_private.habit_paused(pauses jsonb, habit uuid, d date) returns boolean
language sql immutable set search_path = '' as $$
 select exists(select 1 from jsonb_array_elements(coalesce(pauses, '[]')) p
  where (p->>'from')::date <= d and (p->>'to')::date >= d
    and (coalesce(p->>'habit_id', '') = '' or (p->>'habit_id')::uuid = habit))
$$;

-- Called every minute by telegram-reminder-sweep (service role). Once a day per user it refreshes loan
-- reminders, and after the user's nudge time it queues one "habits still open" reminder.
create or replace function public.ws_daily_nudges() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s record; tz text; local timestamp; d date; open_list text; n int := 0; loan uuid;
begin
 for s in select st.* from public.ws_settings st loop
  tz := coalesce(s.timezone, 'Asia/Kolkata');
  local := now() at time zone tz;
  d := local::date;

  update public.ws_settings set loans_synced_on = d where user_id = s.user_id and loans_synced_on is distinct from d;
  if found then
   for loan in select id from public.ws_loans where user_id = s.user_id loop perform ws_private.sync_loan_reminder(loan); end loop;
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

-- Reminders for existing loans.
select ws_private.sync_loan_reminder(id) from public.ws_loans;

notify pgrst,'reload schema';
commit;
