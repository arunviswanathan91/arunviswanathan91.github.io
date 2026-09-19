-- Additive migration for run-scoped dashboard results and run-bound AI
-- enrichment. Safe to run more than once, after opportunity-search-v2.sql.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'discovery_run_items_opportunity_id_fkey'
       and conrelid = 'public.discovery_run_items'::regclass
  ) then
    alter table public.discovery_run_items
      add constraint discovery_run_items_opportunity_id_fkey
      foreign key (opportunity_id) references public.opportunities(id) on delete set null;
  end if;
end $$;

create index if not exists discovery_run_items_run_opportunity_idx
  on public.discovery_run_items(run_id, opportunity_id)
  where disposition = 'accepted' and opportunity_id is not null;
