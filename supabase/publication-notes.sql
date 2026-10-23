-- Paper notes are private UTF-8 Markdown objects, linked by publication UUID.
-- Re-runnable setup; existing notes are never replaced by this script.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('paper-notes','paper-notes',false,2097152,array['text/markdown','text/plain'])
on conflict(id) do nothing;

drop policy if exists "paper notes read" on storage.objects;
create policy "paper notes read" on storage.objects for select to authenticated
using (bucket_id = 'paper-notes'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.md$'
  and exists (select 1 from public.publications p
    where p.id::text = (storage.foldername(name))[1]
      and p.deleted_at is null
      and (p.user_id = (select auth.uid()) or public.can_view_project(p.project_id))))
;

drop policy if exists "paper notes insert" on storage.objects;
create policy "paper notes insert" on storage.objects for insert to authenticated
with check (bucket_id = 'paper-notes'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.md$'
  and exists (select 1 from public.publications p
    where p.id::text = (storage.foldername(name))[1]
      and p.deleted_at is null
      and (p.user_id = (select auth.uid()) or public.can_edit_project(p.project_id))))
;

drop policy if exists "paper notes update" on storage.objects;
create policy "paper notes update" on storage.objects for update to authenticated
using (bucket_id = 'paper-notes'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.md$'
  and exists (select 1 from public.publications p
    where p.id::text = (storage.foldername(name))[1]
      and p.deleted_at is null
      and (p.user_id = (select auth.uid()) or public.can_edit_project(p.project_id))))
with check (bucket_id = 'paper-notes'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.md$'
  and exists (select 1 from public.publications p
    where p.id::text = (storage.foldername(name))[1]
      and p.deleted_at is null
      and (p.user_id = (select auth.uid()) or public.can_edit_project(p.project_id))))
;

drop policy if exists "paper notes delete" on storage.objects;
create policy "paper notes delete" on storage.objects for delete to authenticated
using (bucket_id = 'paper-notes'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.md$'
  and exists (select 1 from public.publications p
    where p.id::text = (storage.foldername(name))[1]
      and p.deleted_at is null
      and (p.user_id = (select auth.uid()))))
;
