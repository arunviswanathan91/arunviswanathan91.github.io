import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../../supabase/',import.meta.url);
const uid='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const sql=(n:string)=>readFileSync(new URL(n,root),'utf8').replace('create extension if not exists pgcrypto;','');

test('experiment log: links, files, search, Trash and backup',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users values('${uid}'),('${other}');`);
 await db.exec(`create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$`);
 for(const n of ['schema.sql','project-collaboration.sql','trash.sql','publication-notes.sql','workspace-extension.sql','finance-accounts.sql','emi-statements-habit-carry.sql','card-spending-habit-periods-reminders.sql','agenda-recurring-followups.sql','emi-schedule.sql','friend-spending.sql','resumes.sql','trash-workspace.sql','savings-accounts.sql']){
  try{await db.exec(sql(n))}catch(e){throw new Error(n+': '+(e as Error).message)}
 }
 const mig=sql('experiments.sql');
 try{await db.exec(mig);await db.exec(mig)}catch(e){throw new Error('experiments: '+(e as Error).message)}
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into profiles(id,timezone) values('${uid}','UTC'),('${other}','UTC') on conflict do nothing`);
 const as=async(who:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${who}',false);set role authenticated;`);
 const one=async(q:string,p:any[]=[])=>(await db.query<any>(q,p)).rows[0];
 const count=async(t:string)=>(await one(`select count(*)::int n from ${t}`)).n;

 // The other account owns a project; linking to it must fail.
 await as(other);
 const theirProject=(await one(`insert into projects(user_id,name) values('${other}','Not yours') returning id`)).id;
 const theirExp=(await one(`insert into ws_experiments(title) values('Their run') returning id`)).id;

 await as(uid);
 const project=(await one(`insert into projects(user_id,name) values('${uid}','Obese PDAC') returning id`)).id;
 const pub=(await one(`insert into publications(user_id,title) values('${uid}','Overweight TME paper') returning id`)).id;
 const exp=(await one(`insert into ws_experiments(title,technique,project_id,publication_id,aim,protocol,samples,started_on,tags)
   values('CD8 infiltration in HFD tumours','Flow cytometry',$1,$2,'Do HFD tumours exclude CD8 T cells?','Digest, stain CD45/CD3/CD8','[{"label":"M1","group":"HFD"},{"label":"M2","group":"Chow"}]','2026-11-01',array['flow']) returning *`,[project,pub]));
 assert.equal(exp.status,'planned');assert.equal(exp.samples.length,2);
 await assert.rejects(db.query(`insert into ws_experiments(title,project_id) values('x',$1)`,[theirProject]),/belong to this account/);
 await assert.rejects(db.query(`insert into ws_experiments(title,repeat_of) values('x',$1)`,[theirExp]),/belong to this account/);
 await assert.rejects(db.query(`insert into ws_experiments(title,started_on,ended_on) values('x','2026-11-02','2026-11-01')`),/check/);
 await assert.rejects(db.query(`insert into ws_experiments(title,status) values('x','someday')`),/status_check/);
 assert.equal(await count('ws_experiments'),1,'the other account’s run is invisible');

 // Repeat: a new run pointing at the first.
 const rep=(await one(`insert into ws_experiments(title,repeat_of,protocol) values('CD8 infiltration (repeat)',$1,'same') returning id`,[exp.id])).id;

 // Files: one owner only, and it must be yours.
 await db.query(`insert into ws_attachments(storage_path,file_name,experiment_id) values($1,'gating.png',$2)`,[`${uid}/a/gating.png`,exp.id]);
 await assert.rejects(db.query(`insert into ws_attachments(storage_path,file_name,experiment_id,project_id) values($1,'x',$2,$3)`,[`${uid}/b/x`,exp.id,project]),/attachments_one_owner/);
 await assert.rejects(db.query(`insert into ws_attachments(storage_path,file_name,experiment_id) values($1,'x',$2)`,[`${uid}/c/x`,theirExp]),/belong to this account|foreign key/);
 // Existing attachment kinds still work.
 await db.query(`insert into ws_attachments(storage_path,file_name,project_id) values($1,'plan.pdf',$2)`,[`${uid}/d/plan.pdf`,project]);

 // Search finds it by technique and by result text.
 await db.exec(`update ws_experiments set results='CD8 density reduced in HFD', status='done', outcome='worked' where id='${exp.id}'`);
 const hits=(await db.query<any>(`select kind,id from ws_search_workspace('CD8 density')`)).rows;
 assert.ok(hits.some((h)=>h.kind==='experiment'&&h.id===exp.id));

 // Trash: the run and its file go; the repeat loses its link; restore brings all back.
 const t=(await one(`select ws_trash('experiments',$1) as id`,[exp.id])).id;
 assert.equal((await one(`select item_type,title from trash_items where id=$1`,[t])).item_type,'experiment');
 assert.equal(await count(`ws_attachments where experiment_id is not null`),0);
 assert.equal((await one(`select repeat_of from ws_experiments where id=$1`,[rep])).repeat_of,null);
 await db.query(`select restore_trash_item($1)`,[t]);
 assert.equal(await count('ws_experiments'),2);
 assert.equal(await count(`ws_attachments where experiment_id is not null`),1);
 assert.equal((await one(`select repeat_of from ws_experiments where id=$1`,[rep])).repeat_of,exp.id);

 // Backup includes experiments; restoring with the repeat listed before the original still works.
 const backup=(await one(`select ws_backup_data() as b`)).b;
 assert.equal(backup.ws_experiments.length,2);
 backup.ws_experiments.sort((a:any)=>a.repeat_of?-1:1);
 await db.exec(`delete from ws_experiments`);
 const res=(await one(`select ws_restore_data($1,$2) as r`,[uid,backup])).r;
 assert.equal(res.ws_experiments,2);
 assert.equal((await one(`select repeat_of from ws_experiments where id=$1`,[rep])).repeat_of,exp.id);

 // Trash internals stay out of reach of signed-in users.
 await assert.rejects(db.query(`select ws_private.trash_capture('public.ws_experiments'::regclass,'id',array[$1]::uuid[])`,[rep]),/permission denied/);
 }finally{await db.close()}
});
