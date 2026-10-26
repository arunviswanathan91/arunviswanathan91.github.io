// Backup active owned workspace records (allowlisted server-side), with stable ids and links.
// Credentials, sharing ACLs, Trash and discovery data are deliberately excluded.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { BUCKET, currentUserId, downloadFile, emitChange, sb } from "./db.ts";

export const BACKUP_FORMAT = "arun-integrated-workspace-backup";
export const BACKUP_VERSION = 1;

type Row = Record<string, unknown>;
export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  owner_id: string;
  exported_at: string;
  counts: Record<string, number>;
  tables: Record<string, Row[]>;
}

export async function buildBackup(onProgress?: (msg: string) => void): Promise<Backup> {
  onProgress?.("Reading workspace records…");
  const owner_id = await currentUserId();
  const {data, error} = await sb().rpc("backup_data");
  if(error) throw new Error(error.message);
  const tables = data as Record<string, Row[]>;
  return {
    owner_id,
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])),
    tables,
  };
}

/** Zip with backup.json plus every uploaded file under files/<storage path>. */
export async function buildBackupZip(onProgress?: (msg: string) => void): Promise<{ zip: Uint8Array; missing: string[] }> {
  const backup = await buildBackup(onProgress);
  const files: Record<string, Uint8Array> = { "backup.json": strToU8(JSON.stringify(backup, null, 2)) };
  const missing: string[] = [];
  const atts = backup.tables.ws_attachments as { storage_path: string }[];
  for (const [i, a] of atts.entries()) {
    onProgress?.(`Downloading file ${i + 1} of ${atts.length}…`);
    try {
      files[`files/${a.storage_path}`] = new Uint8Array(await (await downloadFile(a.storage_path)).arrayBuffer());
    } catch {
      missing.push(a.storage_path);
    }
  }
  for(const pub of backup.tables.publications ?? []) {
    if(pub.deleted_at) continue;
    const prefix=String(pub.id);
    for(let offset=0;;offset+=100){
      const {data,error}=await sb().storage.from("paper-notes").list(prefix,{offset,limit:100,sortBy:{column:"name",order:"asc"}});
      if(error){missing.push(`paper-notes/${prefix}`);break;}
      for(const file of data??[]){
        if(!file.id||!file.name.endsWith(".md"))continue;
        const path=`${prefix}/${file.name}`;
        const {data:blob,error}=await sb().storage.from("paper-notes").download(path);
        if(error||!blob)missing.push(`paper-notes/${path}`);
        else files[`files/paper-notes/${path}`]=new Uint8Array(await blob.arrayBuffer());
      }
      if((data?.length??0)<100)break;
    }
  }
  onProgress?.("Compressing…");
  return { zip: zipSync(files, { level: 6 }), missing };
}

export function parseBackup(bytes: Uint8Array, filename: string): { backup: Backup; files: Record<string, Uint8Array> } {
  let json: string;
  let files: Record<string, Uint8Array> = {};
  if (filename.toLowerCase().endsWith(".zip")) {
    const entries = unzipSync(bytes);
    if (!entries["backup.json"]) throw new Error("This zip has no backup.json");
    json = strFromU8(entries["backup.json"]);
    files = Object.fromEntries(Object.entries(entries).filter(([k]) => k.startsWith("files/")).map(([k, v]) => [k.slice(6), v]));
  } else {
    json = strFromU8(bytes);
  }
  const backup = JSON.parse(json) as Backup;
  if (backup.format !== BACKUP_FORMAT) throw new Error("This file is not a workspace backup");
  if (backup.version > BACKUP_VERSION) throw new Error("This backup was made by a newer version of the dashboard");
  return { backup, files };
}

/** Restore owned records atomically; file failures remain visible and can be retried. */
export async function restoreBackup(backup: Backup, files: Record<string, Uint8Array>, onProgress?: (msg: string) => void): Promise<{ restored: Record<string, number>; filesUploaded: number; filesMissing: number }> {
 const uid = await currentUserId();
 if(backup.owner_id !== uid) throw new Error("Sign in to the account that created this backup.");
 onProgress?.("Restoring workspace records…");
 const {data:restored,error}=await sb().rpc("restore_data",{owner_id:uid,payload:backup.tables});
 if(error) throw new Error(error.message);
 let filesUploaded=0, filesMissing=0;
 for(const a of backup.tables.ws_attachments ?? []) {
  const path=String(a.storage_path);
  if(!path.startsWith(uid+"/")) throw new Error("Invalid attachment owner");
  if(!files[path]) {filesMissing++;continue;}
  onProgress?.(`Uploading file ${filesUploaded+1}…`);
  const {error}=await sb().storage.from(BUCKET).upload(path,files[path],{upsert:true,contentType:String(a.mime_type||"application/octet-stream")});
  if(error) throw new Error(`Records restored; file ${path}: ${error.message}. Retry this backup to finish files.`);
  filesUploaded++;
 }
 for(const [key,bytes] of Object.entries(files)){
  if(!key.startsWith("paper-notes/"))continue;
  const path=key.slice(12), publicationId=path.split("/")[0];
  if(!(backup.tables.publications??[]).some(p=>p.id===publicationId&&!p.deleted_at))throw new Error("Unknown publication note owner");
  const {error}=await sb().storage.from("paper-notes").upload(path,bytes,{upsert:true,contentType:"text/markdown"});
  if(error)throw new Error(`Records restored; publication note ${path}: ${error.message}. Retry to finish files.`);
  filesUploaded++;
 }
 emitChange();
 return {restored,filesUploaded,filesMissing};
}
