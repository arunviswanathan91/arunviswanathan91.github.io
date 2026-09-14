-- Recoverable deletion for dashboard records.
-- Safe to re-run. Apply after schema.sql and project-collaboration.sql.

alter table public.profiles add column if not exists trash_retention_days smallint not null default 30;
do $$ begin
  alter table public.profiles add constraint profiles_trash_retention_days_check
    check (trash_retention_days in (14,30));
exception when duplicate_object then null; end $$;

alter table public.projects add column if not exists deleted_at timestamptz;
alter table public.tasks add column if not exists deleted_at timestamptz;
alter table public.publications add column if not exists deleted_at timestamptz;
alter table public.documents add column if not exists deleted_at timestamptz;
alter table public.job_applications add column if not exists deleted_at timestamptz;
alter table public.reminders add column if not exists deleted_at timestamptz;
alter table public.reads add column if not exists deleted_at timestamptz;
alter table public.opportunities add column if not exists deleted_at timestamptz;
alter table public.tags add column if not exists deleted_at timestamptz;
alter table public.people add column if not exists deleted_at timestamptz;
alter table public.project_stages add column if not exists deleted_at timestamptz;
alter table public.project_links add column if not exists deleted_at timestamptz;
alter table public.project_fields add column if not exists deleted_at timestamptz;
alter table public.publication_nodes add column if not exists deleted_at timestamptz;
alter table public.publication_stage_events add column if not exists deleted_at timestamptz;

create table if not exists public.trash_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_table text not null,
  record_id uuid not null,
  item_type text not null,
  title text not null,
  snapshot jsonb not null,
  deleted_at timestamptz not null default now(),
  purge_at timestamptz not null,
  unique(source_table,record_id)
);

create index if not exists trash_items_user_deleted_idx on public.trash_items(user_id,deleted_at desc);
create index if not exists trash_items_purge_idx on public.trash_items(purge_at);
create index if not exists projects_active_idx on public.projects(user_id,name) where deleted_at is null;
create index if not exists tasks_active_idx on public.tasks(user_id,created_at desc) where deleted_at is null;
create index if not exists publications_active_idx on public.publications(user_id,created_at desc) where deleted_at is null;
create index if not exists reminders_active_idx on public.reminders(user_id,remind_at) where deleted_at is null;
create index if not exists reads_active_idx on public.reads(user_id,created_at desc) where deleted_at is null;
create index if not exists opportunities_active_idx on public.opportunities(user_id,created_at desc) where deleted_at is null;

alter table public.trash_items enable row level security;
revoke all on public.trash_items from anon;
grant select on public.trash_items to authenticated;
drop policy if exists "owners read trash" on public.trash_items;
create policy "owners read trash" on public.trash_items for select to authenticated
  using (auth.uid()=user_id);

-- Only the record owner can put something in Trash. Project collaborators keep
-- their add/edit/move permissions, but cannot delete or invoke this function.
create or replace function public.move_to_trash(p_table text,p_record_id uuid)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_deleted timestamptz:=clock_timestamp();
  v_days integer;
  v_type text;
  v_title text;
  v_trash_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_table not in ('projects','tasks','publications','documents','job_applications','reminders','reads',
    'opportunities','tags','people','project_stages','project_links','project_fields','publication_nodes','publication_stage_events')
  then raise exception 'Table is not trash-enabled: %',p_table; end if;

  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 and deleted_at is null',p_table)
    into v_snapshot using p_record_id,v_user;
  if v_snapshot is null then raise exception 'Record not found or deletion is not permitted'; end if;

  v_type:=case p_table
    when 'projects' then 'project'
    when 'tasks' then 'task'
    when 'publications' then 'publication'
    when 'documents' then 'document'
    when 'job_applications' then 'application'
    when 'reminders' then 'reminder'
    when 'reads' then 'read'
    when 'opportunities' then 'opportunity'
    when 'tags' then 'tag'
    when 'people' then 'person'
    when 'project_stages' then 'project_stage'
    when 'project_links' then 'project_link'
    when 'project_fields' then 'project_field'
    when 'publication_nodes' then 'publication_node'
    when 'publication_stage_events' then 'publication_stage_event'
    else p_table end;
  v_title:=coalesce(nullif(v_snapshot->>'title',''),nullif(v_snapshot->>'name',''),
    nullif(v_snapshot->>'role',''),nullif(v_snapshot->>'label',''),nullif(v_snapshot->>'url',''),
    initcap(replace(v_type,'_',' ')));
  select coalesce(trash_retention_days,30) into v_days from public.profiles where id=v_user;
  v_days:=coalesce(v_days,30);

  execute format('update public.%I set deleted_at=$1 where id=$2 and user_id=$3 and deleted_at is null',p_table)
    using v_deleted,p_record_id,v_user;

  if p_table='tasks' then
    update public.reminders set deleted_at=v_deleted,done=true
      where task_id=p_record_id and user_id=v_user and deleted_at is null;
  elsif p_table='reminders' then
    update public.reminders set done=true where id=p_record_id and user_id=v_user;
  end if;

  insert into public.trash_items(user_id,source_table,record_id,item_type,title,snapshot,deleted_at,purge_at)
  values(v_user,p_table,p_record_id,v_type,v_title,v_snapshot,v_deleted,v_deleted+make_interval(days=>v_days))
  on conflict(source_table,record_id) do update set
    user_id=excluded.user_id,item_type=excluded.item_type,title=excluded.title,snapshot=excluded.snapshot,
    deleted_at=excluded.deleted_at,purge_at=excluded.purge_at
  returning id into v_trash_id;
  return v_trash_id;
end;
$$;

create or replace function public.restore_trash_item(p_trash_id uuid)
returns void
language plpgsql security definer set search_path=public
as $$
declare v_item public.trash_items%rowtype;
begin
  select * into v_item from public.trash_items where id=p_trash_id and user_id=auth.uid() for update;
  if not found then raise exception 'Trash item not found or restore is not permitted'; end if;

  execute format('update public.%I set deleted_at=null where id=$1 and user_id=$2',v_item.source_table)
    using v_item.record_id,v_item.user_id;
  if not found then
    delete from public.trash_items where id=v_item.id;
    raise exception 'The original record no longer exists';
  end if;

  if v_item.source_table='tasks' then
    update public.reminders set deleted_at=null,done=false
      where task_id=v_item.record_id and user_id=v_item.user_id and deleted_at=v_item.deleted_at;
  elsif v_item.source_table='reminders' then
    update public.reminders set
      done=coalesce((v_item.snapshot->>'done')::boolean,false),
      notified_at=nullif(v_item.snapshot->>'notified_at','')::timestamptz
      where id=v_item.record_id and user_id=v_item.user_id;
  end if;
  delete from public.trash_items where id=v_item.id;
end;
$$;

create or replace function public.delete_trash_item(p_trash_id uuid)
returns void
language plpgsql security definer set search_path=public
as $$
declare v_item public.trash_items%rowtype;
begin
  select * into v_item from public.trash_items where id=p_trash_id for update;
  if not found then return; end if;
  if coalesce(auth.role(),'')<>'service_role' and v_item.user_id is distinct from auth.uid() then
    raise exception 'Permanent deletion is not permitted';
  end if;
  execute format('delete from public.%I where id=$1 and user_id=$2',v_item.source_table)
    using v_item.record_id,v_item.user_id;
  delete from public.trash_items where id=v_item.id;
end;
$$;

create or replace function public.empty_trash()
returns integer
language plpgsql security definer set search_path=public
as $$
declare v_item record;v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  for v_item in select id from public.trash_items where user_id=auth.uid() order by deleted_at loop
    perform public.delete_trash_item(v_item.id);v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.purge_expired_trash()
returns integer
language plpgsql security definer set search_path=public
as $$
declare v_item record;v_count integer:=0;v_service boolean:=coalesce(auth.role(),'')='service_role';
begin
  if auth.uid() is null and not v_service then raise exception 'Authentication required'; end if;
  for v_item in select id from public.trash_items
    where purge_at<=clock_timestamp() and (v_service or user_id=auth.uid()) order by purge_at
  loop
    perform public.delete_trash_item(v_item.id);v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.fn_update_trash_retention()
returns trigger
language plpgsql security definer set search_path=public
as $$
begin
  if new.trash_retention_days is distinct from old.trash_retention_days then
    update public.trash_items set purge_at=deleted_at+make_interval(days=>new.trash_retention_days)
      where user_id=new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_update_trash_retention on public.profiles;
create trigger profiles_update_trash_retention after update of trash_retention_days on public.profiles
  for each row execute function public.fn_update_trash_retention();

revoke all on function public.move_to_trash(text,uuid) from public,anon;
revoke all on function public.restore_trash_item(uuid) from public,anon;
revoke all on function public.delete_trash_item(uuid) from public,anon;
revoke all on function public.empty_trash() from public,anon;
revoke all on function public.purge_expired_trash() from public,anon;
grant execute on function public.move_to_trash(text,uuid) to authenticated;
grant execute on function public.restore_trash_item(uuid) to authenticated;
grant execute on function public.delete_trash_item(uuid) to authenticated,service_role;
grant execute on function public.empty_trash() to authenticated;
grant execute on function public.purge_expired_trash() to authenticated,service_role;
