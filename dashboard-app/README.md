# Personal Dashboard MVP

A React + TypeScript personal workspace added alongside the academic GitHub Pages site.

## Modules

- Command center
- Drag-and-drop Kanban task board
- Publication pipeline
- Document and Google Drive metadata tracker
- Job application tracker
- Telegram capture foundation
- Supabase schema with Row Level Security

All visible records currently use clearly labeled sample data. Real records belong in the authenticated Supabase project, never in this public repository.

## Local setup

```bash
cd dashboard-app
npm install
cp .env.example .env
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the local environment. The anon key is browser-safe only when the included Row Level Security policies are applied.

Apply `supabase/schema.sql` in the Supabase SQL editor. Deploy `supabase/functions/telegram-webhook` as an Edge Function and store the bot token, service-role key, and webhook secret as Edge Function secrets. Never commit them.

The production dashboard build uses `/dashboard/` as its base path.
