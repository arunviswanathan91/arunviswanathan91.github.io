-- Recoverable, all-at-once reset for Opportunity discovery.
-- Apply after schema.sql and trash.sql. Safe to re-run.

create or replace function public.restart_opportunity_discovery()
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_deleted timestamptz:=clock_timestamp();
  v_days integer;
  v_batch uuid;
  v_items integer:=0;
  v_raw integer:=0;
  v_sources integer:=0;
  v_salaries integer:=0;
  v_runs integer:=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  -- Serialize reset requests; the active-run check below prevents resetting
  -- while a known discovery worker is still writing results.
  perform pg_advisory_xact_lock(hashtext(v_user::text),hashtext('opportunity-discovery-reset'));
  if exists (
    select 1 from public.discovery_runs
    where user_id=v_user and status in ('queued','running') and expires_at>clock_timestamp()
  ) then
    raise exception 'A discovery search is still running. Wait for it to finish, then restart discovery.';
  end if;

  select count(*) into v_items from public.opportunities
    where user_id=v_user and deleted_at is null;
  select coalesce(trash_retention_days,30) into v_days from public.profiles where id=v_user;
  v_days:=coalesce(v_days,30);

  if v_items>0 then
    insert into public.trash_batches(user_id,batch_type,title,item_count,metadata,deleted_at,purge_at)
    values(v_user,'opportunity_restart','Opportunity discovery restart',v_items,
      jsonb_build_object('kept',jsonb_build_array('search profile','ranking feedback','AI cache','quota ledger')),
      v_deleted,v_deleted+make_interval(days=>v_days))
    returning id into v_batch;

    insert into public.trash_items
      (user_id,source_table,record_id,item_type,title,snapshot,batch_id,deleted_at,purge_at)
    select v_user,'opportunities',o.id,'opportunity',coalesce(nullif(o.role,''),'Opportunity'),
      to_jsonb(o),v_batch,v_deleted,v_deleted+make_interval(days=>v_days)
    from public.opportunities o
    where o.user_id=v_user and o.deleted_at is null
    on conflict(source_table,record_id) do update set
      user_id=excluded.user_id,item_type=excluded.item_type,title=excluded.title,
      snapshot=excluded.snapshot,batch_id=excluded.batch_id,
      deleted_at=excluded.deleted_at,purge_at=excluded.purge_at;

    update public.opportunities set deleted_at=v_deleted
      where user_id=v_user and deleted_at is null;
  end if;

  -- These rows are discovery machinery, not user decisions. Clearing them is
  -- what allows unchanged listings to be fetched and evaluated again.
  delete from public.opportunity_sources where user_id=v_user;
  get diagnostics v_sources=row_count;
  delete from public.opportunity_salaries where user_id=v_user;
  get diagnostics v_salaries=row_count;
  delete from public.discovery_raw_items where user_id=v_user;
  get diagnostics v_raw=row_count;
  delete from public.discovery_runs where user_id=v_user;
  get diagnostics v_runs=row_count;
  update public.discovery_sources set
    cursor='{}'::jsonb,last_success_at=null,last_error=null,
    consecutive_failures=0,disabled_until=null,updated_at=clock_timestamp()
    where user_id=v_user;

  return jsonb_build_object(
    'batch_id',v_batch,'archived',v_items,'raw_items_cleared',v_raw,
    'source_links_cleared',v_sources,'salary_rows_cleared',v_salaries,
    'runs_cleared',v_runs
  );
end;
$$;

-- Pruning must never hard-delete a recoverable Opportunity held in Trash.
create or replace function public.discovery_prune(p_user_id uuid,p_keep integer default 200)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_expired int;v_deleted int;v_capped int;
begin
  update public.opportunities set status='Expired'
   where user_id=p_user_id and deleted_at is null and status='New'
     and deadline is not null and deadline<now();
  get diagnostics v_expired=row_count;

  delete from public.opportunities o
   where o.user_id=p_user_id and o.deleted_at is null
     and o.status in ('New','Expired') and o.job_application_id is null
     and not exists (select 1 from public.opportunity_feedback f where f.opportunity_id=o.id)
     and not exists (select 1 from public.item_tags t where t.entity_type='opportunity' and t.entity_id=o.id)
     and (o.last_seen_at<now()-interval '60 days'
          or (o.deadline is not null and o.deadline<now()-interval '14 days'));
  get diagnostics v_deleted=row_count;

  delete from public.opportunities where id in (
    select id from public.opportunities
     where user_id=p_user_id and deleted_at is null and status='New' and job_application_id is null
     order by match_score desc,last_seen_at desc offset p_keep);
  get diagnostics v_capped=row_count;

  delete from public.discovery_raw_items where user_id=p_user_id and fetched_at<now()-interval '30 days';
  delete from public.discovery_runs where user_id=p_user_id and created_at<now()-interval '90 days';
  delete from public.discovery_llm_cache where user_id=p_user_id and created_at<now()-interval '180 days';
  return jsonb_build_object('expired',v_expired,'deleted',v_deleted,'capped',v_capped);
end $$;

revoke all on function public.restart_opportunity_discovery() from public,anon;
revoke all on function public.discovery_prune(uuid,integer) from public,anon;
grant execute on function public.restart_opportunity_discovery() to authenticated;
grant execute on function public.discovery_prune(uuid,integer) to service_role;
