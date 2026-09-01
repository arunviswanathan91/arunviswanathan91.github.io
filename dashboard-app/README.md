# Personal Dashboard MVP

A React + TypeScript personal workspace added alongside the academic GitHub Pages site.

## Modules

Tasks, Publications, Documents, Jobs, Reminders and Reads. Every module shares the same
capabilities, because each one is declared as a config rather than hand-built:

- **Board and Table views** — drag between stage columns, or switch to a dense sortable table
  with inline editing. Every field is editable in a detail drawer opened by clicking any card or row.
- **Toolbar** on every view — search, filter (project, tag, stage, priority, due-date buckets),
  sort, and column visibility. Filters persist per view; the search box deliberately does not.
- **Bulk actions** — multi-select, then change stage, reassign project, add/remove tags or delete.
- **Keyboard** — `Ctrl/Cmd-K` command palette (jump, create, or find any record across every
  module), `n` new, `/` search, `Esc` to close.
- **Projects** with colours, full create/rename/archive/delete, driving a global project scope.
- **Managed tags** with colours, shared across all six modules.
- **Light and dark themes**, following the OS by default with a manual override.
- **Telegram bot** — linking flow, `/add`, `/today`, `/done`, `/job`, `/remind`, and link capture
  with an "add this to Reads?" confirmation, plus push notifications for due reminders.
- Supabase schema with Row Level Security throughout.

All visible records live in the authenticated Supabase project — nothing in this repo contains real data.

## Architecture

Each entity is described once in `src/entities/*.ts` (its columns, which fields appear on a card,
in the table, in filters and sorts). Generic components under `src/components/entity/` render the
board, table, toolbar, drawer, composer and bulk bar from that description, so adding a field is a
one-line config change rather than a new component. `src/lib/store.tsx` holds the data and UI
contexts; `src/lib/useTable.ts` is the shared Supabase table store.

## Local setup

```bash
cd dashboard-app
npm install
cp .env.example .env
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the local environment. The anon key is browser-safe only when the included Row Level Security policies are applied.

## Supabase setup

1. Paste the full `supabase/schema.sql` into the Supabase SQL editor and run it. Every statement is idempotent (`if not exists` / guarded `create type` / `drop policy if exists`), so re-running the whole file after a future change is always safe.
2. In Database → Extensions, enable `pg_cron` and `pg_net` (needed for reminder push notifications).
3. Store `CRON_SWEEP_SECRET` (a random string you generate) in Supabase Vault, e.g. `select vault.create_secret('<value>', 'cron_sweep_secret');`.
4. Deploy the Edge Functions and set their secrets:
   ```bash
   supabase functions deploy telegram-webhook
   supabase functions deploy telegram-reminder-sweep
   supabase secrets set TELEGRAM_BOT_TOKEN=... SUPABASE_SERVICE_ROLE_KEY=... TELEGRAM_WEBHOOK_SECRET=... CRON_SWEEP_SECRET=...
   ```
   Never commit these values.
5. Register the webhook with Telegram (via BotFather-issued token):
   ```bash
   curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
     -d url=https://<project-ref>.functions.supabase.co/telegram-webhook \
     -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```
6. Schedule the reminder sweep to run every minute:
   ```sql
   select cron.schedule(
     'telegram-reminder-sweep',
     '* * * * *',
     $$
     select net.http_post(
       url:='https://<project-ref>.functions.supabase.co/telegram-reminder-sweep',
       headers:=jsonb_build_object(
         'content-type','application/json',
         'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_sweep_secret')
       ),
       body:='{}'::jsonb
     )
     $$
   );
   ```
7. In the dashboard, open **Telegram** in the sidebar and click **Generate code**, then send `/link <code>` to your bot to connect your account.

The production dashboard build uses `/dashboard/` as its base path.

## Telegram bot commands

`/link <code>` · `/add <task> [#Project]` · `/today` · `/done <number>` · `/job <organization> | <role> [#tag]` · `/remind <text> [#tag] [in <N>m|h|d]` · share any link to be asked whether to save it to Reads.
