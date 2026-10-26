import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { deleteFile, fileUrl, list, uploadFile, useLoad } from "../lib/db.ts";
import { fmtBytes, fmtDate } from "../lib/dates.ts";
import type { Attachment } from "../lib/types.ts";
import { confirmDanger, ErrorText } from "./ui.tsx";

type Owner = { project_id: string } | { paper_id: string } | { note_id: string } | { meeting_id: string } | { deadline_id: string };

/** Private files attached to one record. Opened through short-lived signed links. */
export function Attachments({ owner, accept, title = "Files" }: { owner: Owner; accept?: string; title?: string }) {
  const [key, id] = Object.entries(owner)[0];
  const { data: files = [] } = useLoad(() => list<Attachment>("attachments", { eq: { [key]: id }, order: [["created_at", false]] }), [key, id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function onPick(picked: FileList | null) {
    if (!picked?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const f of Array.from(picked)) {
        if (f.size > 50 * 1024 * 1024) throw new Error(`${f.name} is larger than 50 MB`);
        await uploadFile(f, owner as Record<string, string>);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function open(f: Attachment) {
    const w = window.open("", "_blank");
    try {
      const url = await fileUrl(f.storage_path);
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (e) {
      w?.close();
      setError((e as Error).message);
    }
  }

  async function del(f: Attachment) {
    if (!confirmDanger(`Delete “${f.file_name}”? This cannot be undone.`)) return;
    try {
      await deleteFile(f.id, f.storage_path);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="attachments">
      <div className="section-head">
        <h3>{title}</h3>
        <button type="button" onClick={() => input.current?.click()} disabled={busy}>
          <Paperclip size={14} /> {busy ? "Uploading…" : "Attach file"}
        </button>
        <input ref={input} type="file" multiple hidden accept={accept} onChange={(e) => void onPick(e.target.files)} />
      </div>
      <ErrorText error={error} />
      {files.length === 0 ? (
        <p className="muted small">No files.</p>
      ) : (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.id}>
              <button type="button" className="link" onClick={() => void open(f)}><FileText size={14} /> {f.file_name}</button>
              <span className="muted small">{fmtBytes(f.size_bytes)} · {fmtDate(f.created_at)}</span>
              <button type="button" className="icon danger" aria-label={`Delete ${f.file_name}`} onClick={() => void del(f)}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

