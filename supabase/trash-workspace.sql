-- Trash for the workspace modules (papers, notes, meetings, deadlines, loans, budget, contacts, resumes…).
-- Apply after trash.sql and workspace-extension.sql (and resumes.sql). Safe to re-run.
--
-- How it works: deleting one of these records stores a full snapshot in public.trash_items (the row, the child
-- rows that cascade with it, and the links that deleting it would clear) and then removes the live row. Budgets,
-- the agenda, search, reminders and the calendar feed therefore never see deleted items. Restore re-inserts the
-- snapshot; after the retention period (profiles.trash_retention_days, default 30) the sweep deletes the snapshot.
-- Tasks and projects keep using public.move_to_trash.

create schema if not exists ws_private;

-- Snapshot rows of p_table where p_col = any(p_vals), plus (recursively) the rows that would cascade-delete and
-- the (id, parent) pairs of rows whose link would be set to null.
create or replace function ws_private.trash_capture(p_table regclass,p_col text,p_vals uuid[],p_depth int default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_has_id boolean;v_rows jsonb;v_ids uuid[]:='{}';v_children jsonb:='[]'::jsonb;v_links jsonb:='[]'::jsonb;
  fk record;v_sub jsonb;v_pairs jsonb;
begin
  if p_depth>4 then raise exception 'This record has too many linked records to move to Trash'; end if;
  select exists(select 1 from pg_attribute where attrelid=p_table and attname='id' and not attisdropped) into v_has_id;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %s t where t.%I = any($1)',p_table,p_col) into v_rows using p_vals;
  if v_has_id then
    execute format('select coalesce(array_agg(t.id),''{}''::uuid[]) from %s t where t.%I = any($1)',p_table,p_col) into v_ids using p_vals;
  end if;
  if v_has_id and cardinality(v_ids)>0 then
    for fk in
      select c.conrelid::regclass as child,ca.attname::text as col,c.confdeltype as rule
      from pg_constraint c
      join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=c.conkey[1]
      join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=c.confkey[1]
      where c.contype='f' and c.confrelid=p_table and cardinality(c.conkey)=1 and pa.attname='id' and c.confdeltype in ('c','n')
    loop
      if fk.rule='c' then
        v_sub:=ws_private.trash_capture(fk.child,fk.col,v_ids,p_depth+1);
        if jsonb_array_length(v_sub->'rows')>0 then
          v_children:=v_children||jsonb_build_array(jsonb_build_object('table',fk.child::text,'col',fk.col,'data',v_sub));
        end if;
      elsif exists(select 1 from pg_attribute where attrelid=fk.child and attname='id' and not attisdropped) then
        execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',t.id,''parent'',t.%I)),''[]''::jsonb) from %s t where t.%I = any($1)',fk.col,fk.child,fk.col)
          into v_pairs using v_ids;
        if jsonb_array_length(v_pairs)>0 then
          v_links:=v_links||jsonb_build_array(jsonb_build_object('table',fk.child::text,'col',fk.col,'pairs',v_pairs));
        end if;
      end if;
    end loop;
  end if;
  return jsonb_build_object('rows',v_rows,'children',v_children,'links',v_links);
end $$;

-- Put a snapshot back: parent rows first, then children, then the links that were cleared.
create or replace function ws_private.trash_restore(p_table regclass,p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_cols text;c jsonb;l jsonb;pair jsonb;
begin
  select string_agg(quote_ident(attname),',' order by attnum) into v_cols from pg_attribute
    where attrelid=p_table and attnum>0 and not attisdropped and attgenerated='';
  execute format('insert into %s(%s) select %s from jsonb_populate_recordset(null::%s,$1)',p_table,v_cols,v_cols,p_table) using p_data->'rows';
  for c in select * from jsonb_array_elements(p_data->'children') loop
    perform ws_private.trash_restore((c->>'table')::regclass,c->'data');
  end loop;
  for l in select * from jsonb_array_elements(p_data->'links') loop
    for pair in select * from jsonb_array_elements(l->'pairs') loop
      execute format('update %s set %I=$1 where id=$2 and %I is null',(l->>'table')::regclass,l->>'col',l->>'col')
        using (pair->>'parent')::uuid,(pair->>'id')::uuid;
    end loop;
  end loop;
exception
  when foreign_key_violation then
    raise exception 'Cannot restore: something this item was linked to has since been deleted (%)',sqlerrm;
  when unique_violation then
    raise exception 'Cannot restore: a record with the same details already exists (%)',sqlerrm;
  when raise_exception then
    -- e.g. the ownership check on a link whose target is gone; nested restores already carry the prefix
    if sqlerrm like 'Cannot restore%' then raise; end if;
    raise exception 'Cannot restore: %',sqlerrm;
end $$;

-- Move one record to Trash. p_table is the short module name ('papers', 'notes', 'loans' …).
create or replace function public.ws_trash(p_table text,p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_full text;v_type text;v_exists boolean;v_snap jsonb;v_row jsonb;v_title text;
  v_days int;v_deleted timestamptz:=clock_timestamp();v_trash uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_table in ('tasks','projects') then return public.move_to_trash(p_table,p_id); end if;
  v_type:=case p_table
    when 'papers' then 'paper' when 'notes' then 'note' when 'meetings' then 'meeting' when 'deadlines' then 'deadline'
    when 'loans' then 'loan' when 'loan_payments' then 'repayment' when 'transactions' then 'transaction'
    when 'budget_categories' then 'budget_category' when 'recurring' then 'recurring_transaction'
    when 'contacts' then 'contact' when 'resumes' then 'resume' when 'meeting_action_items' then 'action_item'
    when 'habits' then 'habit' else null end;
  if v_type is null then raise exception 'Table is not trash-enabled: %',p_table; end if;
  v_full:='ws_'||p_table;
  execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',v_full) into v_exists using p_id,v_user;
  if not v_exists then raise exception 'Record not found or deletion is not permitted'; end if;

  v_snap:=ws_private.trash_capture(('public.'||quote_ident(v_full))::regclass,'id',array[p_id]);
  v_row:=v_snap->'rows'->0;
  v_title:=coalesce(nullif(v_row->>'title',''),nullif(v_row->>'name',''),nullif(v_row->>'description',''),nullif(v_row->>'text',''),
    nullif(v_row->>'account_name',''),initcap(replace(v_type,'_',' ')));
  if p_table='loans' then
    v_title:=coalesce(nullif(v_row->>'account_name',''),(select name from public.ws_contacts where id=(v_row->>'contact_id')::uuid),'Loan')
      ||' — '||(v_row->>'amount')||' '||(v_row->>'currency');
  elsif p_table='loan_payments' then
    v_title:='Repayment '||(v_row->>'amount')||' on '||(v_row->>'paid_on');
  end if;
  select coalesce(trash_retention_days,30) into v_days from public.profiles where id=v_user;
  v_days:=coalesce(v_days,30);

  execute format('delete from public.%I where id=$1 and user_id=$2',v_full) using p_id,v_user;
  insert into public.trash_items(user_id,source_table,record_id,item_type,title,snapshot,deleted_at,purge_at)
  values(v_user,v_full,p_id,v_type,left(v_title,300),v_snap,v_deleted,v_deleted+make_interval(days=>v_days))
  on conflict(source_table,record_id) do update set item_type=excluded.item_type,title=excluded.title,snapshot=excluded.snapshot,
    deleted_at=excluded.deleted_at,purge_at=excluded.purge_at
  returning id into v_trash;
  return v_trash;
end $$;

-- Restore: workspace snapshots are re-inserted; everything else keeps the original soft-delete behaviour.
create or replace function public.restore_trash_item(p_trash_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_item public.trash_items%rowtype;v_remaining integer;
begin
  select * into v_item from public.trash_items where id=p_trash_id and user_id=auth.uid() for update;
  if not found then raise exception 'Trash item not found or restore is not permitted'; end if;

  if v_item.source_table like 'ws\_%' then
    perform ws_private.trash_restore(('public.'||quote_ident(v_item.source_table))::regclass,v_item.snapshot);
  else
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
  end if;

  delete from public.trash_items where id=v_item.id;
  if v_item.batch_id is not null then
    select count(*) into v_remaining from public.trash_items where batch_id=v_item.batch_id;
    if v_remaining=0 then delete from public.trash_batches where id=v_item.batch_id;
    else update public.trash_batches set item_count=v_remaining where id=v_item.batch_id; end if;
  end if;
end $$;

-- Permanent deletion (manual, "Empty Trash", or the scheduled purge): a workspace snapshot is simply dropped,
-- its live row is already gone.
create or replace function public.delete_trash_item(p_trash_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_item public.trash_items%rowtype;v_remaining integer;
begin
  select * into v_item from public.trash_items where id=p_trash_id for update;
  if not found then return; end if;
  if coalesce(auth.role(),'')<>'service_role' and v_item.user_id is distinct from auth.uid() then
    raise exception 'Permanent deletion is not permitted';
  end if;
  if v_item.source_table not like 'ws\_%' then
    execute format('delete from public.%I where id=$1 and user_id=$2',v_item.source_table)
      using v_item.record_id,v_item.user_id;
  end if;
  delete from public.trash_items where id=v_item.id;
  if v_item.batch_id is not null then
    select count(*) into v_remaining from public.trash_items where batch_id=v_item.batch_id;
    if v_remaining=0 then delete from public.trash_batches where id=v_item.batch_id;
    else update public.trash_batches set item_count=v_remaining where id=v_item.batch_id; end if;
  end if;
end $$;

revoke all on function ws_private.trash_capture(regclass,text,uuid[],int) from public,anon,authenticated;
revoke all on function ws_private.trash_restore(regclass,jsonb) from public,anon,authenticated;
revoke all on function public.ws_trash(text,uuid) from public,anon;
grant execute on function public.ws_trash(text,uuid) to authenticated;
revoke all on function public.restore_trash_item(uuid) from public,anon;
revoke all on function public.delete_trash_item(uuid) from public,anon;
grant execute on function public.restore_trash_item(uuid) to authenticated;
grant execute on function public.delete_trash_item(uuid) to authenticated,service_role;
