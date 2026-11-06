-- Personal loans built up over time (rerunnable). Run after friend-card-payments.sql.
-- A friend who gives you money every month (or you them), in amounts that differ, is one loan with a list of
-- dated amounts. The loan's amount is kept as the list's total and its date as the earliest entry, so balances,
-- reminders, the agenda and backups keep working unchanged.

alter table public.ws_loans add column if not exists draws jsonb;
alter table public.ws_loans drop constraint if exists ws_loans_draws_check;
alter table public.ws_loans add constraint ws_loans_draws_check
 check (draws is null or (jsonb_typeof(draws) = 'array' and jsonb_array_length(draws) between 1 and 1000));

create or replace function ws_private.sync_loan_draws() returns trigger
language plpgsql set search_path = '' as $$
declare total numeric; first date; bad int;
begin
 if new.draws is null then return new; end if;
 select count(*) filter (where (e->>'on') is null or coalesce((e->>'amount')::numeric, 0) <= 0),
        sum((e->>'amount')::numeric), min((e->>'on')::date)
   into bad, total, first
   from jsonb_array_elements(new.draws) e;
 if bad > 0 then raise exception 'Each amount needs a date and an amount above 0'; end if;
 new.amount := total;
 new.issued_on := first;
 return new;
end $$;
revoke all on function ws_private.sync_loan_draws() from public, anon, authenticated;
drop trigger if exists ws_sync_loan_draws on public.ws_loans;
create trigger ws_sync_loan_draws before insert or update on public.ws_loans
 for each row execute function ws_private.sync_loan_draws();
