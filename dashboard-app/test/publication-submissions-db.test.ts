import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('submission trail: yours only, ordered per paper, checked, and carried by backup and restore',async()=>{
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
 await db.exec(sql('publication-published.sql'));await db.exec(sql('publication-published.sql'));
 await db.exec(sql('project-close.sql'));
 const mig=sql('publication-submissions.sql');
 try{await db.exec(mig);await db.exec(mig)}catch(e){throw new Error('publication-submissions: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict do nothing`);
 const as=async(who:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${who}',false);set role authenticated;`);
 const one=async(q:string,p:any[]=[])=>(await db.query<any>(q,p)).rows[0];
 const count=async(t:string)=>(await one(`select count(*)::int n from ${t}`)).n;

 await as(other);
 const theirPaper=(await one(`insert into publications(user_id,title) values($1,'Theirs') returning id`,[other])).id;
 await db.query(`insert into ws_publication_submissions(publication_id,journal) values($1,'Their journal')`,[theirPaper]);

 await as(uid);
 const paper=(await one(`insert into publications(user_id,title) values($1,'STAT3 in obese PDAC') returning id`,[uid])).id;
 await assert.rejects(db.query(`insert into ws_publication_submissions(publication_id,journal) values($1,'x')`,[theirPaper]),/belong to this account/);
 await assert.rejects(db.query(`insert into ws_publication_submissions(publication_id,journal,status) values($1,'x','lost')`,[paper]),/status_check/);
 await assert.rejects(db.query(`insert into ws_publication_submissions(publication_id,journal) values($1,'  ')`,[paper]),/check/);
 await assert.rejects(db.query(`insert into ws_publication_submissions(publication_id,journal,submitted_on,decided_on) values($1,'x','2026-03-02','2026-03-01')`,[paper]),/check/);
 await db.query(`insert into ws_publication_submissions(publication_id,journal,position,status,submitted_on,decided_on,history) values($1,'Nature Cancer',0,'desk_rejected','2026-01-10','2026-01-14','[{"status":"submitted","on":"2026-01-10"},{"status":"desk_rejected","on":"2026-01-14"}]')`,[paper]);
 await db.query(`insert into ws_publication_submissions(publication_id,journal,position,status,submitted_on) values($1,'Cancer Research',1,'under_review','2026-01-20')`,[paper]);
 assert.equal(await count('ws_publication_submissions'),2,'the other account’s trail is invisible');
 // Each journal keeps its own reviews and decision letter.
 await db.query(`update ws_publication_submissions set review_comments='Reviewer 1: add a validation cohort',decision_email_url='https://mail.example.org/1' where journal='Cancer Research'`);

 // Backup and restore carry the trail.
 const backup=(await one(`select ws_backup_data() as b`)).b;
 assert.equal(backup.ws_publication_submissions.length,2);
 await db.exec(`delete from ws_publication_submissions`);
 const restored=(await one(`select ws_restore_data($1,$2) as r`,[uid,JSON.stringify(backup)])).r;
 assert.equal(restored.ws_publication_submissions,2);
 assert.deepEqual((await db.query<any>(`select journal from ws_publication_submissions order by position`)).rows.map((r)=>r.journal),['Nature Cancer','Cancer Research']);
 assert.equal((await one(`select review_comments as c from ws_publication_submissions where journal='Cancer Research'`)).c,'Reviewer 1: add a validation cohort');
 }finally{await db.close()}
});
