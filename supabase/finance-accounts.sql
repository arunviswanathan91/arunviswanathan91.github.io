-- Additional debt account details. Existing personal loans are unchanged.
begin;
alter table public.ws_loans add column if not exists account_type text not null default 'personal' check(account_type in ('personal','bank','credit_card'));
alter table public.ws_loans add column if not exists account_name text;
alter table public.ws_loans add column if not exists card_last4 text check(card_last4 ~ '^[0-9]{4}$');
alter table public.ws_loans add column if not exists credit_limit numeric(14,2) check(credit_limit >= 0);
alter table public.ws_loans add column if not exists minimum_due numeric(14,2) check(minimum_due >= 0);
create or replace function public.ws_restore_data(owner_id uuid, payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t text; r jsonb; original jsonb; cols text; updates text; keys text; n int; result jsonb := '{}'; fresh boolean;
begin
 if auth.uid() is null or owner_id <> auth.uid() then raise exception 'Restore requires the original account'; end if;
 perform set_config('workspace.restoring','on',true);
 foreach t in array array['people','projects','project_people','project_stages','project_links','project_fields','publications','publication_nodes','publication_stage_events','tags','documents','job_applications','inbox_items','reads','ws_settings','ws_contacts','ws_papers','ws_project_papers','ws_notes','ws_meetings','ws_meeting_projects','ws_meeting_participants','ws_deadlines','tasks','reminders','item_tags','ws_meeting_action_items','ws_loans','ws_loan_payments','ws_budget_categories','ws_transactions','ws_monthly_budgets','ws_habits','ws_habit_checkins','ws_attachments'] loop
  n := 0;
  -- Immutable publication history is exported for reference; existing history is retained.
  if t='publication_stage_events' then result:=result||jsonb_build_object(t,0); continue; end if;
  select string_agg(quote_ident(a.attname),',' order by a.attnum),
         string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum)
    into cols,updates from pg_catalog.pg_attribute a
    where a.attrelid=('public.'||t)::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated='';
  select string_agg(quote_ident(a.attname),',' order by k.ord) into keys
    from pg_catalog.pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ord)
    join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
    where i.indrelid=('public.'||t)::regclass and i.indisprimary;
  for original in select value from jsonb_array_elements(coalesce(payload->t,'[]')) loop
   r := original;
   if t='ws_loans' then r:=jsonb_build_object('account_type','personal')||r; end if;
   if t <> 'item_tags' and (r->>'user_id') is distinct from auth.uid()::text then raise exception 'Backup contains a different owner'; end if;
   if t='tasks' then r:=r || '{"previous_id":null,"recurrence":null}'::jsonb; end if;
   fresh := false;
   if t='projects' then select not exists(select 1 from public.projects where id=(r->>'id')::uuid) into fresh; end if;
   execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(%s) %s',
     t,cols,cols,t,keys,case when t='publication_stage_events' then 'do nothing' else 'do update set '||updates end) using r;
   -- The original app seeds starter columns on insert; the backup supplies their stable ids.
   if fresh then delete from public.project_stages where project_id=(r->>'id')::uuid; end if;
   n:=n+1;
  end loop;
  result:=result||jsonb_build_object(t,n);
 end loop;
 for r in select value from jsonb_array_elements(coalesce(payload->'tasks','[]')) loop
  update public.tasks set previous_id=(r->>'previous_id')::uuid, recurrence=nullif(r->'recurrence','null'::jsonb)
    where id=(r->>'id')::uuid and user_id=auth.uid();
 end loop;
 perform set_config('workspace.restoring','off',true);
 return result;
end $$;

notify pgrst,'reload schema';
commit;
