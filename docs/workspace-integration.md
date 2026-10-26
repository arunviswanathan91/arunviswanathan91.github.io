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
