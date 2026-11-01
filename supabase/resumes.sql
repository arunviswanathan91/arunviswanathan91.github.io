-- Resume builder: many named resumes per account, each stored as one JSON document
-- (profile, ordered sections, style). Run after agenda-recurring-followups.sql. Rerunnable.
begin;

create table if not exists public.ws_resumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default 'Untitled resume' check (length(trim(title)) > 0),
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists resumes_recent_idx on public.ws_resumes (user_id, updated_at desc);
select ws_private.secure_table('public.ws_resumes');
drop trigger if exists resumes_touch on public.ws_resumes;
create trigger resumes_touch before update on public.ws_resumes
  for each row execute function ws_private.touch_updated_at();

-- RLS does not cover TRUNCATE, so signed-in users must not hold it (or REFERENCES/TRIGGER).
revoke truncate, references, trigger on public.ws_resumes from authenticated, anon, public;

commit;
