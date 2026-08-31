# Personal Dashboard MVP

A React + TypeScript personal workspace added alongside the academic GitHub Pages site.

## Modules

- Command center
- Project-scoped Kanban task boards (plus an always-available Inbox for unassigned tasks)
- Publication pipeline — Kanban by stage, with a global view and a per-project view
- Job tracker — Kanban by stage, global/per-project, filterable by managed tags (e.g. postdoc, faculty, industry)
- Document and Google Drive metadata tracker
- Reminders, with optional Telegram push notifications when they come due
- Reads — a Telegram-driven read-later list ("add this to Reads?" confirmation flow)
- A managed tag list shared by Jobs, Reminders and Reads
- A real Telegram bot: linking flow, `/add`, `/today`, `/done`, `/job`, `/remind`, link capture
- Supabase schema with Row Level Security

All visible records live in the authenticated Supabase project — nothing in this repo contains real data.

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
