import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('savings accounts: balances, transfers, currency rules, base amounts, backup, trash',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users values('${uid}'),('${other}');`);
 await db.exec(`create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$`);
 for(const n of ['schema.sql','project-collaboration.sql','trash.sql','publication-notes.sql','workspace-extension.sql','finance-accounts.sql','emi-statements-habit-carry.sql','card-spending-habit-periods-reminders.sql','agenda-recurring-followups.sql','emi-schedule.sql','friend-spending.sql','resumes.sql','trash-workspace.sql']){
  try{await db.exec(sql(n))}catch(e){throw new Error(n+': '+(e as Error).message)}
 }
 const mig=sql('savings-accounts.sql');
 try{await db.exec(mig);await db.exec(mig)}catch(e){throw new Error('savings-accounts: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict do nothing`);
 await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false);set role authenticated;`);
 const one=async(q:string)=>(await db.query<any>(q)).rows[0];
 const bal=async(id:string)=>Number((await one(`select balance from ws_account_balances() where account_id='${id}'`)).balance);

 const inr=(await one(`insert into ws_savings_accounts(name,bank_name,opening_balance,opening_on) values('Salary','HDFC Bank',10000,'2026-01-01') returning id`)).id;
 const sek=(await one(`insert into ws_savings_accounts(name,bank_name,currency,opening_balance,opening_on) values('Sparkonto','SEB','SEK',500,'2026-01-01') returning id`)).id;
 assert.equal(await bal(inr),10000);

 // income and spending move the balance; before the opening date is ignored
 await db.exec(`insert into ws_transactions(kind,description,amount,account_id,occurred_on) values
  ('income','Salary',50000,'${inr}','2026-02-01'),('expense','Rent',15000,'${inr}','2026-02-02'),('expense','Old',999,'${inr}','2025-12-31')`);
 assert.equal(await bal(inr),45000);

 // currency must match the account
 await assert.rejects(db.exec(`insert into ws_transactions(kind,description,amount,currency,account_id) values('expense','Wrong',1,'SEK','${inr}')`),/INR/);
 await db.exec(`insert into ws_transactions(kind,description,amount,currency,account_id,base_currency,base_amount) values('expense','ICA',200,'SEK','${sek}','INR',1650)`);
 assert.equal(await bal(sek),300);

 // transfer INR -> SEK: needs the amount received when currencies differ; both balances move
 await assert.rejects(db.exec(`insert into ws_transactions(kind,description,amount,account_id,to_account_id) values('transfer','Top up',8300,'${inr}','${sek}')`),/amount that arrived/);
 await db.exec(`insert into ws_transactions(kind,description,amount,account_id,to_account_id,to_amount) values('transfer','Top up',8300,'${inr}','${sek}',1000)`);
 assert.equal(await bal(inr),45000-8300);assert.equal(await bal(sek),1300);
 await assert.rejects(db.exec(`insert into ws_transactions(kind,description,amount,account_id,to_account_id,to_amount) values('transfer','Loop',1,'${inr}','${inr}',1)`),/account_rules/);
 await assert.rejects(db.exec(`insert into ws_transactions(kind,description,amount,to_account_id) values('expense','Bad',1,'${inr}')`),/account_rules/);

 // a card bill / EMI paid from an account lowers its balance without becoming an expense
 const before=await bal(inr);
 const spentBefore=Number((await one(`select coalesce(sum(amount),0) s from ws_transactions where kind='expense' and account_id='${inr}'`)).s);
 const emi=(await one(`insert into ws_loans(contact_id,direction,amount,account_type,account_name) values('${(await one(`insert into ws_contacts(name) values('Lender') returning id`)).id}','borrowed',50000,'bank','Car loan') returning id`)).id;
 await db.exec(`insert into ws_loan_payments(loan_id,amount,paid_on,account_id) values('${emi}',2000,'2026-03-01','${inr}'),('${emi}',500,'2026-03-02',null)`);
 assert.equal(await bal(inr),before-2000);
 assert.equal(Number((await one(`select coalesce(sum(amount),0) s from ws_transactions where kind='expense' and account_id='${inr}'`)).s),spentBefore); // spent unchanged
 await assert.rejects(db.exec(`insert into ws_loan_payments(loan_id,amount,account_id) values('${emi}',1,'${sek}')`),/can only pay/);

 // base amount rules; card and account are exclusive
 await assert.rejects(db.exec(`insert into ws_transactions(kind,description,amount,base_amount) values('expense','x',1,5)`),/account_rules/);
 const contact=(await one(`insert into ws_contacts(name) values('Bank') returning id`)).id;
 const card=(await one(`insert into ws_loans(contact_id,direction,amount,account_type,account_name) values('${contact}','borrowed',0,'credit_card','Card') returning id`)).id;
 await assert.rejects(db.exec(`insert into ws_transactions(kind,description,amount,account_id,loan_id) values('expense','x',1,'${inr}','${card}')`),/not both/);

 // another user's account cannot be used
 await db.exec(`reset role;insert into ws_savings_accounts(user_id,name) values('${other}','Theirs');set role authenticated`);
 await db.exec(`reset role`);const theirs=(await one(`select id from ws_savings_accounts where name='Theirs'`)).id;await db.exec(`set role authenticated`);
 await assert.rejects(db.exec(`insert into ws_transactions(kind,description,amount,account_id) values('expense','x',1,'${theirs}')`),/Linked record|row-level/);
 assert.equal((await db.query<any>(`select * from ws_account_balances()`)).rows.length,2); // only mine

 // accounts with transactions cannot be deleted/trashed; empty ones go to Trash and come back
 await assert.rejects(db.exec(`select ws_trash('savings_accounts','${inr}')`),/foreign key|violates/);
 const spare=(await one(`insert into ws_savings_accounts(name,bank_name,opening_balance) values('Spare','Axis',77) returning id`)).id;
 const t=(await one(`select ws_trash('savings_accounts','${spare}') as id`)).id;
 assert.equal((await one(`select count(*)::int n from ws_savings_accounts where id='${spare}'`)).n,0);
 assert.equal((await one(`select item_type from trash_items where id='${t}'`)).item_type,'savings_account');
 await db.exec(`select restore_trash_item('${t}')`);
 assert.equal(await bal(spare),77);

 // backup includes accounts (and restore accepts them)
 const backup=(await one(`select ws_backup_data() as d`)).d;
 assert.equal(backup.ws_savings_accounts.length,3);
 const restored=(await one(`select ws_restore_data('${uid}', ws_backup_data()) as r`)).r;
 assert.equal(restored.ws_savings_accounts,3);
 assert.equal(await bal(inr),45000-8300-2000);
 }finally{await db.close()}
});
