# Personal Dashboard MVP

A React + TypeScript personal workspace added alongside the academic GitHub Pages site.

## Modules

Tasks, Publications, Documents, Jobs, Reminders, Reads, and **Opportunities** (postdocs and research
roles found automatically overnight by the discovery pipeline in `../pipeline/` — see its README for
setup). Every module shares the same capabilities, because each one is declared as a config rather
than hand-built:

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
- **Gmail link picker** (optional) — search your inbox read-only from any URL field's drawer and
  turn a picked result into a permalink, instead of hunting for and pasting a Gmail link by hand.
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

## Gmail link picker (optional)

Any `url`-kind field can declare `gmailSearch` (see `src/entities/types.ts`) to get a **Find in
Gmail** button in the drawer — it searches your inbox read-only and turns a picked result into a
permalink, so you never paste a Gmail link by hand. Publications' **Decision email** field uses it
today. Entirely optional: with no Google credentials set, the button still opens but the search
fails closed with "Search failed", not a crash.

**One-time Google Cloud setup:**

1. Create (or reuse) a project at [console.cloud.google.com](https://console.cloud.google.com), then
   enable the **Gmail API** under APIs & Services → Library.
2. Configure the **OAuth consent screen**: User type *External*, publishing status *Testing*, and add
   your own Google account under **Test users** — this avoids Google's app-verification process
   entirely for personal use. Scope: `.../auth/gmail.readonly` (metadata + snippet, no message body
   is ever fetched — see `supabase/functions/_shared/gmail.ts`).
3. Create an **OAuth client ID** (type: *Web application*). Authorized redirect URI must be exactly
   `https://<project-ref>.functions.supabase.co/gmail-oauth-callback`.
4. Deploy the three functions — **the callback must be public**, since Google's redirect carries no
   Supabase session:

   ```bash
   supabase functions deploy gmail-oauth-start
   supabase functions deploy gmail-oauth-callback --no-verify-jwt
   supabase functions deploy gmail-search
   supabase secrets set \
     GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
     GOOGLE_REDIRECT_URI=https://<project-ref>.functions.supabase.co/gmail-oauth-callback \
     GMAIL_OAUTH_STATE_SECRET=$(openssl rand -hex 32)
   ```

   `GMAIL_OAUTH_STATE_SECRET` signs the OAuth `state` param, which is what proves a completed consent
   belongs to you rather than Google's default JWT check (impossible here, since the callback has no
   Supabase session) — any random string works, generate one, never reuse it elsewhere.
5. In the dashboard, open a publication, click **Find in Gmail** next to Decision email, then
   **Connect Gmail** — a Google tab opens once, and after approving, refresh tokens are stored
   server-side (`google_accounts`, service-role only, RLS default-deny like
   `telegram_pending_confirmations`) so you don't reconnect on every search.

If access is later revoked from `myaccount.google.com/permissions`, the next search cleanly asks you
to reconnect rather than failing silently forever — there's no separate "disconnect" button in the UI
by design; revoking from Google's own settings is the disconnect.

## Telegram bot

The bot can reach every module and every field, using one token vocabulary everywhere:

| Token | Meaning | Example |
|---|---|---|
| `#tag` | add a tag (created if new) | `#urgent` |
| `@project` | assign a project (quote if spaced) | `@Thesis`, `@"Big Project"` |
| `!high` | priority — high/medium/low | `!high` |
| `due:<when>` | a date: `friday`, `tomorrow 9am`, `2026-03-03`, `3/5` | `due:friday` |
| `in 2h` | relative time — m/h/d/w | `in 30m` |
| `field:value` | any other column | `venue:Nature`, `doi:10.1/x`, `org:Acme`, `note:"call first"` |

**Create** — everything after the command becomes the title:
`/add`, `/pub`, `/doc`, `/job Org | Role`, `/remind`, `/read <url>` (or just send a link).

**Work with existing records:** `/today` · `/list <module>` · `/find <text>` · `/done <n>` · `/set <field> <value>` · `/tag` · `/projects [new <name>]` · `/tags [new <name>]` · `/help`

**It's conversational.** After you create something — or pick a number from `/today`, `/list` or
`/find` — the bot stays on that record, so you can just send `#urgent @Thesis !high` to update it.
Send `done` to stop. `/tag` on its own lists your tags and asks which one you mean. Plain text with
no tokens is saved as a note rather than discarded.

Dates resolve in the time zone on your profile (set automatically from the browser, editable in
Settings) — without it, `due:friday` would land in UTC.

## Opportunities (discovery pipeline)

The **Opportunities** board is filled automatically, not by hand: a separate pipeline in
`../pipeline/` crawls job feeds and APIs nightly (via GitHub Actions), scores each posting against
your research profile, removes duplicates, and writes ranked results straight into the
`opportunities` table this dashboard reads. See `../pipeline/README.md` for how to configure sources,
run it locally, and wire up the nightly schedule and the Telegram `/discover` command. Nothing in
this dashboard app talks to the pipeline directly — they only share the Supabase database.

Dragging a card to **Tracked** on the Opportunities board automatically creates a matching row in
Jobs (via a database trigger, `fn_opportunity_to_job` in `schema.sql`) — no extra step needed to
start tracking an application you've decided to pursue.
