-- Cross-links between sections, so related things can be reached from either side.
-- Rerunnable. Run after website.sql.
--
-- New foreign keys are deferred, like ws_experiments.repeat_of, so a backup can be
-- restored in any table order.

-- An experiment can feed a thesis chapter; a task or a note can belong to an experiment.
alter table public.ws_experiments add column if not exists chapter_id uuid
  references public.ws_thesis_chapters(id) on delete set null deferrable initially deferred;
alter table public.tasks add column if not exists experiment_id uuid
  references public.ws_experiments(id) on delete set null deferrable initially deferred;
alter table public.ws_notes add column if not exists experiment_id uuid
  references public.ws_experiments(id) on delete set null deferrable initially deferred;
-- Meeting preparation notes can name their meeting.
alter table public.ws_notes add column if not exists meeting_id uuid
  references public.ws_meetings(id) on delete set null deferrable initially deferred;
-- A submission deadline can name the manuscript it is for.
alter table public.ws_deadlines add column if not exists publication_id uuid
  references public.publications(id) on delete set null deferrable initially deferred;
-- A reading-list item can point at its entry in the paper library.
alter table public.reads add column if not exists paper_id uuid
  references public.ws_papers(id) on delete set null deferrable initially deferred;
-- A contact (meetings, loans) can be the same person as someone in the project people directory.
alter table public.ws_contacts add column if not exists person_id uuid
  references public.people(id) on delete set null deferrable initially deferred;
-- Which resume went out with an application.
alter table public.job_applications add column if not exists resume_id uuid
  references public.ws_resumes(id) on delete set null deferrable initially deferred;

create index if not exists ws_experiments_chapter_idx on public.ws_experiments(chapter_id) where chapter_id is not null;
create index if not exists tasks_experiment_idx on public.tasks(experiment_id) where experiment_id is not null;
create index if not exists ws_notes_experiment_idx on public.ws_notes(experiment_id) where experiment_id is not null;
create index if not exists ws_notes_meeting_idx on public.ws_notes(meeting_id) where meeting_id is not null;
create index if not exists ws_deadlines_publication_idx on public.ws_deadlines(publication_id) where publication_id is not null;
create index if not exists reads_paper_idx on public.reads(paper_id) where paper_id is not null;
create index if not exists ws_contacts_person_idx on public.ws_contacts(person_id) where person_id is not null;
create index if not exists job_applications_resume_idx on public.job_applications(resume_id) where resume_id is not null;

-- Agenda, calendar feed and Telegram: thesis chapter due dates, the thesis submission date
-- and goal due dates join the existing sources.
create or replace function ws_private.agenda_rows(p_user uuid, p_from date, p_to date)
returns table(kind text, ref_id uuid, title text, day date, at timestamptz, detail text, path text, urgent boolean)
language sql stable security definer set search_path = '' as $$
 with s as (select coalesce((select st.timezone from public.ws_settings st where st.user_id = p_user), 'Asia/Kolkata') as tz),
 loans as (
  select l.*, coalesce(l.account_name, c.name, 'Loan') as label,
         coalesce((select sum(p.amount) from public.ws_loan_payments p where p.loan_id = l.id), 0) as paid,
         coalesce((select sum(case when t.kind = 'expense' then t.amount when t.kind = 'income' then -t.amount else 0 end) from public.ws_transactions t where t.loan_id = l.id), 0) as charged
    from public.ws_loans l left join public.ws_contacts c on c.id = l.contact_id
   where l.user_id = p_user and l.direction = 'borrowed'
 )
 select 'task', t.id, t.title, (t.due_at at time zone s.tz)::date, t.due_at, t.priority || ' priority', 'tools/tasks', t.priority = 'High'
   from public.tasks t, s
  where t.user_id = p_user and t.deleted_at is null and t.status <> 'Done' and not coalesce(t.cancelled, false)
    and t.due_at is not null and (t.due_at at time zone s.tz)::date between p_from and p_to
 union all
 select 'deadline', d.id, d.title, d.due_date, case when d.due_time is not null then (d.due_date + d.due_time) at time zone s.tz end,
        replace(d.category, '_', ' '), 'tools/deadlines/' || d.id, d.priority in ('high', 'urgent')
   from public.ws_deadlines d, s
  where d.user_id = p_user and d.status in ('upcoming', 'in_progress') and d.due_date between p_from and p_to
 union all
 select 'meeting', m.id, m.title, (m.starts_at at time zone s.tz)::date, m.starts_at, m.location, 'tools/meetings/' || m.id, false
   from public.ws_meetings m, s
  where m.user_id = p_user and m.archived_at is null and (m.starts_at at time zone s.tz)::date between p_from and p_to
 union all
 select 'publication', p.id, p.title, (p.due_at at time zone s.tz)::date, p.due_at, p.stage::text || coalesce(' · ' || p.next_action, ''), 'publication/' || p.id, false
   from public.publications p, s
  where p.user_id = p_user and p.deleted_at is null and p.stage not in ('Published', 'Rejected')
    and p.due_at is not null and (p.due_at at time zone s.tz)::date between p_from and p_to
 union all
 select 'opportunity', o.id, o.role || coalesce(' · ' || o.organization, ''), (o.deadline at time zone s.tz)::date, o.deadline, 'Application deadline', 'opportunities', true
   from public.opportunities o, s
  where o.user_id = p_user and o.deleted_at is null and o.status in ('Shortlisted', 'Tracked')
    and o.deadline is not null and (o.deadline at time zone s.tz)::date between p_from and p_to
 union all
 select 'emi', l.id, 'EMI · ' || l.label, e.d, null::timestamptz,
        ws_private.money(least((e.i + 1) * l.emi_amount, l.amount + l.charged) - greatest(l.paid, e.i * l.emi_amount), l.currency), 'tools/loans', e.d < (now() at time zone s.tz)::date
   from loans l cross join s
   cross join lateral (
    select i, (l.emi_first_on + make_interval(months => i))::date as d
      from generate_series(floor(l.paid / l.emi_amount)::int, coalesce(l.emi_tenure, floor(l.paid / l.emi_amount)::int + 36) - 1) i
   ) e
  where l.emi_schedule is null and l.emi_amount is not null and l.emi_first_on is not null and l.amount + l.charged - l.paid > 0
    and e.i * l.emi_amount < l.amount + l.charged and e.d between p_from and p_to
 union all
 select 'emi', l.id, 'EMI · ' || l.label, r.d, null::timestamptz,
        ws_private.money(least(r.upto, l.amount + l.charged) - greatest(l.paid, r.upto - r.amount), l.currency), 'tools/loans', r.d < (now() at time zone s.tz)::date
   from loans l cross join s
   cross join lateral ws_private.emi_schedule_rows(l.emi_schedule) r
  where l.emi_schedule is not null and r.upto > l.paid and r.upto - r.amount < l.amount + l.charged and r.d between p_from and p_to
 union all
 select 'card', l.id, 'Card bill · ' || l.label, l.statement_due_on, null::timestamptz,
        ws_private.money(l.statement_amount - x.since, l.currency) || ' left on the statement', 'tools/loans', l.statement_due_on < (now() at time zone s.tz)::date
   from loans l cross join s
   cross join lateral (select coalesce((select sum(p.amount) from public.ws_loan_payments p where p.loan_id = l.id and p.paid_on >= l.statement_on), 0) as since) x
  where l.account_type = 'credit_card' and l.statement_amount is not null and l.statement_on is not null and l.statement_due_on is not null
    and l.statement_amount - x.since > 0 and l.statement_due_on between p_from and p_to
 union all
 select 'recurring', r.id, r.description, r.next_on, null::timestamptz, (case when r.kind = 'income' then '+' else '' end) || ws_private.money(r.amount, r.currency), 'tools/budget', false
   from public.ws_recurring r
  where r.user_id = p_user and not r.paused and r.next_on between p_from and p_to and (r.ends_on is null or r.next_on <= r.ends_on)
 union all
 select 'thesis', c.id, 'Chapter · ' || c.title, c.due_on, null::timestamptz, replace(c.status, '_', ' '), 'tools/thesis', false
   from public.ws_thesis_chapters c
  where c.user_id = p_user and c.status <> 'final' and c.due_on between p_from and p_to
 union all
 select 'thesis', th.id, 'Thesis submission' || coalesce(' · ' || nullif(th.title, ''), ''), th.submission_on, null::timestamptz, 'Submission date', 'tools/thesis', true
   from public.ws_thesis th
  where th.user_id = p_user and th.submission_on between p_from and p_to
 union all
 select 'goal', g.id, g.title, g.due_on, null::timestamptz, g.area || ' goal', 'tools/goals', false
   from public.ws_goals g
  where g.user_id = p_user and g.status = 'active' and g.due_on between p_from and p_to
$$;
revoke all on function ws_private.agenda_rows(uuid, date, date) from public, anon, authenticated;

-- Search and backup read the highlights saved by the browser clipper (the clippings table
-- shown on the Clippings page) where they used to read the unused inbox_items table.
-- Both functions are patched in place so the rest of their current definition is kept.
do $$
declare def text;
begin
 if to_regclass('public.clippings') is null then return; end if;

 select pg_get_functiondef('public.ws_search_workspace(text, integer)'::regprocedure) into def;
 if position('from public.inbox_items' in def) > 0 then
  def := replace(def,
   $old$select 'clipping', id, left(body,100), body, null, created_at, array[]::text[] from public.inbox_items$old$,
   $new$select 'clipping', id, coalesce(nullif(title, ''), original_url, 'Clipping'), concat_ws(' ', anchor->>'exact', notes, doi, pmid, original_url), null, updated_at, coalesce(tags, array[]::text[]) from public.clippings$new$);
  if position('from public.inbox_items' in def) > 0 then raise exception 'ws_search_workspace: clipping source not found in its expected form'; end if;
  execute def;
 end if;

 select pg_get_functiondef('public.ws_backup_data()'::regprocedure) into def;
 if position('''clippings''' in def) = 0 then
  execute replace(def, $old$'inbox_items','reads'$old$, $new$'inbox_items','clippings','reads'$new$);
 end if;
 if position('''ws_resumes''' in def) = 0 then
  select pg_get_functiondef('public.ws_backup_data()'::regprocedure) into def;
  execute replace(def, $old$'documents','job_applications'$old$, $new$'documents','ws_resumes','job_applications'$new$);
 end if;

 select pg_get_functiondef('public.ws_restore_data(uuid, jsonb)'::regprocedure) into def;
 if position('''clippings''' in def) = 0 then
  execute replace(def, $old$'inbox_items','reads'$old$, $new$'inbox_items','clippings','reads'$new$);
 end if;
 if position('''ws_resumes''' in def) = 0 then
  select pg_get_functiondef('public.ws_restore_data(uuid, jsonb)'::regprocedure) into def;
  execute replace(def, $old$'documents','job_applications'$old$, $new$'documents','ws_resumes','job_applications'$new$);
 end if;
end $$;
