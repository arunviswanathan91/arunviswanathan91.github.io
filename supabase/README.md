# Database scripts

The database is built from the SQL files in this folder, run in the Supabase SQL editor in the
order below. Each one is rerunnable, so re-running a file after it changes is safe. A new file
always goes at the end of this list, and the commit that adds it says so.

| # | File | Adds |
|---|------|------|
| 1 | `schema.sql` | Base tables, RLS, Telegram linking, reminders |
| 2 | `project-collaboration.sql` | Shared projects with editor/viewer members |
| 3 | `project-people.sql` | Private people directory per project |
| 4 | `trash.sql` | Recoverable deletion (Trash) |
| 5 | `opportunity-reset.sql` | Opportunity discovery reset |
| 6 | `opportunity-search-v2.sql` | Discovery search profile |
| 7 | `opportunity-search-v3.sql` | Discovery ranking updates |
| 8 | `institution-facts.sql` | Institution facts cache |
| 9 | `opportunity-deadline-reminders.sql` | Opportunity deadline reminders |
| 10 | `publication-notes.sql` | Publication notes and stage history |
| 11 | `workspace-extension.sql` | Workspace: papers, notes, meetings, deadlines, budget, loans, habits (`ws_*`) |
| 12 | `finance-accounts.sql` | Loan and credit-card accounts |
| 13 | `emi-statements-habit-carry.sql` | EMI loans, card statements, habit carry-over |
| 14 | `card-spending-habit-periods-reminders.sql` | Card spending, weekly/monthly habits, daily nudges |
| 15 | `agenda-recurring-followups.sql` | Agenda, calendar feed, recurring money, publication follow-ups |
| 16 | `emi-schedule.sql` | EMIs entered one by one (different first or last EMI) |
| 17 | `friend-spending.sql` | Spends paid for a friend, kept out of your own budget |

Edge Functions are in `functions/`. They are type-checked on every pull request and deployed
from `main` only (`.github/workflows/check-functions.yml`, `deploy-supabase.yml`). Secrets are set
with `supabase secrets set` and never committed.
