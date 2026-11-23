import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('website content: anyone reads, only the owner writes',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users values('${uid}'),('${other}');`);
 await db.exec(`create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$`);
 for(const n of ['schema.sql','project-collaboration.sql','trash.sql','publication-notes.sql','workspace-extension.sql']){
  try{await db.exec(sql(n))}catch(e){throw new Error(n+': '+(e as Error).message)}
 }
 const mig=sql('website.sql');
 await db.exec(mig);await db.exec(mig); // rerunnable
 await db.exec(`grant usage on schema public to authenticated,anon;grant select on public.publications to authenticated`); // other storage policies look papers up
 const as=async(who:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${who}',false);set role authenticated;`);
 const anon=async()=>db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);set role anon;`);
 const content=async()=>(await db.query<any>(`select content from ws_site`)).rows.map(r=>r.content);

 // Nothing published: a visitor reads an empty table and cannot write.
 await anon();
 assert.deepEqual(await content(),[]);
 await assert.rejects(db.exec(`insert into ws_site(content) values('{"bio":"x"}')`),/permission denied/);

 // The first publish claims the one row; publishing again (an upsert) replaces it.
 await as(uid);
 await db.exec(`insert into ws_site(id,content) values(true,'{"bio":"first"}') on conflict (id) do update set content=excluded.content`);
 await db.exec(`insert into ws_site(id,content) values(true,'{"bio":"second"}') on conflict (id) do update set content=excluded.content`);
 assert.deepEqual(await content(),[{bio:'second'}]);
 await assert.rejects(db.exec(`update ws_site set content='[]'`),/check/);
 // The version a publish replaced is kept, and cannot be overwritten directly.
 const prev=async()=>(await db.query<any>(`select previous from ws_site`)).rows[0].previous;
 assert.deepEqual(await prev(),{bio:'first'});
 await db.exec(`update ws_site set previous='{"bio":"forged"}'`);
 assert.deepEqual(await prev(),{bio:'first'});

 // Another signed-in account can read it but cannot change, replace or take it over.
 await as(other);
 assert.deepEqual(await content(),[{bio:'second'}]);
 await db.exec(`update ws_site set content='{"bio":"hacked"}'`); // matches no row it may touch
 await assert.rejects(db.exec(`insert into ws_site(id,content) values(true,'{"bio":"hacked"}') on conflict (id) do update set content=excluded.content`),/row-level security/);
 await assert.rejects(db.exec(`insert into ws_site(user_id,content) values('${uid}','{}')`),/row-level security|duplicate/);
 await assert.rejects(db.exec(`delete from ws_site`),/permission denied/);

 // Visitors see what was published, and nothing else of the table is writable.
 await anon();
 assert.deepEqual(await content(),[{bio:'second'}]);
 await assert.rejects(db.exec(`update ws_site set content='{}'`),/permission denied/);
 await assert.rejects(db.exec(`select user_id from ws_site`),/permission denied/);
 await assert.rejects(db.exec(`select previous from ws_site`),/permission denied/); // the owner's account id stays private

 // Uploaded files: only inside your own folder of the public bucket.
 await as(uid);
 await db.exec(`insert into storage.objects(bucket_id,name) values('site','${uid}/cv-1.pdf')`);
 await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('site','${other}/cv-1.pdf')`),/row-level security/);
 }finally{await db.close()}
});
