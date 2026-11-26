import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('cross-links: new links are owned, the agenda gains thesis and goal dates, search and backup read clippings',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users values('${uid}'),('${other}');`);
 await db.exec(`create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$`);
 for(const n of ['schema.sql','project-collaboration.sql','trash.sql','publication-notes.sql','workspace-extension.sql','finance-accounts.sql','emi-statements-habit-carry.sql','card-spending-habit-periods-reminders.sql','agenda-recurring-followups.sql','emi-schedule.sql','friend-spending.sql','resumes.sql','trash-workspace.sql','savings-accounts.sql','experiments.sql','planning.sql','alerts.sql']){
  try{await db.exec(sql(n))}catch(e){throw new Error(n+': '+(e as Error).message)}
 }
 // The clipper's table is created by the clipper, not by these scripts.
 await db.exec(`create table public.clippings(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),original_url text,title text,anchor jsonb,doi text,pmid text,notes text,tags text[],created_at timestamptz not null default now(),updated_at timestamptz not null default now());alter table public.clippings enable row level security;create policy own on public.clippings for all using(auth.uid()=user_id) with check(auth.uid()=user_id)`);
 const mig=sql('cross-links.sql');
 try{await db.exec(mig);await db.exec(mig)}catch(e){throw new Error('cross-links: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict do nothing`);
 const as=async(who:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${who}',false);set role authenticated;`);
 const one=async(q:string,p:any[]=[])=>(await db.query<any>(q,p)).rows[0];
 const count=async(t:string)=>(await one(`select count(*)::int n from ${t}`)).n;

 await as(other);
 const theirChapter=(await one(`insert into ws_thesis_chapters(title) values('Theirs') returning id`)).id;
 const theirExperiment=(await one(`insert into ws_experiments(title) values('Theirs') returning id`)).id;
 await db.exec(`insert into clippings(title,anchor) values('Theirs','{"exact":"somatic mutation theory"}')`);

 await as(uid);
 const ch=(await one(`insert into ws_thesis_chapters(title,due_on,status) values('Results I',current_date+10,'drafting') returning id`)).id;
 await db.exec(`insert into ws_thesis_chapters(title,due_on,status) values('Done chapter',current_date+11,'final')`);
 await db.exec(`insert into ws_thesis(title,submission_on) values('Obesity and PDAC',current_date+20)`);
 await db.exec(`insert into ws_goals(title,due_on) values('Submit paper',current_date+5);insert into ws_goals(title,due_on,status) values('Dropped goal',current_date+6,'dropped')`);

 // An experiment feeds a chapter; tasks and notes hang off the experiment; only your own records link.
 const ex=(await one(`insert into ws_experiments(title,chapter_id) values('Western blot',$1) returning id`,[ch])).id;
 await assert.rejects(db.query(`insert into ws_experiments(title,chapter_id) values('x',$1)`,[theirChapter]),/belong to this account/);
 await db.query(`insert into tasks(user_id,title,experiment_id) values($2,'Order antibody',$1)`,[ex,uid]);
 await assert.rejects(db.query(`insert into tasks(user_id,title,experiment_id) values($2,'x',$1)`,[theirExperiment,uid]),/belong to this account/);
 const meeting=(await one(`insert into ws_meetings(title,starts_at) values('Lab meeting',now()) returning id`)).id;
 await db.query(`insert into ws_notes(title,type,experiment_id,meeting_id) values('Prep','meeting_prep',$1,$2)`,[ex,meeting]);
 await assert.rejects(db.query(`insert into ws_notes(title,experiment_id) values('x',$1)`,[theirExperiment]),/belong to this account/);
 const pub=(await one(`insert into publications(user_id,title) values($1,'Paper 1') returning id`,[uid])).id;
 await db.query(`insert into ws_deadlines(title,category,due_date,publication_id) values('Submit','paper_submission',current_date+3,$1)`,[pub]);
 const paper=(await one(`insert into ws_papers(title) values('A library paper') returning id`)).id;
 await db.query(`insert into reads(user_id,url,paper_id) values($2,'https://example.org/a',$1)`,[paper,uid]);
 const person=(await one(`insert into people(user_id,name) values($1,'Supervisor') returning id`,[uid])).id;
 await db.query(`insert into ws_contacts(name,person_id) values('Supervisor',$1)`,[person]);
 const resume=(await one(`insert into ws_resumes(title) values('Academic CV') returning id`)).id;
 await db.query(`insert into job_applications(user_id,organization,role,resume_id) values($2,'Institute','Postdoc',$1)`,[resume,uid]);

 // Deleting the target clears the link and keeps the row.
 await db.query(`delete from ws_thesis_chapters where id=$1`,[ch]);
 assert.equal((await one(`select chapter_id from ws_experiments where id=$1`,[ex])).chapter_id,null);
 const ch2=(await one(`insert into ws_thesis_chapters(title,due_on,status) values('Results II',current_date+12,'outlining') returning id`)).id;

 // Agenda: open chapters, the submission date and active goals; not final chapters or dropped goals.
 const agenda=(await db.query<any>(`select kind,title,path,urgent from ws_agenda(current_date,current_date+30)`)).rows;
 const titles=agenda.map((r)=>r.title);
 assert.ok(titles.includes('Chapter · Results II'));
 assert.ok(!titles.some((t)=>t.includes('Done chapter')));
 assert.ok(agenda.some((r)=>r.kind==='thesis'&&r.title.startsWith('Thesis submission')&&r.urgent&&r.path==='tools/thesis'));
 assert.ok(agenda.some((r)=>r.kind==='goal'&&r.title==='Submit paper'&&r.path==='tools/goals'));
 assert.ok(!titles.includes('Dropped goal'));
 assert.ok(ch2);

 // Search reads the clipper's highlights, and only your own.
 await db.exec(`insert into clippings(title,original_url,anchor,doi) values('Cancer as a disease of development','https://example.org/p','{"exact":"the somatic mutation hypothesis"}','10.1000/xyz')`);
 const hits=(await db.query<any>(`select kind,title from ws_search_workspace('somatic mutation')`)).rows.filter((r)=>r.kind==='clipping');
 assert.deepEqual(hits.map((r)=>r.title),['Cancer as a disease of development']);

 // Backup carries clippings and resumes, and a restore brings back links in any table order.
 const backup=(await one(`select ws_backup_data() as b`)).b;
 assert.equal(backup.clippings.length,1);
 assert.equal(backup.ws_resumes.length,1);
 assert.equal(backup.tasks[0].experiment_id,ex);
 await db.query(`delete from ws_experiments where id=$1`,[ex]);
 await db.query(`delete from clippings where user_id=$1`,[uid]);
 assert.equal((await one(`select experiment_id from tasks where title='Order antibody'`)).experiment_id,null);
 await db.query(`select ws_restore_data($1,$2)`,[uid,JSON.stringify(backup)]);
 assert.equal((await one(`select experiment_id from tasks where title='Order antibody'`)).experiment_id,ex);
 assert.equal(await count('clippings'),1);
 }finally{await db.close()}
});
