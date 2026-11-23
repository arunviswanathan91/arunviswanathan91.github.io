-- Public website content, edited from the dashboard. Run after loan-amounts.sql. Rerunnable.
--
-- Unlike every other table here, this one is readable WITHOUT signing in: the public
-- profile page (index.html) fetches it on load. It holds only what is shown on that
-- page. There is one row; whoever publishes first owns it and only they can change it.
-- With more than one account on the project, give it to yours straight away:
--   insert into public.ws_site (user_id) select id from auth.users where email = '<your email>'
--   on conflict (id) do nothing;
begin;

create table if not exists public.ws_site (
  id         boolean primary key default true check (id),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content    jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.ws_site enable row level security;
revoke all on public.ws_site from anon, public, authenticated;
grant select on public.ws_site to authenticated;
-- Visitors get the page content only, not which account owns it.
grant select (id, content, updated_at) on public.ws_site to anon;
grant insert, update on public.ws_site to authenticated;

drop policy if exists site_read on public.ws_site;
create policy site_read on public.ws_site for select to anon, authenticated using (true);

drop policy if exists site_claim on public.ws_site;
create policy site_claim on public.ws_site for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists site_edit on public.ws_site;
create policy site_edit on public.ws_site for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists site_touch on public.ws_site;
create trigger site_touch before update on public.ws_site
  for each row execute function ws_private.touch_updated_at();

-- One step of undo: each publish keeps the version it replaced (owner-only; visitors cannot read it).
alter table public.ws_site add column if not exists previous jsonb;

create or replace function ws_private.site_keep_previous()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.content is distinct from old.content and old.content <> '{}'::jsonb then
    new.previous := old.content;
  else
    new.previous := old.previous;
  end if;
  return new;
end
$$;
revoke all on function ws_private.site_keep_previous() from public, authenticated;

drop trigger if exists site_previous on public.ws_site;
create trigger site_previous before update on public.ws_site
  for each row execute function ws_private.site_keep_previous();

-- ── Public files: the CV and the profile photo ──────────────────────────────
-- Files live at  site/<owner-user-id>/<name>  and are readable by anyone with the link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_files_owner on storage.objects;
create policy site_files_owner on storage.objects
  for all to authenticated
  using (bucket_id = 'site' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'site' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
