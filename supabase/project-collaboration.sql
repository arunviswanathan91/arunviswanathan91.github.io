-- Project-only collaboration
-- Safe to run repeatedly in the Supabase SQL editor.
-- Editors may add, update and move project work. Only the project owner may
-- delete rows, reassign rows to another project, manage tags or edit people.

begin;

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id,user_id)
);
alter table public.project_members add column if not exists role text not null default 'viewer';
alter table public.project_members add column if not exists added_by uuid references auth.users(id) on delete set null;
alter table public.project_members add column if not exists created_at timestamptz not null default now();
create unique index if not exists project_members_project_user_key on public.project_members(project_id,user_id);
create index if not exists project_members_user_idx on public.project_members(user_id,created_at);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.project_members'::regclass
      and conname='project_members_role_check'
  ) then
    alter table public.project_members add constraint project_members_role_check
      check (role in ('viewer','editor'));
  end if;
end $$;

alter table public.project_members enable row level security;
grant select on public.project_members to authenticated;

-- SECURITY DEFINER avoids RLS recursion while auth.uid() still identifies the
-- signed-in browser user whose access is being checked.
create or replace function public.is_project_owner(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id=target_project_id and p.user_id=(select auth.uid())
  );
$$;

create or replace function public.can_view_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_project_owner(target_project_id) or exists (
    select 1 from public.project_members pm
    where pm.project_id=target_project_id and pm.user_id=(select auth.uid())
  );
$$;

create or replace function public.can_edit_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_project_owner(target_project_id) or exists (
    select 1 from public.project_members pm
    where pm.project_id=target_project_id and pm.user_id=(select auth.uid()) and pm.role='editor'
  );
$$;

create or replace function public.project_owner_id(target_project_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.user_id from public.projects p where p.id=target_project_id;
$$;

create or replace function public.can_view_project_entity(target_type text,target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case target_type
    when 'project' then public.can_view_project(target_id)
    when 'task' then exists (
      select 1 from public.tasks r where r.id=target_id and r.project_id is not null
        and public.can_view_project(r.project_id)
    )
    when 'publication' then exists (
      select 1 from public.publications r where r.id=target_id and r.project_id is not null
        and public.can_view_project(r.project_id)
    )
    when 'read' then exists (
      select 1 from public.reads r where r.id=target_id and r.project_id is not null
        and public.can_view_project(r.project_id)
    )
    when 'document' then exists (
      select 1 from public.documents r where r.id=target_id and r.project_id is not null
        and public.can_view_project(r.project_id)
    )
    when 'reminder' then exists (
      select 1 from public.reminders r where r.id=target_id and r.project_id is not null
        and public.can_view_project(r.project_id)
    )
    else false
  end;
$$;

create or replace function public.can_view_shared_tag(target_tag_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.item_tags it
    where it.tag_id=target_tag_id
      and public.can_view_project_entity(it.entity_type,it.entity_id)
  );
$$;

create or replace function public.can_view_project_person(target_person_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.assignee_id=target_person_id and t.project_id is not null
      and public.can_view_project(t.project_id)
  ) or exists (
    select 1 from public.publication_nodes n
    join public.publications p on p.id=n.publication_id
    where n.assignee_id=target_person_id and p.project_id is not null
      and public.can_view_project(p.project_id)
  );
$$;

revoke all on function public.is_project_owner(uuid) from public,anon;
revoke all on function public.can_view_project(uuid) from public,anon;
revoke all on function public.can_edit_project(uuid) from public,anon;
revoke all on function public.project_owner_id(uuid) from public,anon;
revoke all on function public.can_view_project_entity(text,uuid) from public,anon;
revoke all on function public.can_view_shared_tag(uuid) from public,anon;
revoke all on function public.can_view_project_person(uuid) from public,anon;
grant execute on function public.is_project_owner(uuid) to authenticated;
grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;
grant execute on function public.project_owner_id(uuid) to authenticated;
grant execute on function public.can_view_project_entity(text,uuid) to authenticated;
grant execute on function public.can_view_shared_tag(uuid) to authenticated;
grant execute on function public.can_view_project_person(uuid) to authenticated;

drop policy if exists "members read own project memberships" on public.project_members;
create policy "members read own project memberships" on public.project_members
  for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "owners manage project memberships" on public.project_members;
create policy "owners manage project memberships" on public.project_members
  for all to authenticated using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- Shared rows are readable only through their direct project. A shared tag does
-- not expose a paper or read that belongs to some other private project.
drop policy if exists "members read shared projects" on public.projects;
create policy "members read shared projects" on public.projects
  for select to authenticated using (public.can_view_project(id));
drop policy if exists "members read shared tasks" on public.tasks;
create policy "members read shared tasks" on public.tasks
  for select to authenticated using (project_id is not null and public.can_view_project(project_id));
drop policy if exists "members read shared publications" on public.publications;
create policy "members read shared publications" on public.publications
  for select to authenticated using (project_id is not null and public.can_view_project(project_id));
drop policy if exists "members read shared reads" on public.reads;
create policy "members read shared reads" on public.reads
  for select to authenticated using (project_id is not null and public.can_view_project(project_id));
drop policy if exists "members read shared documents" on public.documents;
create policy "members read shared documents" on public.documents
  for select to authenticated using (project_id is not null and public.can_view_project(project_id));
drop policy if exists "members read shared reminders" on public.reminders;
create policy "members read shared reminders" on public.reminders
  for select to authenticated using (project_id is not null and public.can_view_project(project_id));
drop policy if exists "members read shared project stages" on public.project_stages;
create policy "members read shared project stages" on public.project_stages
  for select to authenticated using (public.can_view_project(project_id));
drop policy if exists "members read shared project links" on public.project_links;
create policy "members read shared project links" on public.project_links
  for select to authenticated using (public.can_view_project(project_id));
drop policy if exists "members read shared project fields" on public.project_fields;
create policy "members read shared project fields" on public.project_fields
  for select to authenticated using (public.can_view_project(project_id));
drop policy if exists "members read shared publication nodes" on public.publication_nodes;
create policy "members read shared publication nodes" on public.publication_nodes
  for select to authenticated using (exists (
    select 1 from public.publications p
    where p.id=publication_id and p.project_id is not null and public.can_view_project(p.project_id)
  ));
drop policy if exists "members read shared publication stage events" on public.publication_stage_events;
create policy "members read shared publication stage events" on public.publication_stage_events
  for select to authenticated using (exists (
    select 1 from public.publications p
    where p.id=publication_id and p.project_id is not null and public.can_view_project(p.project_id)
  ));
drop policy if exists "members read assigned project people" on public.people;
create policy "members read assigned project people" on public.people
  for select to authenticated using (public.can_view_project_person(id));
drop policy if exists "members read shared tags" on public.tags;
create policy "members read shared tags" on public.tags
  for select to authenticated using (public.can_view_shared_tag(id));
drop policy if exists "members read shared item tags" on public.item_tags;
create policy "members read shared item tags" on public.item_tags
  for select to authenticated using (public.can_view_project_entity(entity_type,entity_id));

-- A shared row always remains owned by the project owner. This preserves the
-- owner's Telegram reminders and prevents the existing owner DELETE policies
-- from ever matching a collaborator.
create or replace function public.fn_enforce_project_row_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare expected_owner uuid;
begin
  if tg_op='UPDATE' and (select auth.uid()) is not null
     and old.project_id is not null
     and not public.is_project_owner(old.project_id)
     and (new.project_id is distinct from old.project_id or new.id is distinct from old.id) then
    raise exception 'Project editors cannot move records to another project'
      using errcode='42501';
  end if;

  if new.project_id is not null then
    select p.user_id into expected_owner from public.projects p where p.id=new.project_id;
    if expected_owner is null then
      raise exception 'Project not found' using errcode='23503';
    end if;
    new.user_id:=expected_owner;
  end if;
  return new;
end;
$$;

create or replace function public.fn_block_project_editor_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and old.project_id is not null
     and not public.is_project_owner(old.project_id) then
    raise exception 'Only the project owner can delete project records'
      using errcode='42501';
  end if;
  return old;
end;
$$;

drop trigger if exists aaa_tasks_project_owner on public.tasks;
create trigger aaa_tasks_project_owner before insert or update on public.tasks
  for each row execute function public.fn_enforce_project_row_owner();
drop trigger if exists tasks_owner_only_delete on public.tasks;
create trigger tasks_owner_only_delete before delete on public.tasks
  for each row execute function public.fn_block_project_editor_delete();
drop trigger if exists aaa_publications_project_owner on public.publications;
create trigger aaa_publications_project_owner before insert or update on public.publications
  for each row execute function public.fn_enforce_project_row_owner();
drop trigger if exists publications_owner_only_delete on public.publications;
create trigger publications_owner_only_delete before delete on public.publications
  for each row execute function public.fn_block_project_editor_delete();
drop trigger if exists aaa_reads_project_owner on public.reads;
create trigger aaa_reads_project_owner before insert or update on public.reads
  for each row execute function public.fn_enforce_project_row_owner();
drop trigger if exists reads_owner_only_delete on public.reads;
create trigger reads_owner_only_delete before delete on public.reads
  for each row execute function public.fn_block_project_editor_delete();
drop trigger if exists aaa_documents_project_owner on public.documents;
create trigger aaa_documents_project_owner before insert or update on public.documents
  for each row execute function public.fn_enforce_project_row_owner();
drop trigger if exists documents_owner_only_delete on public.documents;
create trigger documents_owner_only_delete before delete on public.documents
  for each row execute function public.fn_block_project_editor_delete();
drop trigger if exists aaa_reminders_project_owner on public.reminders;
create trigger aaa_reminders_project_owner before insert or update on public.reminders
  for each row execute function public.fn_enforce_project_row_owner();
drop trigger if exists reminders_owner_only_delete on public.reminders;
create trigger reminders_owner_only_delete before delete on public.reminders
  for each row execute function public.fn_block_project_editor_delete();
drop trigger if exists aaa_project_stages_owner on public.project_stages;
create trigger aaa_project_stages_owner before insert or update on public.project_stages
  for each row execute function public.fn_enforce_project_row_owner();
drop trigger if exists project_stages_owner_only_delete on public.project_stages;
create trigger project_stages_owner_only_delete before delete on public.project_stages
  for each row execute function public.fn_block_project_editor_delete();
drop trigger if exists aaa_project_links_owner on public.project_links;
create trigger aaa_project_links_owner before insert or update on public.project_links
  for each row execute function public.fn_enforce_project_row_owner();
drop trigger if exists project_links_owner_only_delete on public.project_links;
create trigger project_links_owner_only_delete before delete on public.project_links
  for each row execute function public.fn_block_project_editor_delete();
drop trigger if exists aaa_project_fields_owner on public.project_fields;
create trigger aaa_project_fields_owner before insert or update on public.project_fields
  for each row execute function public.fn_enforce_project_row_owner();
drop trigger if exists project_fields_owner_only_delete on public.project_fields;
create trigger project_fields_owner_only_delete before delete on public.project_fields
  for each row execute function public.fn_block_project_editor_delete();

-- Task links cannot be used to expose a private contact or a paper from another
-- project to an editor.
create or replace function public.fn_validate_project_task_links()
returns trigger language plpgsql security definer set search_path = '' as $$
declare expected_owner uuid; linked_project uuid;
begin
  if new.project_id is null then return new; end if;
  select p.user_id into expected_owner from public.projects p where p.id=new.project_id;

  if new.assignee_id is not null and not exists (
    select 1 from public.people person
    where person.id=new.assignee_id and person.user_id=expected_owner
  ) then
    raise exception 'Assignee does not belong to this project owner'
      using errcode='42501';
  end if;

  if new.publication_id is not null then
    select p.project_id into linked_project from public.publications p
    where p.id=new.publication_id and p.user_id=expected_owner;
    if not found then
      raise exception 'Linked publication does not belong to this project owner'
        using errcode='42501';
    end if;
    if (select auth.uid()) is not null and not public.is_project_owner(new.project_id)
       and linked_project is distinct from new.project_id then
      raise exception 'Project editors may link only publications in this project'
        using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists aab_tasks_project_links on public.tasks;
create trigger aab_tasks_project_links before insert or update on public.tasks
  for each row execute function public.fn_validate_project_task_links();

create or replace function public.fn_enforce_publication_node_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare expected_owner uuid; target_project uuid; old_project uuid;
begin
  if tg_op='UPDATE' then
    select p.project_id into old_project from public.publications p where p.id=old.publication_id;
    if (select auth.uid()) is not null and old_project is not null
       and not public.is_project_owner(old_project)
       and (new.publication_id is distinct from old.publication_id or new.id is distinct from old.id) then
      raise exception 'Project editors cannot move paper steps to another publication'
        using errcode='42501';
    end if;
  end if;

  select p.user_id,p.project_id into expected_owner,target_project
  from public.publications p where p.id=new.publication_id;
  if not found then
    raise exception 'Publication not found' using errcode='23503';
  end if;
  new.user_id:=expected_owner;

  if new.assignee_id is not null and not exists (
    select 1 from public.people person
    where person.id=new.assignee_id and person.user_id=expected_owner
  ) then
    raise exception 'Assignee does not belong to this publication owner'
      using errcode='42501';
  end if;
  return new;
end;
$$;

create or replace function public.fn_block_publication_node_editor_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_project uuid;
begin
  select p.project_id into target_project from public.publications p where p.id=old.publication_id;
  if (select auth.uid()) is not null and target_project is not null
     and not public.is_project_owner(target_project) then
    raise exception 'Only the project owner can delete paper steps'
      using errcode='42501';
  end if;
  return old;
end;
$$;

drop trigger if exists aaa_publication_nodes_owner on public.publication_nodes;
create trigger aaa_publication_nodes_owner before insert or update on public.publication_nodes
  for each row execute function public.fn_enforce_publication_node_owner();
drop trigger if exists publication_nodes_owner_only_delete on public.publication_nodes;
create trigger publication_nodes_owner_only_delete before delete on public.publication_nodes
  for each row execute function public.fn_block_publication_node_editor_delete();

create or replace function public.fn_block_non_owner_project_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_project_owner(old.id) then
    raise exception 'Only the project owner can delete this project'
      using errcode='42501';
  end if;
  return old;
end;
$$;
drop trigger if exists projects_owner_only_delete on public.projects;
create trigger projects_owner_only_delete before delete on public.projects
  for each row execute function public.fn_block_non_owner_project_delete();

-- Editor write policies. Deliberately no collaborator DELETE policy exists.
drop policy if exists "editors update shared projects" on public.projects;
create policy "editors update shared projects" on public.projects
  for update to authenticated using (public.can_edit_project(id))
  with check (public.can_edit_project(id) and user_id=public.project_owner_id(id));

drop policy if exists "editors insert shared tasks" on public.tasks;
create policy "editors insert shared tasks" on public.tasks for insert to authenticated
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));
drop policy if exists "editors update shared tasks" on public.tasks;
create policy "editors update shared tasks" on public.tasks for update to authenticated
  using (project_id is not null and public.can_edit_project(project_id))
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));

drop policy if exists "editors insert shared publications" on public.publications;
create policy "editors insert shared publications" on public.publications for insert to authenticated
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));
drop policy if exists "editors update shared publications" on public.publications;
create policy "editors update shared publications" on public.publications for update to authenticated
  using (project_id is not null and public.can_edit_project(project_id))
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));

drop policy if exists "editors insert shared reads" on public.reads;
create policy "editors insert shared reads" on public.reads for insert to authenticated
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));
drop policy if exists "editors update shared reads" on public.reads;
create policy "editors update shared reads" on public.reads for update to authenticated
  using (project_id is not null and public.can_edit_project(project_id))
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));

drop policy if exists "editors insert shared documents" on public.documents;
create policy "editors insert shared documents" on public.documents for insert to authenticated
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));
drop policy if exists "editors update shared documents" on public.documents;
create policy "editors update shared documents" on public.documents for update to authenticated
  using (project_id is not null and public.can_edit_project(project_id))
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));

drop policy if exists "editors insert shared reminders" on public.reminders;
create policy "editors insert shared reminders" on public.reminders for insert to authenticated
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));
drop policy if exists "editors update shared reminders" on public.reminders;
create policy "editors update shared reminders" on public.reminders for update to authenticated
  using (project_id is not null and public.can_edit_project(project_id))
  with check (project_id is not null and public.can_edit_project(project_id)
    and user_id=public.project_owner_id(project_id));

drop policy if exists "editors insert shared project stages" on public.project_stages;
create policy "editors insert shared project stages" on public.project_stages for insert to authenticated
  with check (public.can_edit_project(project_id) and user_id=public.project_owner_id(project_id));
drop policy if exists "editors update shared project stages" on public.project_stages;
create policy "editors update shared project stages" on public.project_stages for update to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id) and user_id=public.project_owner_id(project_id));

drop policy if exists "editors insert shared project links" on public.project_links;
create policy "editors insert shared project links" on public.project_links for insert to authenticated
  with check (public.can_edit_project(project_id) and user_id=public.project_owner_id(project_id));
drop policy if exists "editors update shared project links" on public.project_links;
create policy "editors update shared project links" on public.project_links for update to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id) and user_id=public.project_owner_id(project_id));

drop policy if exists "editors insert shared project fields" on public.project_fields;
create policy "editors insert shared project fields" on public.project_fields for insert to authenticated
  with check (public.can_edit_project(project_id) and user_id=public.project_owner_id(project_id));
drop policy if exists "editors update shared project fields" on public.project_fields;
create policy "editors update shared project fields" on public.project_fields for update to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id) and user_id=public.project_owner_id(project_id));

drop policy if exists "editors insert shared publication nodes" on public.publication_nodes;
create policy "editors insert shared publication nodes" on public.publication_nodes for insert to authenticated
  with check (exists (
    select 1 from public.publications p where p.id=publication_id and p.project_id is not null
      and public.can_edit_project(p.project_id) and publication_nodes.user_id=p.user_id
  ));
drop policy if exists "editors update shared publication nodes" on public.publication_nodes;
create policy "editors update shared publication nodes" on public.publication_nodes for update to authenticated
  using (exists (
    select 1 from public.publications p where p.id=publication_id and p.project_id is not null
      and public.can_edit_project(p.project_id)
  ))
  with check (exists (
    select 1 from public.publications p where p.id=publication_id and p.project_id is not null
      and public.can_edit_project(p.project_id) and publication_nodes.user_id=p.user_id
  ));

commit;
