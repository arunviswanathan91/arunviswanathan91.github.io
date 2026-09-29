-- Nudges for an opportunity's own application deadline, not just a tracked
-- job_application's. Deliberately scoped to Shortlisted/Tracked only -- the
-- undifferentiated pile of "New" opportunities is not something the user has
-- actually looked at yet, so reminding on all of them would just be noise.
--
-- Optional: the pipeline works without this (db.syncDeadlineReminders
-- degrades to a no-op if the function is missing, same pattern as
-- institution_facts.sql). Run this once in the Supabase SQL editor, then the
-- existing telegram-reminder-sweep function (which already polls the shared
-- `reminders` table every minute) picks these up automatically -- no changes
-- needed there.

alter table public.reminders add column if not exists opportunity_id uuid references public.opportunities(id) on delete cascade;

create unique index if not exists reminders_opportunity_id_key
  on public.reminders(opportunity_id) where opportunity_id is not null;

create or replace function public.sync_opportunity_deadline_reminders(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_removed int; v_upserted int;
begin
  -- An opportunity that moved out of Shortlisted/Tracked, lost its deadline,
  -- or is no longer inside the reminder window no longer deserves a pending
  -- nudge. Never touches a reminder that already fired (notified_at set) or
  -- was otherwise resolved (done=true) -- those are history, not to be undone.
  delete from public.reminders r
   using public.opportunities o
   where r.opportunity_id = o.id and r.user_id = p_user_id
     and r.notified_at is null and r.done = false
     and (o.status not in ('Shortlisted','Tracked') or o.deleted_at is not null
          or o.deadline is null or o.deadline < now() or o.deadline > now() + interval '4 days');
  get diagnostics v_removed = row_count;

  insert into public.reminders (user_id, title, body, remind_at, done, notified_at, opportunity_id)
  select o.user_id,
         'Deadline soon: ' || o.role || ' at ' || coalesce(o.organization, 'Unknown organisation'),
         'Closes ' || to_char(o.deadline at time zone 'UTC', 'DD Mon YYYY'),
         greatest(now(), o.deadline - interval '3 days'),
         false, null, o.id
    from public.opportunities o
   where o.user_id = p_user_id and o.deleted_at is null
     and o.status in ('Shortlisted','Tracked')
     and o.deadline is not null and o.deadline > now() and o.deadline <= now() + interval '4 days'
  on conflict (opportunity_id) where opportunity_id is not null do update
   set title = excluded.title, body = excluded.body, remind_at = excluded.remind_at
   where public.reminders.notified_at is null and public.reminders.done = false;
  get diagnostics v_upserted = row_count;

  return jsonb_build_object('removed', v_removed, 'upserted', v_upserted);
end $$;

revoke all on function public.sync_opportunity_deadline_reminders(uuid) from public, anon;
grant execute on function public.sync_opportunity_deadline_reminders(uuid) to service_role;
