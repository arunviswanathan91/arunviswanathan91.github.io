-- The submission trail of a manuscript: each journal it was sent to, in order, and what
-- happened there (desk rejection, review, revision, acceptance, rejection after review).
-- The publication's own stage and venue follow the latest submission (set by the app).
-- Rerunnable. Run after publication-published.sql.

create table if not exists public.ws_publication_submissions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Deferred so a backup can be restored in any table order.
  publication_id uuid not null references public.publications(id) on delete cascade deferrable initially deferred,
  journal        text not null check (length(trim(journal)) > 0),
  position       int not null default 0,
  status         text not null default 'submitted'
                 check (status in ('submitted','desk_rejected','under_review','revision_requested','resubmitted','rejected','accepted','withdrawn')),
  submitted_on   date not null default current_date,
  -- The day of the final decision at this journal (desk rejection, rejection, acceptance, withdrawal).
  decided_on     date,
  -- [{status, on}]: each step at this journal with its date, oldest first.
  history        jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  manuscript_ref text not null default '',
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (decided_on is null or decided_on >= submitted_on)
);
create index if not exists publication_submissions_paper_idx on public.ws_publication_submissions (publication_id, position, submitted_on);
select ws_private.secure_table('public.ws_publication_submissions');
drop trigger if exists publication_submissions_touch on public.ws_publication_submissions;
create trigger publication_submissions_touch before update on public.ws_publication_submissions
  for each row execute function ws_private.touch_updated_at();
revoke truncate, references, trigger on public.ws_publication_submissions from authenticated, anon, public;

-- A submission belongs to one of your own publications (skipped while a backup is restored).
drop trigger if exists publication_submission_owner on public.ws_publication_submissions;
create trigger publication_submission_owner before insert or update of publication_id, user_id on public.ws_publication_submissions
  for each row execute function ws_private.check_owned_link('publication_id', 'publications');

-- Backup and restore carry the trail. Both functions are patched in place, as in cross-links.sql.
do $$
declare def text; fn text;
begin
 foreach fn in array array['public.ws_backup_data()', 'public.ws_restore_data(uuid, jsonb)'] loop
  select pg_get_functiondef(fn::regprocedure) into def;
  if position('''ws_publication_submissions''' in def) = 0 then
   if position($old$'ws_funding_calls','ws_attachments'$old$ in def) = 0 then raise exception '%: table list not found in its expected form', fn; end if;
   execute replace(def, $old$'ws_funding_calls','ws_attachments'$old$, $new$'ws_funding_calls','ws_publication_submissions','ws_attachments'$new$);
  end if;
 end loop;
end $$;
