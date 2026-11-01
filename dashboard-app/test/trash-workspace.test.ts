import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('workspace Trash: delete snapshots, restore brings back children and links, purge and isolation',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users values('${uid}'),('${other}');`);
 await db.exec(`create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$`);
 for(const n of ['schema.sql','project-collaboration.sql','trash.sql','publication-notes.sql','workspace-extension.sql','finance-accounts.sql','emi-statements-habit-carry.sql','card-spending-habit-periods-reminders.sql','agenda-recurring-followups.sql','emi-schedule.sql','friend-spending.sql','resumes.sql']){
  try{await db.exec(sql(n))}catch(e){throw new Error(n+': '+(e as Error).message)}
 }
 const trash=sql('trash-workspace.sql');
 try{await db.exec(trash);await db.exec(trash)}catch(e){throw new Error('trash-workspace: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict do nothing`);
 await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false);set role authenticated;`);
 const one=async(q:string,p:any[]=[])=>(await db.query<any>(q,p)).rows[0];
 const count=async(t:string)=>(await one(`select count(*)::int n from ${t}`)).n;

 // Meeting with action items, a note that links to a paper that is trashed (link must come back).
 const paper=(await one(`insert into ws_papers(title) values('STAT3 paper') returning id`)).id;
 const note=(await one(`insert into ws_notes(title,paper_id) values('Reading notes','${paper}') returning id`)).id;
 const meeting=(await one(`insert into ws_meetings(title,starts_at) values('Supervisor','2026-11-02T10:00:00Z') returning id`)).id;
 await db.exec(`insert into ws_meeting_action_items(meeting_id,text) values('${meeting}','Send draft'),('${meeting}','Book room')`);

 // 1. Trash a meeting: live rows gone (children cascade), one Trash entry with a 30-day purge date.
 const t1=await one(`select ws_trash('meetings','${meeting}') as id`);
 assert.equal(await count('ws_meetings'),0);assert.equal(await count('ws_meeting_action_items'),0);
 let item=await one(`select * from trash_items where id='${t1.id}'`);
 assert.equal(item.item_type,'meeting');assert.equal(item.title,'Supervisor');assert.equal(item.source_table,'ws_meetings');
 const days=Math.round((new Date(item.purge_at).getTime()-new Date(item.deleted_at).getTime())/86400000);
 assert.equal(days,30);

 // 2. Restore: meeting and both action items return with the same ids.
 await db.exec(`select restore_trash_item('${t1.id}')`);
 assert.equal(await count('ws_meetings'),1);assert.equal(await count('ws_meeting_action_items'),2);
 assert.equal(await count('trash_items'),0);
 assert.equal((await one(`select id from ws_meetings`)).id,meeting);

 // 3. Trashing a paper clears the note's link; restoring puts the link back.
 const t2=await one(`select ws_trash('papers','${paper}') as id`);
 assert.equal((await one(`select paper_id from ws_notes where id='${note}'`)).paper_id,null);
 await db.exec(`select restore_trash_item('${t2.id}')`);
 assert.equal((await one(`select paper_id from ws_notes where id='${note}'`)).paper_id,paper);

 // 4. Loans: payments cascade and come back; the title is readable.
 const contact=(await one(`insert into ws_contacts(name) values('Bank') returning id`)).id;
 const loan=(await one(`insert into ws_loans(contact_id,direction,amount) values('${contact}','borrowed',1000) returning id`)).id;
 await db.exec(`insert into ws_loan_payments(loan_id,amount) values('${loan}',100),('${loan}',200)`);
 const t3=await one(`select ws_trash('loans','${loan}') as id`);
 assert.match((await one(`select title from trash_items where id='${t3.id}'`)).title,/^Bank — 1000(\.00)? INR$/);
 assert.equal(await count('ws_loan_payments'),0);
 await db.exec(`select restore_trash_item('${t3.id}')`);
 assert.equal(await count('ws_loan_payments'),2);

 // 5. Restore fails with a clear message when what it pointed at is gone: loan trashed, then contact deleted.
 const t4=await one(`select ws_trash('loans','${loan}') as id`);
 await db.exec(`delete from ws_contacts where id='${contact}'`);
 await assert.rejects(db.exec(`select restore_trash_item('${t4.id}')`),/Cannot restore/);
 assert.equal(await count('trash_items'),1); // still recoverable data, nothing lost

 // 6. Not purged early; purged (snapshot dropped) once purge_at passes; nothing is re-created.
 await db.exec(`reset role;update trash_items set purge_at=now()+interval '1 day';set role authenticated`);
 assert.equal((await one(`select purge_expired_trash() as n`)).n,0);assert.equal(await count('trash_items'),1);
 await db.exec(`reset role;update trash_items set purge_at=now()-interval '1 minute';set role authenticated`);
 assert.equal((await one(`select purge_expired_trash() as n`)).n,1);
 assert.equal(await count('trash_items'),0);assert.equal(await count('ws_loans'),0);

 // 7. Manual permanent delete of a workspace item; resumes work; unknown tables and other users are refused.
 const resume=(await one(`insert into ws_resumes(title,data) values('CV','{}') returning id`)).id;
 const t5=await one(`select ws_trash('resumes','${resume}') as id`);
 assert.equal(await count('ws_resumes'),0);
 await db.exec(`select delete_trash_item('${t5.id}')`);assert.equal(await count('trash_items'),0);assert.equal(await count('ws_resumes'),0);
 await assert.rejects(db.exec(`select ws_trash('profiles','${uid}')`),/not trash-enabled/);
 await db.exec(`reset role;insert into ws_notes(user_id,title) values('${other}','Not yours');set role authenticated`);
 const foreign=(await db.query<any>(`select id from ws_notes where title='Not yours'`)).rows;
 assert.equal(foreign.length,0); // RLS hides it
 await db.exec(`reset role`);
 const foreignId=(await one(`select id from ws_notes where title='Not yours'`)).id;
 await db.exec(`set role authenticated`);
 await assert.rejects(db.exec(`select ws_trash('notes','${foreignId}')`),/not found or deletion is not permitted/);
 // Tasks still go through the original soft-delete path.
 const task=(await one(`insert into ws_tasks(title) values('A task') returning id`)).id;
 await db.exec(`select ws_trash('tasks','${task}')`);
 assert.equal((await one(`select source_table from trash_items`)).source_table,'tasks');
 assert.equal(await count('ws_tasks'),0);
 }finally{await db.close()}
});
