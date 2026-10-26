import { useEffect, useRef, useState } from "react";
import { Database, Download, FileArchive, LogOut, NotebookPen, Upload } from "lucide-react";
import { list, sb, useLoad } from "../../lib/db.ts";
import { buildBackup, buildBackupZip, parseBackup, restoreBackup, type Backup } from "../../lib/backup.ts";
import { downloadBlob, downloadNotes } from "../../lib/download.ts";
import { saveSettings, useSettings } from "../../lib/settings.ts";
import { CURRENCIES, type Note, type Paper, type Project } from "../../lib/types.ts";
import { confirmDanger, ErrorText, Field, PageHeader } from "../../components/ui.tsx";

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

export function SettingsView() {
  const settings = useSettings();
  const [currency, setCurrency] = useState(settings.default_currency);
  const [timezone, setTimezone] = useState(settings.timezone);
  const followupOf = (n: number | null | undefined) => (n === undefined ? "60" : n === null ? "" : String(n));
  const [followup, setFollowup] = useState(followupOf(settings.publication_followup_days));
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ backup: Backup; files: Record<string, Uint8Array>; name: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: email } = useLoad(async () => (await sb().auth.getUser()).data.user?.email ?? "", []);

  useEffect(() => {
    setCurrency(settings.default_currency);
    setTimezone(settings.timezone);
    setFollowup(followupOf(settings.publication_followup_days));
  }, [settings.default_currency, settings.timezone, settings.publication_followup_days]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setProgress(label);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  const exportJson = () =>
    run("Preparing backup…", async () => {
      const b = await buildBackup(setProgress);
      downloadBlob(new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }), `workspace-backup-${stamp()}.json`);
      setProgress(`Backup downloaded: ${Object.values(b.counts).reduce((a, n) => a + n, 0)} records.`);
    });

  const exportZip = () =>
    run("Preparing backup with files…", async () => {
      const { zip, missing } = await buildBackupZip(setProgress);
      downloadBlob(new Blob([new Uint8Array(zip).buffer], { type: "application/zip" }), `workspace-backup-${stamp()}.zip`);
      setProgress(missing.length ? `Backup downloaded, but ${missing.length} file(s) could not be read.` : "Backup with files downloaded.");
    });

  const exportNotes = () =>
    run("Collecting notes…", async () => {
      const [notes, projects, papers] = await Promise.all([list<Note>("notes"), list<Project>("projects"), list<Paper>("papers")]);
      if (!notes.length) throw new Error("No notes to export");
      downloadNotes(notes, { project: (id) => projects.find((p) => p.id === id)?.title ?? "", paper: (id) => papers.find((p) => p.id === id)?.title ?? "" });
      setProgress(`${notes.length} notes downloaded as markdown.`);
    });

  async function pickRestore(f: File | undefined) {
    if (!f) return;
    setError("");
    try {
      const parsed = parseBackup(new Uint8Array(await f.arrayBuffer()), f.name);
      setPending({ ...parsed, name: f.name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const doRestore = () =>
    pending &&
    confirmDanger("Restore this backup? Records with the same ids are overwritten with the backup’s version; nothing is deleted.") &&
    run("Restoring…", async () => {
      const r = await restoreBackup(pending.backup, pending.files, setProgress);
      setPending(null);
      setProgress(`Restored ${Object.values(r.restored).reduce((a, n) => a + n, 0)} records${r.filesUploaded ? ` and ${r.filesUploaded} files` : ""}.${r.filesMissing ? ` ${r.filesMissing} files were not in the backup (JSON-only backup).` : ""}`);
    });

  return (
    <section>
      <PageHeader section="settings" title="Settings" subtitle="Preferences, exports and backups." />
      <div className="detail-grid">
        <div className="detail-main">
          <div className="card pad">
            <h2 className="section-title">Preferences</h2>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void run("Saving…", async () => {
                  await saveSettings({ default_currency: currency, timezone, publication_followup_days: followup === "" ? null : Math.max(1, Math.round(Number(followup))) });
                  setProgress("");
                  setSaved("Saved.");
                  setTimeout(() => setSaved(""), 2000);
                });
              }}
            >
              <div className="grid-2">
                <Field label="Default currency (budget and loans)">
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Time zone">
                  <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                </Field>
                <Field label="Chase papers under review after (days)">
                  <input type="number" min="1" step="1" value={followup} placeholder="Off" onChange={(e) => setFollowup(e.target.value)} />
                </Field>
              </div>
              <p className="muted small">A Telegram reminder is sent when a manuscript has been Under Review or Revision Requested this long, and again every same number of days. Leave empty to turn it off.</p>
              <div className="form-actions">
                {saved && <span className="pos small">{saved}</span>}
                <button className="primary" disabled={busy}>Save</button>
              </div>
            </form>
          </div>

          <div className="card pad">
            <h2 className="section-title">Backup</h2>
            <p className="muted small">
              A backup contains your active, owned workspace records, including publications, task boards, clippings, papers, notes, meetings, deadlines, habits, budget and loans. Connected-service credentials, sharing permissions, Trash and opportunity discovery data are excluded.
              Keep one somewhere safe regularly. PDFs are for reading; they are not backups.
            </p>
            <div className="button-stack">
              <button disabled={busy} onClick={() => void exportZip()}><FileArchive size={15} /> Download workspace backup with files (.zip)</button>
              <button disabled={busy} onClick={() => void exportJson()}><Database size={15} /> Download data only (.json)</button>
              <button disabled={busy} onClick={() => void exportNotes()}><NotebookPen size={15} /> Download all notes as markdown</button>
            </div>
          </div>

          <div className="card pad">
            <h2 className="section-title">Restore</h2>
            <p className="muted small">Load a backup (.zip or .json). Records are added or overwritten by id; nothing is deleted. Restore into the same signed-in account. Connected-service credentials and sharing permissions are not included.</p>
            <button disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={15} /> Choose backup file…</button>
            <input ref={fileInput} type="file" hidden accept=".zip,.json,application/json,application/zip" onChange={(e) => void pickRestore(e.target.files?.[0])} />
            {pending && (
              <div className="notice">
                <p><strong>{pending.name}</strong> — made {new Date(pending.backup.exported_at).toLocaleString("en-GB")}</p>
                <p className="small">
                  {Object.entries(pending.backup.counts).filter(([, n]) => n).map(([t, n]) => `${n} ${t.replace(/_/g, " ")}`).join(", ") || "Empty backup"}
                  {Object.keys(pending.files).length > 0 && ` · ${Object.keys(pending.files).length} files`}
                </p>
                <div className="row">
                  <button className="primary" disabled={busy} onClick={() => void doRestore()}>Restore</button>
                  <button onClick={() => setPending(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
          {progress && <p className="small" role="status">{progress}</p>}
          <ErrorText error={error} />
        </div>

        <aside className="detail-side">
          <div className="card pad">
            <h3>Account</h3>
            <p className="small">{email}</p>
            <button onClick={() => void sb().auth.signOut()}><LogOut size={14} /> Sign out</button>
          </div>
          <div className="card pad">
            <h3>Exports elsewhere</h3>
            <ul className="small muted plain">
              <li>Meeting PDFs: on any meeting, or select several in Meetings.</li>
              <li>Project summary PDF: on any project page.</li>
              <li>Single note: download button on the note.</li>
            </ul>
            <p className="small"><a href="https://github.com/arunviswanathan91/arunviswanathan91.github.io/blob/main/docs/workspace-integration.md" target="_blank" rel="noreferrer"><Download size={12} /> Backup &amp; restore guide</a></p>
          </div>
        </aside>
      </div>
    </section>
  );
}

