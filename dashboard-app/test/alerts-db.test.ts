import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('morning briefing, paper alerts and funding calls',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users values('${uid}'),('${other}');`);
 await db.exec(`create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$`);
 for(const n of ['schema.sql','project-collaboration.sql','trash.sql','publication-notes.sql','workspace-extension.sql','finance-accounts.sql','emi-statements-habit-carry.sql','card-spending-habit-periods-reminders.sql','agenda-recurring-followups.sql','emi-schedule.sql','friend-spending.sql','resumes.sql','trash-workspace.sql','savings-accounts.sql','experiments.sql','planning.sql']){
  try{await db.exec(sql(n))}catch(e){throw new Error(n+': '+(e as Error).message)}
 }
 const mig=sql('alerts.sql');
 try{await db.exec(mig);await db.exec(mig)}catch(e){throw new Error('alerts: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict (id) do update set timezone='UTC'`);
 const as=async(who:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${who}',false);set role authenticated;`);
 const one=async(q:string,p:any[]=[])=>(await db.query<any>(q,p)).rows[0];

 await as(uid);
 // A day's worth: a task due today, one overdue, a meeting, a deadline in 2 days, a running experiment,
 // a new paper alert and a funding call you are applying for that closes next week.
 await db.exec(`insert into tasks(user_id,title,status,due_at) values('${uid}','Send DAC report','Backlog',now()),('${uid}','Order antibodies','Backlog',now()-interval '3 days'),('${uid}','Finished','Done',now())`);
 await db.exec(`insert into ws_meetings(title,starts_at) values('Lab meeting',date_trunc('day',now())+interval '10 hours')`);
 await db.exec(`insert into ws_deadlines(title,due_date) values('Abstract: AACR 2027',current_date+2),('Far away',current_date+30)`);
 await db.exec(`insert into ws_experiments(title,status) values('CD8 flow, HFD vs chow','running'),('Old run','done')`);
 await db.exec(`insert into ws_paper_alerts(source,external_id,title) values('pubmed','1','Obesity and STAT3 in PDAC'),('preprint','PPR2','Spatial atlas of pancreas')`);
 await db.exec(`insert into ws_funding_calls(title,status,closes_on) values('DBT travel grant','applying',current_date+7),('Not chosen','new',current_date+3)`);
 // Duplicates of a fetched paper are ignored; your own rows are private.
 await assert.rejects(db.exec(`insert into ws_paper_alerts(source,external_id,title) values('pubmed','1','Again')`),/unique|duplicate/);
 await db.exec(`insert into ws_funding_calls(title) values('Manual 1'),('Manual 2')`); // no external_id: never clash
 await assert.rejects(db.exec(`insert into ws_paper_alerts(source,external_id,title) values('arxiv','3','x')`),/source_check/);

 // Signed-in users cannot run the briefing for everyone.
 await assert.rejects(db.exec(`select ws_morning_briefing()`),/permission denied/);

 const briefings=async()=>(await db.query<any>(`select title,body from reminders where nudge_key like 'briefing:%'`)).rows;
 await db.exec(`reset role`);
 // Briefing time later today: nothing yet.
 await db.exec(`insert into ws_settings(user_id,briefing_time) values('${uid}',(now() at time zone 'UTC')::time + interval '1 hour') on conflict(user_id) do update set briefing_time=excluded.briefing_time`);
 await db.exec(`update ws_settings set briefing_time=least(briefing_time, '23:59') where user_id='${uid}'`);
 if((await one(`select (now() at time zone 'UTC')::time < '22:59' as ok`)).ok){
  await db.exec(`select ws_morning_briefing()`);
  assert.equal((await briefings()).length,0,'not before its time');
 }
 // Time has come: one briefing, then no more today.
 await db.exec(`update ws_settings set briefing_time='00:00' where user_id='${uid}'`);
 await db.exec(`select ws_morning_briefing()`);await db.exec(`select ws_morning_briefing()`);
 const b=await briefings();
 assert.equal(b.length,1);
 assert.match(b[0].title,/^Good morning — /);
 for(const want of [/Due today\n• Send DAC report/, /1 overdue task/, /Meetings\n• 10:00  Lab meeting/, /Abstract: AACR 2027/, /On the bench\n• CD8 flow, HFD vs chow/, /2 new papers match your topics/, /DBT travel grant — closes/]) assert.match(b[0].body,want);
 for(const not of [/Finished/, /Far away/, /Old run/, /Not chosen/]) assert.doesNotMatch(b[0].body,not);
 // A user with nothing on gets a short, friendly line; one with no briefing time gets none.
 await db.exec(`insert into ws_settings(user_id,briefing_time) values('${other}','00:00') on conflict(user_id) do update set briefing_time='00:00'`);
 await db.exec(`select ws_morning_briefing()`);
 assert.equal((await one(`select body from reminders where user_id='${other}' and nudge_key like 'briefing:%'`)).body,'Nothing due today. A clear day for deep work.');

 // Backup keeps everything earlier and adds the new tables.
 await as(uid);
 const backup=(await one(`select ws_backup_data() as b`)).b;
 for(const k of ['ws_savings_accounts','ws_experiments','ws_trips','ws_paper_alerts','ws_funding_calls']) assert.ok(k in backup,k);
 assert.equal(backup.ws_paper_alerts.length,2);
 }finally{await db.close()}
});
