# Integrated workspace

Adapted from Justin Seby’s MIT-licensed workspace at `8b636b20e054d0c2f6c2c2720e5036539d64cd30`. Attribution is retained in `dashboard-app/src/extended/LICENSE`.

## Features and navigation

Home adds colored icons, quick-add actions, progress rings and cards for upcoming work. Research & planning adds project overview, task planner, Papers with DOI/PMID/arXiv lookup, Markdown Notes, Meetings with action-to-task conversion, Deadlines/calendar and Search. Personal adds Budget, Loans and Habits. Project/meeting print views and private attachments are included. Existing workflows, publication boards, project stages, Telegram, clippings, sharing and Trash remain available.

The task planner and project overview use the original task/project records. **Work board & publications** opens the advanced project board. Existing Review status, precise due timestamps, assignees, publication links and custom stages are preserved when editing unrelated planner fields. Completing a recurring task creates one next occurrence; reopening and completing it does not create duplicates.

Search and Ctrl/Cmd+K search both original work and new research records. Settings links to backup, restore and finance preferences (default INR/Asia/Kolkata).

## Database setup

Apply `supabase/workspace-extension.sql` after the existing schema, project collaboration and Trash scripts. It is additive and rerunnable. New private tables/RPCs use the `ws_` prefix. Security-invoker views adapt the original projects/tasks. New tables enforce account-level RLS and related-record ownership. The same authenticated client is used; no new service key or login is needed. Never run Justin's single-owner database setup against this database.

## Backup and restore

JSON contains data; ZIP also includes private attachments and publication Markdown files. Both preserve stable IDs and links for active owned projects, tasks, publications, people, project metadata, tags, documents, job applications, clippings, reads, reminders and every new module. Archived research notes are included. Credentials, sharing permissions, Trash and opportunity discovery data/caches are excluded. Existing integrations and Trash operate independently. Check the export status for unavailable files.

Immutable publication stage history is exported for reference; restore retains the existing history.

Restore requires the original signed-in account. It adds or updates matching IDs without deleting absent records. Database restoration is atomic and enforces RLS; invalid records roll back the transaction. File uploads follow restoration. If a file upload fails, the UI says records were restored; retry the same backup to finish. JSON cannot recreate attachment bytes. This is a workspace backup, not a full Supabase disaster-recovery backup.

## Validation

`cd dashboard-app && npm run check` runs original tests, imported finance/habit/identifier tests, and PostgreSQL integration tests through PGlite, then builds. Database tests cover rerunnable setup, compatibility writes, recurrence deduplication, global search, account isolation and atomic backup restore.

`cd pipeline && TZ=UTC npm run check` runs discovery checks in GitHub Actions' timezone.

## Finance accounts

Apply `supabase/finance-accounts.sql` after `workspace-extension.sql`. Budget → Categories has a separate category-name field. Loans & cards → Add loan / card supports personal loans, bank loans and credit cards. Credit cards store a display name, bank, last four digits, starting balance, optional limit, minimum due and due date. Edit changes saved details. Repayments subtract from the starting balance; spending, interest and updated statement values are manual. Do not replace the starting balance with a current balance that already subtracts recorded repayments. No full card number, CVV or bank connection is required.

## EMIs, card statements and habit carry-over

Apply `supabase/emi-statements-habit-carry.sql` after `finance-accounts.sql` (all new columns are optional).

- **EMI**: bank loans and borrowed personal loans accept an EMI amount, number of EMIs and first EMI date. EMIs repeat monthly; repayments are matched to them in order, so the loan shows EMIs paid / left, the next EMI date and goes overdue when an EMI date passes unpaid. "Paid back" offers the EMI as a preset amount.
- **Credit cards**: enter the current statement (amount, statement date, due date) together with the minimum due. Payments dated on or after the statement date count towards it. The card shows statement left, minimum still to pay, new spending since the statement, credit-limit utilisation, and warns when the due date has passed with the statement unpaid. Presets: minimum due, statement, full balance. Enter each month's new statement by editing the card.
- **Habits**: a habit can have a daily amount and unit (e.g. 30 min). Log the total done each day. With "Carry a shortfall over" on, whatever was not done is added to the next day's requirement (capped at one extra day's amount unless a limit is set). A short day counts towards the streak once the next day is completed; otherwise it is missed.

## Card spending, statements, breaks and reminders

Apply `supabase/card-spending-habit-periods-reminders.sql` after `emi-statements-habit-carry.sql` (rerunnable). The `telegram-reminder-sweep` function calls `ws_daily_nudges()` every minute once it is redeployed.

- **Card spending**: a Budget expense can be marked "Paid with card"; it raises that card's balance (a refund as income lowers it). Cards have "Add spend" in Loans & cards. Pay the card bill with "Pay bill", not as a budget expense, so spending isn't counted twice. A new card can start at 0.
- **Next statement**: "Enter next statement" prefills a month after the last statement, the same gap to the due date, the balance owed now and about 5 % as the minimum.
- **EMI breakdown**: with an interest rate and number of EMIs, the loan shows principal, total interest, principal still owed, the interest saved by paying off now and a month-by-month table.
- **Reminders**: each borrowed loan keeps one reminder in `reminders`: 2 days before the next EMI or card due date at 09:00 (settings time zone), and the day after if still unpaid. Loan reminders refresh once a day. Telegram sends them when the account is linked.
- **Habits**: a target can be per day, per week or per month (any days). Breaks (for all habits or one) require nothing, keep streaks and hold carried amounts. Only a day's own shortfall carries, so one missed day never snowballs. The evening reminder (Habits → Evening reminder) sends one Telegram message listing habits still open.
- **Home**: a "needs attention" row shows overdue or soon-due EMIs and card bills, overdue tasks, deadlines within 3 days, open habits and an over-budget warning.
- **CSV**: Loans & cards and Habits each export a spreadsheet (ledger with running balance; every logged day).
