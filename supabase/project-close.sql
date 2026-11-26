-- The paper a project produced. Closing a project is the existing "Completed" phase
-- (ws_status = 'completed', completed_on = the day it was closed); this adds the link to
-- the publication that came out of it. Rerunnable. Run after cross-links.sql.

-- Deferred, like the links in cross-links.sql, so a backup restores in any table order
-- (projects come back before publications).
alter table public.projects add column if not exists output_publication_id uuid
  references public.publications(id) on delete set null deferrable initially deferred;
create index if not exists projects_output_publication_idx on public.projects(output_publication_id) where output_publication_id is not null;

-- The output publication must be one of your own (skipped while a backup is restored).
drop trigger if exists project_output_publication on public.projects;
create trigger project_output_publication before insert or update of output_publication_id, user_id on public.projects
  for each row execute function ws_private.check_owned_link('output_publication_id', 'publications');
