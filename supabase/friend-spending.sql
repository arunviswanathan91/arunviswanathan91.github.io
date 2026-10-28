-- Spending for a friend (rerunnable). Run after emi-schedule.sql.
-- A shared card can pay for someone else: such spends (and their paying back) name the friend,
-- stay on the card balance, and are kept out of your own budget totals.

alter table public.ws_transactions add column if not exists for_contact_id uuid references public.ws_contacts(id) on delete restrict;
create index if not exists transactions_for_contact_idx on public.ws_transactions (for_contact_id) where for_contact_id is not null;
alter table public.ws_transactions drop constraint if exists ws_transactions_for_contact_kind_check;
alter table public.ws_transactions add constraint ws_transactions_for_contact_kind_check check (for_contact_id is null or kind <> 'transfer');

create or replace function ws_private.check_for_contact() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if new.for_contact_id is not null and not exists (select 1 from public.ws_contacts c where c.id = new.for_contact_id and c.user_id = new.user_id) then
  raise exception 'Linked record must belong to this account';
 end if;
 return new;
end $$;
drop trigger if exists ws_check_for_contact on public.ws_transactions;
create trigger ws_check_for_contact before insert or update of for_contact_id, user_id on public.ws_transactions
 for each row execute function ws_private.check_for_contact();

-- Your own spending per category: spends for a friend are left out.
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
    where t.kind <> 'transfer' and t.for_contact_id is null
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
