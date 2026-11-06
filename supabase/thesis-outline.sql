-- Thesis chapter outlines: sections and subsections with paragraph targets, what to cover,
-- notes and a done toggle, plus figures and tables to prepare (one JSON list per chapter;
-- can be imported from a Word writing plan). Run after alerts.sql. Rerunnable.
begin;

alter table public.ws_thesis_chapters add column if not exists outline jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'thesis_chapters_outline_is_list') then
    alter table public.ws_thesis_chapters add constraint thesis_chapters_outline_is_list check (jsonb_typeof(outline) = 'array');
  end if;
end $$;

commit;
