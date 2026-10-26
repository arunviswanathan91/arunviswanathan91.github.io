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
 await db.exec(readFileSync(new URL('finance-accounts.sql',root),'utf8'));
 await db.exec(readFileSync(new URL('emi-statements-habit-carry.sql',root),'utf8'));
 const finance2=readFileSync(new URL('card-spending-habit-periods-reminders.sql',root),'utf8');
 try{await db.exec(finance2);await db.exec(finance2)}catch(e){throw new Error('card-spending: '+(e as Error).message)}
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
 await db.exec(`insert into publications(user_id,title) values('${uid}','Existing manuscript')`);
 const historyCount=(await db.query<any>('select count(*)::int n from publication_stage_events')).rows[0].n;
 const contact=(await db.query<any>("insert into ws_contacts(name) values('Test bank') returning id")).rows[0].id;
 await db.query("insert into ws_loans(contact_id,direction,amount,account_type,account_name,card_last4,minimum_due) values($1,'borrowed',2000,'credit_card','Test card','1234',100)",[contact]);
 const card=(await db.query<any>("select id from ws_loans where account_name='Test card'")).rows[0].id;
 const reminder=async(id:string)=>(await db.query<any>('select title,body,done,notified_at,remind_at from reminders where loan_id=$1',[id])).rows;
 await db.query('update ws_loans set statement_amount=1500,statement_on=current_date-10,statement_due_on=current_date+5 where id=$1',[card]);
 assert.match((await reminder(card))[0].title,/^Card payment due: Test card/);
 assert.match((await reminder(card))[0].body,/minimum 100\.00 INR/);
 await db.query("insert into ws_transactions(kind,description,amount,loan_id) values('expense','Groceries',300,$1)",[card]);
 await assert.rejects(db.query("insert into ws_transactions(kind,description,amount,loan_id) values('transfer','Move',1,$1)",[card]),/loan_kind/);
 await db.query('insert into ws_loan_payments(loan_id,amount,paid_on) values($1,1500,current_date)',[card]);
 assert.equal((await reminder(card))[0].done,true); // statement paid: nothing left to remind about
 await db.query("insert into ws_loans(contact_id,direction,amount,account_type,account_name) values($1,'borrowed',0,'credit_card','Empty card')",[contact]);
 await assert.rejects(db.query("insert into ws_loans(contact_id,direction,amount,account_type) values($1,'borrowed',0,'bank')",[contact]),/amount_check/);
 const emi=(await db.query<any>("insert into ws_loans(contact_id,direction,amount,account_type,account_name,emi_amount,emi_first_on,emi_tenure) values($1,'borrowed',3000,'bank','Bike',1000,current_date+3,3) returning id",[contact])).rows[0].id;
 assert.match((await reminder(emi))[0].title,/^EMI due: Bike/);
 const firstAt=(await reminder(emi))[0].remind_at;
 await db.query('insert into ws_loan_payments(loan_id,amount,paid_on) values($1,1000,current_date)',[emi]);
 assert.ok((await reminder(emi))[0].remind_at>firstAt); // moved to the second EMI
 await db.exec("insert into ws_settings(habit_nudge_time) values('00:00') on conflict(user_id) do update set habit_nudge_time='00:00'");
 await db.exec("insert into ws_habits(name,target,unit) values('Read',30,'min')");
 await db.exec("insert into ws_habits(name,target,unit,period) values('Run',10,'km','week')");
 await assert.rejects(db.exec("insert into ws_habits(name,period) values('Vague','week')"),/period_check/);
 await db.exec('reset role');
 await db.exec('select ws_daily_nudges()');await db.exec('select ws_daily_nudges()');
 await db.exec('set role authenticated');
 const nudges=(await db.query<any>("select body from reminders where nudge_key like 'habits:%'")).rows;
 assert.equal(nudges.length,1);
 assert.match(nudges[0].body,/Read \(0 of 30 min\)/);
 assert.match(nudges[0].body,/Run \(0 of 10 km this week\)/);
 const reminderCount=(await db.query<any>('select count(*)::int n from reminders')).rows[0].n;
 const backup=(await db.query<any>('select ws_backup_data() as data')).rows[0].data;
 assert.equal(backup.ws_loans[0].card_last4,"1234");
 assert.equal(backup.tasks.length,3);
 assert.equal(backup.ws_papers.length,1);
 await db.exec(`update ws_papers set title='Edited' where id='${paper}'`);
 await db.query('select ws_restore_data($1,$2)',[uid,JSON.stringify(backup)]);
 assert.equal((await db.query<any>('select count(*)::int n from publication_stage_events')).rows[0].n,historyCount);
 assert.equal((await db.query<any>(`select title from ws_papers where id='${paper}'`)).rows[0].title,'STAT3 paper');
 assert.equal((await db.query<any>('select count(*)::int n from tasks')).rows[0].n,3);
 assert.equal((await db.query<any>('select count(*)::int n from reminders')).rows[0].n,reminderCount); // derived reminders are not duplicated
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
