import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('library: protocols and code with frozen versions, linked to experiments, searched, trashed and restored',async()=>{
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
 const mig=sql('library.sql');
 try{await db.exec(mig);await db.exec(mig)}catch(e){throw new Error('library: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict do nothing`);
 const as=async(who:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${who}',false);set role authenticated;`);
 const one=async(q:string,p:any[]=[])=>(await db.query<any>(q,p)).rows[0];
 const count=async(t:string)=>(await one(`select count(*)::int n from ${t}`)).n;

 await as(other);
 const theirs=(await one(`insert into ws_library_entries(kind,title) values('protocol','Theirs') returning id`)).id;
 const theirVersion=(await one(`insert into ws_library_versions(entry_id,version,body) values($1,1,'x') returning id`,[theirs])).id;

 await as(uid);
 await assert.rejects(db.exec(`insert into ws_library_entries(kind,title) values('recipe','x')`),/kind_check/);
 const wb=(await one(`insert into ws_library_entries(kind,title,technique,tags) values('protocol','Western blot','Western blot','{stat3}') returning id`)).id;
 const v1=(await one(`insert into ws_library_versions(entry_id,version,body,materials) values($1,1,'Block in 5% milk for one hour','anti-pSTAT3 Y705') returning id`,[wb])).id;
 const v2=(await one(`insert into ws_library_versions(entry_id,version,body,change_note) values($1,2,'Block in 5% BSA for one hour','BSA for phospho antibodies') returning id`,[wb])).id;
 await db.query(`update ws_library_entries set current_version_id=$1 where id=$2`,[v2,wb]);
 await assert.rejects(db.query(`insert into ws_library_versions(entry_id,version) values($1,2)`,[wb]),/unique|duplicate/);
 await assert.rejects(db.query(`insert into ws_library_versions(entry_id,version) values($1,1)`,[theirs]),/belong to this account/);
 await assert.rejects(db.query(`update ws_library_entries set current_version_id=$1 where id=$2`,[theirVersion,wb]),/belong to this account/);
 // A saved version is frozen; only its change note may be corrected.
 await assert.rejects(db.query(`update ws_library_versions set body='changed' where id=$1`,[v1]),/cannot be changed/);
 await db.query(`update ws_library_versions set change_note='first version' where id=$1`,[v1]);

 const code=(await one(`insert into ws_library_entries(kind,title,language,source_url) values('code','Bayesian BMI model','R','https://example.org/repo') returning id`)).id;
 const c1=(await one(`insert into ws_library_versions(entry_id,version,body,materials) values($1,1,'fit <- brm(expr ~ bmi + (1|patient))','brms 2.21') returning id`,[code])).id;
 await db.query(`update ws_library_entries set current_version_id=$1 where id=$2`,[c1,code]);

 // An experiment records the protocol version it used; only your own.
 const ex=(await one(`insert into ws_experiments(title,protocol_version_id) values('pSTAT3 blot',$1) returning id`,[v1])).id;
 await assert.rejects(db.query(`insert into ws_experiments(title,protocol_version_id) values('x',$1)`,[theirVersion]),/belong to this account/);
 await db.query(`insert into ws_attachments(storage_path,file_name,library_entry_id) values($2,'kit.pdf',$1)`,[wb,uid+'/a/kit.pdf']);
 assert.equal(await count('ws_library_entries'),2,'the other account’s entries are invisible');

 // Search finds an entry by words in its current version, under its own kind.
 const hits=(await db.query<any>(`select kind,title from ws_search_workspace('BSA')`)).rows;
 assert.ok(hits.some((r)=>r.kind==='protocol'&&r.title==='Western blot'));
 assert.ok((await db.query<any>(`select kind from ws_search_workspace('brm')`)).rows.some((r)=>r.kind==='code'));

 // Backup and restore carry entries, versions and the experiment's link.
 const backup=(await one(`select ws_backup_data() as b`)).b;
 assert.equal(backup.ws_library_entries.length,2);assert.equal(backup.ws_library_versions.length,3);

 // Trash takes the versions and the attachment with the entry, clears the experiment's link, and brings all of it back.
 const t=(await one(`select ws_trash('library_entries',$1) as id`,[wb])).id;
 assert.equal(await count('ws_library_versions'),1);
 assert.equal((await one(`select protocol_version_id as p from ws_experiments where id=$1`,[ex])).p,null);
 await db.query(`select restore_trash_item($1)`,[t]);
 assert.equal(await count('ws_library_versions'),3);
 assert.equal((await one(`select current_version_id as c from ws_library_entries where id=$1`,[wb])).c,v2);
 assert.equal((await one(`select protocol_version_id as p from ws_experiments where id=$1`,[ex])).p,v1);
 assert.equal(await count('ws_attachments'),1);

 await db.exec(`delete from ws_library_entries`);
 assert.equal(await count('ws_library_versions'),0);
 const restored=(await one(`select ws_restore_data($1,$2) as r`,[uid,JSON.stringify(backup)])).r;
 assert.equal(restored.ws_library_entries,2);assert.equal(restored.ws_library_versions,3);
 assert.equal((await one(`select protocol_version_id as p from ws_experiments where id=$1`,[ex])).p,v1);
 }finally{await db.close()}
});
