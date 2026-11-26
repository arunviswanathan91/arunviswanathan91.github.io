import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('closing a project: the output publication is yours, clears with the paper and survives a restore',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users values('${uid}'),('${other}');`);
 await db.exec(`create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$`);
 for(const n of ['schema.sql','project-collaboration.sql','trash.sql','publication-notes.sql','workspace-extension.sql','finance-accounts.sql','emi-statements-habit-carry.sql','card-spending-habit-periods-reminders.sql','agenda-recurring-followups.sql','emi-schedule.sql','friend-spending.sql','resumes.sql','trash-workspace.sql','savings-accounts.sql','experiments.sql','planning.sql','alerts.sql']){
  try{await db.exec(sql(n))}catch(e){throw new Error(n+': '+(e as Error).message)}
 }
 // The clipper's table is created by the clipper, not by these scripts.
 await db.exec(`create table public.clippings(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),original_url text,title text,anchor jsonb,doi text,pmid text,notes text,tags text[],created_at timestamptz not null default now(),updated_at timestamptz not null default now());alter table public.clippings enable row level security;create policy own on public.clippings for all using(auth.uid()=user_id) with check(auth.uid()=user_id)`);
 await db.exec(sql('cross-links.sql'));
 const mig=sql('project-close.sql');
 try{await db.exec(mig);await db.exec(mig)}catch(e){throw new Error('project-close: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict do nothing`);
 const as=async(who:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${who}',false);set role authenticated;`);
 const one=async(q:string,p:any[]=[])=>(await db.query<any>(q,p)).rows[0];
 const count=async(t:string)=>(await one(`select count(*)::int n from ${t}`)).n;

 await as(other);
 const theirPaper=(await one(`insert into publications(user_id,title) values($1,'Theirs') returning id`,[other])).id;

 await as(uid);
 const project=(await one(`insert into projects(user_id,name) values($1,'Obesity and PDAC') returning id`,[uid])).id;
 const paper=(await one(`insert into publications(user_id,title,project_id) values($1,'STAT3 in obese PDAC',$2) returning id`,[uid,project])).id;
 await assert.rejects(db.query(`update projects set output_publication_id=$1 where id=$2`,[theirPaper,project]),/belong to this account/);
 // Closing is the Completed phase plus the paper that came out of the project.
 await db.query(`update projects set phase='Completed',ws_status='completed',completed_on=current_date,output_publication_id=$1 where id=$2`,[paper,project]);
 assert.equal((await one(`select status from ws_projects where id=$1`,[project])).status,'completed');

 // A restore brings the link back although projects are restored before publications.
 const backup=(await one(`select ws_backup_data() as b`)).b;
 assert.equal(backup.projects[0].output_publication_id,paper);
 await db.query(`update projects set output_publication_id=null where id=$1`,[project]);
 await db.query(`delete from publications where id=$1`,[paper]);
 await db.query(`select ws_restore_data($1,$2)`,[uid,JSON.stringify(backup)]);
 assert.equal((await one(`select output_publication_id as p from projects where id=$1`,[project])).p,paper);

 // Deleting the paper clears the link and keeps the project closed.
 await db.query(`delete from publications where id=$1`,[paper]);
 const after=await one(`select output_publication_id as p,phase from projects where id=$1`,[project]);
 assert.equal(after.p,null);assert.equal(after.phase,'Completed');
 assert.ok(await count('projects')>=1);
 }finally{await db.close()}
});
