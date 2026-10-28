-- EMI schedules entered one by one (rerunnable). Run after agenda-recurring-followups.sql.
-- Lenders such as CreditBee or Slice often have a first or last EMI that differs from the rest.
-- A loan can list each EMI's date and amount; reminders, the agenda and the calendar feed use that list.

alter table public.ws_loans add column if not exists emi_schedule jsonb;
alter table public.ws_loans drop constraint if exists ws_loans_emi_schedule_check;
alter table public.ws_loans add constraint ws_loans_emi_schedule_check
 check (emi_schedule is null or (jsonb_typeof(emi_schedule) = 'array' and jsonb_array_length(emi_schedule) between 1 and 600));

-- Instalments in date order with the running total paid by the end of each one.
create or replace function ws_private.emi_schedule_rows(p_schedule jsonb)
returns table (n int, d date, amount numeric, upto numeric)
language sql immutable set search_path = '' as $$
 select (row_number() over w)::int, x.d, x.amount, sum(x.amount) over w
   from (select (e->>'on')::date as d, (e->>'amount')::numeric as amount from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb)) e) x
  where x.d is not null and x.amount > 0
 window w as (order by x.d rows between unbounded preceding and current row)
$$;
revoke all on function ws_private.emi_schedule_rows(jsonb) from public, anon, authenticated;

create or replace function ws_private.sync_loan_reminder(p_loan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
 l record; tz text; today date; paid numeric; charged numeric; balance numeric; covered int; next_emi date; next_amount numeric;
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

 if balance > 0 and l.emi_schedule is not null then
  -- EMIs entered one by one: the first instalment the payments don't cover yet.
  select r.d, least(r.upto, l.amount + charged) - greatest(paid, r.upto - r.amount) into next_emi, next_amount
    from ws_private.emi_schedule_rows(l.emi_schedule) r where r.upto > paid order by r.n limit 1;
  if next_emi is not null then
   due := next_emi; overdue := next_emi < today;
   title := case when overdue then 'EMI overdue: ' else 'EMI due: ' end || label;
   body := ws_private.money(next_amount, l.currency) || ' due on ' || to_char(next_emi, 'DD Mon YYYY');
  end if;
 elsif balance > 0 and l.emi_amount is not null and l.emi_first_on is not null then
  covered := floor(paid / l.emi_amount);
  if l.emi_tenure is not null then covered := least(covered, l.emi_tenure); end if;
  if l.emi_tenure is null or covered < l.emi_tenure then
   next_emi := (l.emi_first_on + make_interval(months => covered))::date;
   due := next_emi; overdue := next_emi < today;
   title := case when overdue then 'EMI overdue: ' else 'EMI due: ' end || label;
   body := ws_private.money(least(l.emi_amount - (paid - covered * l.emi_amount), balance), l.currency) || ' due on ' || to_char(next_emi, 'DD Mon YYYY');
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
 -- Same EMI every month. Each instalment shows what is still due on it (a part-paid one the rest, a short last one only what is left).
 select 'emi', l.id, 'EMI · ' || l.label, e.d, null::timestamptz,
        ws_private.money(least((e.i + 1) * l.emi_amount, l.amount + l.charged) - greatest(l.paid, e.i * l.emi_amount), l.currency), 'tools/loans', e.d < (now() at time zone s.tz)::date
   from loans l cross join s
   cross join lateral (
    select i, (l.emi_first_on + make_interval(months => i))::date as d
      from generate_series(floor(l.paid / l.emi_amount)::int, coalesce(l.emi_tenure, floor(l.paid / l.emi_amount)::int + 36) - 1) i
   ) e
  where l.emi_schedule is null and l.emi_amount is not null and l.emi_first_on is not null and l.amount + l.charged - l.paid > 0
    and e.i * l.emi_amount < l.amount + l.charged and e.d between p_from and p_to
 union all
 -- EMIs entered one by one: every instalment not yet covered by the payments, with what is still due on it.
 select 'emi', l.id, 'EMI · ' || l.label, r.d, null::timestamptz,
        ws_private.money(least(r.upto, l.amount + l.charged) - greatest(l.paid, r.upto - r.amount), l.currency), 'tools/loans', r.d < (now() at time zone s.tz)::date
   from loans l cross join s
   cross join lateral ws_private.emi_schedule_rows(l.emi_schedule) r
  where l.emi_schedule is not null and r.upto > l.paid and r.upto - r.amount < l.amount + l.charged and r.d between p_from and p_to
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
