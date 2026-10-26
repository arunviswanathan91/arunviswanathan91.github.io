-- EMI schedules and credit-card statements for loans, and quantity targets with carry-over for habits.
-- Run after finance-accounts.sql. Existing rows keep working: every new column is optional.
begin;

-- EMI: a fixed monthly instalment. The first EMI date and tenure give the schedule; payments are matched to it in the app.
alter table public.ws_loans add column if not exists emi_amount numeric(14,2) check(emi_amount > 0);
alter table public.ws_loans add column if not exists emi_first_on date;
alter table public.ws_loans add column if not exists emi_tenure int check(emi_tenure > 0);
alter table public.ws_loans add column if not exists interest_rate numeric(6,3) check(interest_rate >= 0);

-- Credit card statement: the bill generated on statement_on, due on statement_due_on.
-- minimum_due (existing) is the minimum for that statement. Payments dated on or after statement_on count towards it.
alter table public.ws_loans add column if not exists statement_amount numeric(14,2) check(statement_amount >= 0);
alter table public.ws_loans add column if not exists statement_on date;
alter table public.ws_loans add column if not exists statement_due_on date;

-- Habits with a quantity (e.g. 30 minutes). A shortfall can roll into the next day, optionally capped.
alter table public.ws_habits add column if not exists target numeric(10,2) check(target > 0);
alter table public.ws_habits add column if not exists unit text;
alter table public.ws_habits add column if not exists carry_over boolean not null default false;
alter table public.ws_habits add column if not exists max_carry numeric(10,2) check(max_carry >= 0);
-- amount logged on the day; null on a quantity habit means the full requirement was done.
alter table public.ws_habit_checkins add column if not exists amount numeric(10,2) check(amount >= 0);

notify pgrst,'reload schema';
commit;
