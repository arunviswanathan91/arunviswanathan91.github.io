-- Project-scoped people memberships.
-- Existing dashboard: run this once, then re-run trash.sql so its RPC accepts
-- project_people. Fresh setup: schema.sql already creates the table. Safe to re-run.

begin;

create table if not exists public.project_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(project_id,person_id)
);

insert into public.project_people(user_id,project_id,person_id)
select project.user_id,project.id,person.id
from public.projects project join public.people person on person.user_id=project.user_id
on conflict(project_id,person_id) do nothing;

create index if not exists project_people_project_idx
  on public.project_people(project_id,created_at) where deleted_at is null;
create index if not exists project_people_person_idx
  on public.project_people(person_id) where deleted_at is null;

alter table public.project_people enable row level security;
drop policy if exists "own project people" on public.project_people;
create policy "own project people" on public.project_people for all to authenticated
  using ((select auth.uid())=user_id)
  with check (
    (select auth.uid())=user_id
    and exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid()))
    and exists(select 1 from public.people person where person.id=person_id and person.user_id=(select auth.uid()))
  );
drop policy if exists "members read project people" on public.project_people;
create policy "members read project people" on public.project_people for select to authenticated
  using (deleted_at is null and public.can_view_project(project_id));
drop policy if exists "owners manage project people" on public.project_people;
create policy "owners manage project people" on public.project_people for all to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));
grant select,insert,update,delete on public.project_people to authenticated;

create or replace function public.can_view_project_person(target_person_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_people pp
    where pp.person_id=target_person_id and pp.deleted_at is null
      and public.can_view_project(pp.project_id)
  );
$$;
revoke all on function public.can_view_project_person(uuid) from public,anon;
grant execute on function public.can_view_project_person(uuid) to authenticated;

alter table public.project_people add column if not exists deleted_at timestamptz;

drop trigger if exists project_people_set_updated_at on public.project_people;
create trigger project_people_set_updated_at before update on public.project_people
  for each row execute function public.set_updated_at();

-- Reinstall the Trash RPC with project_people included by running trash.sql
-- after this file. Keeping this explicit prevents a partially updated function.

commit;
