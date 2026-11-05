-- Savings accounts (bank + name + currency + opening balance) for the Budget, and a stored base-currency
-- (INR) value on each foreign-currency transaction. Apply after friend-spending.sql. Safe to re-run.
begin;

create table if not exists public.ws_savings_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  bank_name       text not null default '',
  currency        text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  opening_balance numeric(14, 2) not null default 0,
  opening_on      date not null default current_date,   -- transactions before this date are not counted
  notes           text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists savings_accounts_user_idx on public.ws_savings_accounts (user_id, archived_at, bank_name, name);
select ws_private.secure_table('public.ws_savings_accounts');
revoke truncate, references, trigger on public.ws_savings_accounts from authenticated, anon, public;
drop trigger if exists savings_accounts_touch on public.ws_savings_accounts;
create trigger savings_accounts_touch before update on public.ws_savings_accounts
  for each row execute function ws_private.touch_updated_at();

-- A transaction can be paid from / received into an account; a transfer moves money between two accounts
-- (to_amount = what arrived, when the two accounts use different currencies). base_* is the value in the
-- default currency (INR) at entry time, so history does not drift as exchange rates move.
alter table public.ws_transactions add column if not exists account_id    uuid references public.ws_savings_accounts(id) on delete restrict;
alter table public.ws_transactions add column if not exists to_account_id uuid references public.ws_savings_accounts(id) on delete restrict;
alter table public.ws_transactions add column if not exists to_amount     numeric(14, 2);
alter table public.ws_transactions add column if not exists base_currency text;
alter table public.ws_transactions add column if not exists base_amount   numeric(14, 2);
alter table public.ws_transactions drop constraint if exists ws_transactions_account_rules;
alter table public.ws_transactions add constraint ws_transactions_account_rules check (
  (to_account_id is null or kind = 'transfer')
  and (to_amount is null or (kind = 'transfer' and to_amount > 0))
  and (account_id is null or to_account_id is null or account_id <> to_account_id)
  and (base_currency is null or base_currency ~ '^[A-Z]{3}$')
  and ((base_currency is null) = (base_amount is null))
  and (base_amount is null or base_amount > 0));
create index if not exists transactions_account_idx    on public.ws_transactions (account_id)    where account_id is not null;
create index if not exists transactions_to_account_idx on public.ws_transactions (to_account_id) where to_account_id is not null;

create or replace function ws_private.check_tx_accounts() returns trigger
language plpgsql set search_path = '' as $$
declare a record;
begin
 if new.account_id is not null then
  select s.user_id, s.currency into a from public.ws_savings_accounts s where s.id = new.account_id;
  if not found or a.user_id <> new.user_id then raise exception 'Linked record must belong to this account'; end if;
  if a.currency <> new.currency then raise exception 'This account is in %, so the transaction must be in % too', a.currency, a.currency; end if;
  if new.loan_id is not null then raise exception 'A transaction is paid from a savings account or with a card, not both'; end if;
 end if;
 if new.to_account_id is not null then
  select s.user_id, s.currency into a from public.ws_savings_accounts s where s.id = new.to_account_id;
  if not found or a.user_id <> new.user_id then raise exception 'Linked record must belong to this account'; end if;
  if new.to_amount is null and a.currency <> new.currency then
   raise exception 'The receiving account is in %: enter the amount that arrived in %', a.currency, a.currency;
  end if;
 end if;
 return new;
end $$;
revoke all on function ws_private.check_tx_accounts() from public, anon, authenticated;
drop trigger if exists ws_check_tx_accounts on public.ws_transactions;
create trigger ws_check_tx_accounts before insert or update on public.ws_transactions
  for each row execute function ws_private.check_tx_accounts();

-- A loan EMI / repayment / card bill can be paid from a savings account. It lowers that account's balance but it is
-- not a budget expense (no transaction row), so it never counts as "spent". The check runs at commit so a backup
-- restore can load payments before accounts.
alter table public.ws_loan_payments add column if not exists account_id uuid references public.ws_savings_accounts(id) on delete restrict;
create index if not exists loan_payments_account_idx on public.ws_loan_payments (account_id) where account_id is not null;
create or replace function ws_private.check_payment_account() returns trigger
language plpgsql set search_path = '' as $$
declare a record; l record;
begin
 if new.account_id is not null then
  select s.user_id, s.currency into a from public.ws_savings_accounts s where s.id = new.account_id;
  select x.currency into l from public.ws_loans x where x.id = new.loan_id;
  if not found or a.user_id is distinct from new.user_id then raise exception 'Linked record must belong to this account'; end if;
  if a.currency <> l.currency then raise exception 'This account is in %, so it can only pay a % loan or card', a.currency, a.currency; end if;
 end if;
 return null;
end $$;
revoke all on function ws_private.check_payment_account() from public, anon, authenticated;
drop trigger if exists ws_check_payment_account on public.ws_loan_payments;
create constraint trigger ws_check_payment_account after insert or update on public.ws_loan_payments
  deferrable initially deferred for each row execute function ws_private.check_payment_account();

-- Balance of every account of the signed-in user: opening balance + income − spending − transfers out + transfers in
-- − loan/card payments made from it, counting entries dated on or after the opening date.
create or replace function public.ws_account_balances()
returns table (account_id uuid, balance numeric)
language sql stable security invoker set search_path = '' as $$
 select a.id,
        a.opening_balance
        + coalesce((select sum(case when t.account_id = a.id then (case t.kind when 'income' then t.amount else -t.amount end)
                                    else coalesce(t.to_amount, t.amount) end)
                      from public.ws_transactions t
                     where (t.account_id = a.id or t.to_account_id = a.id) and t.occurred_on >= a.opening_on), 0)
        - coalesce((select sum(p.amount) from public.ws_loan_payments p
                     where p.account_id = a.id and p.paid_on >= a.opening_on), 0)
   from public.ws_savings_accounts a
  where a.user_id = auth.uid()
$$;
revoke all on function public.ws_account_balances() from public, anon;
grant execute on function public.ws_account_balances() to authenticated;

-- Include accounts in the JSON/ZIP backup and restore (before transactions, which reference them). The
-- functions are patched in place so this keeps working whatever the current table list is.
do $$
declare fn text; def text; needle constant text := '''ws_transactions''';
begin
 foreach fn in array array['public.ws_backup_data()', 'public.ws_restore_data(uuid,jsonb)'] loop
  select pg_get_functiondef(fn::regprocedure) into def;
  if def not like '%ws_savings_accounts%' then
   if (length(def) - length(replace(def, needle, ''))) / length(needle) <> 1 then
    raise exception 'Cannot patch %: expected one table list', fn;
   end if;
   execute replace(def, needle, '''ws_savings_accounts'',' || needle);
  end if;
 end loop;
end $$;

commit;
