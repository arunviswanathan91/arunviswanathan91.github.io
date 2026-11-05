import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('thesis, goals and trips: ownership, Trash, search and backup',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users values('${uid}'),('${other}');`);
 await db.exec(`create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$`);
 for(const n of ['schema.sql','project-collaboration.sql','trash.sql','publication-notes.sql','workspace-extension.sql','finance-accounts.sql','emi-statements-habit-carry.sql','card-spending-habit-periods-reminders.sql','agenda-recurring-followups.sql','emi-schedule.sql','friend-spending.sql','resumes.sql','trash-workspace.sql','savings-accounts.sql','experiments.sql']){
  try{await db.exec(sql(n))}catch(e){throw new Error(n+': '+(e as Error).message)}
 }
 const mig=sql('planning.sql');
 try{await db.exec(mig);await db.exec(mig)}catch(e){throw new Error('planning: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict do nothing`);
 const as=async(who:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${who}',false);set role authenticated;`);
 const one=async(q:string,p:any[]=[])=>(await db.query<any>(q,p)).rows[0];
 const count=async(t:string)=>(await one(`select count(*)::int n from ${t}`)).n;

 await as(other);
 const theirChapter=(await one(`insert into ws_thesis_chapters(title) values('Theirs') returning id`)).id;
 const theirAccount=(await one(`insert into ws_savings_accounts(name,bank_name,currency,opening_balance,opening_on) values('Theirs','B','INR',0,current_date) returning id`)).id;

 await as(uid);
 // Thesis: one per account.
 await db.exec(`insert into ws_thesis(title,submission_on,target_words) values('Obesity and PDAC','2027-06-30',60000)`);
 await assert.rejects(db.exec(`insert into ws_thesis(title) values('Second')`),/unique|duplicate/);
 const ch=(await one(`insert into ws_thesis_chapters(title,position,words,target_words) values('Introduction',1,4200,12000) returning id`)).id;
 await db.query(`insert into ws_thesis_feedback(chapter_id,source,body) values($1,'dac','Tighten the rationale')`,[ch]);
 await assert.rejects(db.query(`insert into ws_thesis_feedback(chapter_id,body) values($1,'x')`,[theirChapter]),/belong to this account/);
 await assert.rejects(db.exec(`insert into ws_thesis_chapters(title,status) values('x','finished')`),/status_check/);

 // Goals: account link must be yours; measures are checked.
 const acc=(await one(`insert into ws_savings_accounts(name,bank_name,currency,opening_balance,opening_on) values('Mine','SBI','INR',1000,current_date) returning id`)).id;
 await db.query(`insert into ws_goals(title,area,measure,target,account_id) values('Emergency fund','money','savings',100000,$1)`,[acc]);
 await assert.rejects(db.query(`insert into ws_goals(title,measure,account_id) values('x','savings',$1)`,[theirAccount]),/belong to this account/);
 await assert.rejects(db.exec(`insert into ws_goals(title,measure) values('x','vibes')`),/measure_check/);
 const goal=(await one(`insert into ws_goals(title,measure,milestones) values('Submit paper 2','milestones','[{"label":"Draft","done":true},{"label":"Submit","done":false}]') returning id`)).id;

 // Trips.
 const trip=(await one(`insert into ws_trips(title,location,starts_on,ends_on,presentation,abstract_title,costs) values('AACR Annual Meeting 2027','San Diego','2027-04-16','2027-04-21','poster','STAT3-mediated immune dysfunction','[{"label":"Registration","amount":450,"paid":false}]') returning id`)).id;
 await assert.rejects(db.exec(`insert into ws_trips(title,starts_on,ends_on) values('x','2027-01-02','2027-01-01')`),/check/);

 assert.equal(await count('ws_thesis_chapters'),1,'the other account’s chapter is invisible');

 // Search finds trips and goals.
 const hits=(await db.query<any>(`select kind from ws_search_workspace('AACR')`)).rows.map((r)=>r.kind);
 assert.ok(hits.includes('trip'));
 assert.ok((await db.query<any>(`select kind from ws_search_workspace('paper 2')`)).rows.some((r)=>r.kind==='goal'));

 // Trash: a chapter takes its feedback with it and brings it back.
 const t=(await one(`select ws_trash('thesis_chapters',$1) as id`,[ch])).id;
 assert.equal(await count('ws_thesis_feedback'),0);
 await db.query(`select restore_trash_item($1)`,[t]);
 assert.equal(await count('ws_thesis_feedback'),1);
 for(const [table,id,type] of [['goals',goal,'goal'],['trips',trip,'trip']] as const){
  const tid=(await one(`select ws_trash($1,$2) as id`,[table,id])).id;
  assert.equal((await one(`select item_type from trash_items where id=$1`,[tid])).item_type,type);
  await db.query(`select restore_trash_item($1)`,[tid]);
 }

 // Backup keeps everything earlier (savings accounts, experiments) and adds the new tables, once.
 const backup=(await one(`select ws_backup_data() as b`)).b;
 for(const k of ['ws_savings_accounts','ws_experiments','ws_thesis','ws_thesis_chapters','ws_thesis_feedback','ws_goals','ws_trips']) assert.ok(k in backup,k);
 const restoreDef=(await one(`select pg_get_functiondef('public.ws_restore_data(uuid,jsonb)'::regprocedure) as d`)).d;
 assert.equal((restoreDef.match(/'ws_trips'/g)??[]).length,1);
 // Restore with feedback listed before its chapter (any order works).
 await db.exec(`delete from ws_thesis_feedback;delete from ws_thesis_chapters;delete from ws_goals;delete from ws_trips;delete from ws_thesis`);
 const res=(await one(`select ws_restore_data($1,$2) as r`,[uid,backup])).r;
 assert.equal(res.ws_thesis_chapters,1);assert.equal(res.ws_thesis_feedback,1);assert.equal(res.ws_goals,2);assert.equal(res.ws_trips,1);assert.equal(res.ws_thesis,1);
 // Trash internals stay closed.
 await assert.rejects(db.query(`select ws_private.trash_capture('public.ws_goals'::regclass,'id',array[$1]::uuid[])`,[goal]),/permission denied/);
 }finally{await db.close()}
});
