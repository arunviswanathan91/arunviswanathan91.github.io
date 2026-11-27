import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('bench items: saved tools are yours, link to protocols and experiments, and are searched, trashed and restored',async()=>{
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
 await db.exec(sql('publication-submissions.sql'));
 await db.exec(sql('library.sql'));
 const mig=sql('bench.sql');
 try{await db.exec(mig);await db.exec(mig)}catch(e){throw new Error('bench: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict do nothing`);
 const as=async(who:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${who}',false);set role authenticated;`);
 const one=async(q:string,p:any[]=[])=>(await db.query<any>(q,p)).rows[0];
 const count=async(t:string)=>(await one(`select count(*)::int n from ${t}`)).n;

 await as(other);
 const theirProtocol=(await one(`insert into ws_library_entries(kind,title) values('protocol','Theirs') returning id`)).id;
 await db.exec(`insert into ws_bench_items(kind,title) values('recipe','Their buffer')`);

 await as(uid);
 await assert.rejects(db.exec(`insert into ws_bench_items(kind,title) values('spell','x')`),/kind_check/);
 await assert.rejects(db.exec(`insert into ws_bench_items(kind,title,data) values('recipe','x','[]')`),/check/);
 const protocol=(await one(`insert into ws_library_entries(kind,title) values('protocol','Western blot') returning id`)).id;
 const ex=(await one(`insert into ws_experiments(title) values('pSTAT3 blot') returning id`)).id;
 const recipe=(await one(`insert into ws_bench_items(kind,title,data,library_entry_id,tags) values('recipe','RIPA buffer','{"volume":50,"unit":"mL","components":[{"name":"NaCl","final":150,"unit":"mM"}]}',$1,'{lysis}') returning id`,[protocol])).id;
 await db.query(`insert into ws_bench_items(kind,title,data,experiment_id) values('haemocytometer','KPC count','{"counts":[52,48,61,55],"dilution":2}',$1)`,[ex]);
 await db.query(`insert into ws_bench_items(kind,title,data,library_entry_id) values('timer_set','Blot washes','{"timers":[{"name":"Wash 1","seconds":600}]}',$1)`,[protocol]);
 await assert.rejects(db.query(`insert into ws_bench_items(kind,title,library_entry_id) values('recipe','x',$1)`,[theirProtocol]),/belong to this account/);
 assert.equal(await count('ws_bench_items'),3,'the other account’s items are invisible');

 assert.ok((await db.query<any>(`select kind,title from ws_search_workspace('RIPA')`)).rows.some((r)=>r.kind==='bench'&&r.title==='RIPA buffer'));

 const backup=(await one(`select ws_backup_data() as b`)).b;
 assert.equal(backup.ws_bench_items.length,3);

 // Trash and back; removing the protocol or the experiment keeps the item and clears the link.
 const t=(await one(`select ws_trash('bench_items',$1) as id`,[recipe])).id;
 assert.equal(await count('ws_bench_items'),2);
 await db.query(`select restore_trash_item($1)`,[t]);
 assert.equal((await one(`select data->>'volume' as v from ws_bench_items where id=$1`,[recipe])).v,'50');
 await db.query(`delete from ws_library_entries where id=$1`,[protocol]);
 await db.query(`delete from ws_experiments where id=$1`,[ex]);
 assert.equal(await count('ws_bench_items'),3);
 assert.equal((await one(`select count(*)::int n from ws_bench_items where library_entry_id is not null or experiment_id is not null`)).n,0);

 await db.exec(`delete from ws_bench_items`);
 const restored=(await one(`select ws_restore_data($1,$2) as r`,[uid,JSON.stringify(backup)])).r;
 assert.equal(restored.ws_bench_items,3);
 }finally{await db.close()}
});
