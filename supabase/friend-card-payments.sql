-- A friend paying a card bill or loan repayment for you (rerunnable). Run after savings-accounts.sql.
-- The payment lowers the card balance like any other, and also counts as that friend paying you back,
-- so it comes off what they owe in Budget → Spent for friends. It is not your own money out.

alter table public.ws_loan_payments add column if not exists for_contact_id uuid references public.ws_contacts(id) on delete restrict;
create index if not exists loan_payments_for_contact_idx on public.ws_loan_payments (for_contact_id) where for_contact_id is not null;

-- Money a friend paid never comes out of one of your savings accounts.
alter table public.ws_loan_payments drop constraint if exists ws_loan_payments_friend_account_check;
alter table public.ws_loan_payments add constraint ws_loan_payments_friend_account_check check (for_contact_id is null or account_id is null);

-- Same ownership check as transactions.for_contact_id (friend-spending.sql).
drop trigger if exists ws_check_for_contact on public.ws_loan_payments;
create trigger ws_check_for_contact before insert or update of for_contact_id, user_id on public.ws_loan_payments
 for each row execute function ws_private.check_for_contact();
