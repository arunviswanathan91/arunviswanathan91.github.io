import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
test('workspace integration preserves existing records and enforces isolation',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users values('${uid}'),('${other}');`);
 for(const name of ['schema.sql','project-collaboration.sql','trash.sql','publication-notes.sql']){
  try{await db.exec(readFileSync(new URL(name,root),'utf8').replace('create extension if not exists pgcrypto;',''));}catch(e){throw new Error(name+': '+(e as Error).message)}
 }
 // Existing Supabase default grants, absent in a bare Postgres fixture.
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','Asia/Kolkata');insert into projects(id,user_id,name) values('33333333-3333-3333-3333-333333333333','${uid}','Existing research');insert into tasks(id,user_id,title,status,priority,due_at,notes) values('44444444-4444-4444-4444-444444444444','${uid}','Existing task','Review','High','2026-10-27T09:30:00Z','Preserve me');`);
 const migration=readFileSync(new URL('workspace-extension.sql',root),'utf8');
 try{await db.exec(migration);await db.exec(migration)}catch(e){throw new Error('extension: '+(e as Error).message)}
 await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false);set role authenticated;`);
 assert.equal((await db.query<any>('select title from ws_projects')).rows[0].title,'Existing research');
 await db.exec(`update ws_tasks set title='Changed title' where id='44444444-4444-4444-4444-444444444444'`);
 let row=(await db.query<any>(`select * from tasks where id='44444444-4444-4444-4444-444444444444'`)).rows[0];
 assert.equal(row.status,'Review');assert.equal(new Date(row.due_at).toISOString(),'2026-10-27T09:30:00.000Z');assert.equal(row.notes,'Preserve me');
 const task=(await db.query<any>(`insert into ws_tasks(title,project_id,due_date,recurrence,tags) values('Repeat','33333333-3333-3333-3333-333333333333','2026-10-27','{"freq":"daily","interval":1}',array['testing']) returning id`)).rows[0].id;
 await db.exec(`update ws_tasks set status='done' where id='${task}'`);
 assert.equal((await db.query<any>(`select status from tasks where id='${task}'`)).rows[0].status,'Done');
 assert.equal((await db.query<any>(`select count(*)::int as n from tasks where previous_id='${task}'`)).rows[0].n,1);
 await db.exec(`update ws_tasks set status='todo' where id='${task}';update ws_tasks set status='done' where id='${task}'`);
 assert.equal((await db.query<any>(`select count(*)::int as n from tasks where previous_id='${task}'`)).rows[0].n,1);
 const paper=(await db.query<any>(`insert into ws_papers(title,doi) values('STAT3 paper','10.1234/stat3') returning id`)).rows[0].id;
 assert.ok((await db.query<any>(`select * from ws_search_workspace('STAT3')`)).rows.length);
 const backup=(await db.query<any>('select ws_backup_data() as data')).rows[0].data;
 assert.equal(backup.tasks.length,3);
 assert.equal(backup.ws_papers.length,1);
 await db.exec(`update ws_papers set title='Edited' where id='${paper}'`);
 await db.query('select ws_restore_data($1,$2)',[uid,JSON.stringify(backup)]);
 assert.equal((await db.query<any>(`select title from ws_papers where id='${paper}'`)).rows[0].title,'STAT3 paper');
 assert.equal((await db.query<any>('select count(*)::int n from tasks')).rows[0].n,3);
 assert.equal((await db.query<any>(`select status from tasks where id='44444444-4444-4444-4444-444444444444'`)).rows[0].status,'Review');
 const invalid=structuredClone(backup);invalid.ws_papers[0].user_id=other;invalid.projects[0].name='Must roll back';
 await assert.rejects(db.query('select ws_restore_data($1,$2)',[uid,JSON.stringify(invalid)]),/different owner/);
 assert.equal((await db.query<any>('select name from projects')).rows[0].name,'Existing research');
 await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
 assert.equal((await db.query('select * from ws_papers')).rows.length,0);
 await assert.rejects(db.exec(`insert into ws_notes(title,paper_id) values('Forbidden','${paper}')`),/Linked record/);
 await db.exec(`reset role;set role anon;`);
 await assert.rejects(db.exec('select * from ws_papers'),/permission denied/);
 }finally{await db.close()}
});
