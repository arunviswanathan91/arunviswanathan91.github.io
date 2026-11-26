-- The published version of a manuscript: the record fetched from its final DOI
-- ({title, authors[], journal, year, doi, pmid, url, fetched_at}). The working title, venue
-- and stage history of the manuscript are kept beside it. Rerunnable. Run after project-close.sql.
alter table public.publications add column if not exists published jsonb;
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'publications_published_object') then
  alter table public.publications add constraint publications_published_object
   check (published is null or jsonb_typeof(published) = 'object');
 end if;
end $$;
