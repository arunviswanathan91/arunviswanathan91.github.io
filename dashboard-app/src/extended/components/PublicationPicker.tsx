import { useEffect, useState } from "react";
import { BookMarked } from "lucide-react";
import { supabase as core } from "../../lib/supabase";
import { normDoi } from "../../lib/libraryLinks";
import { Modal } from "./Modal.tsx";
import { Empty, ErrorText, Loading } from "./ui.tsx";

/** One of your own manuscripts, from the Publications tracker. */
export interface OwnPublication { id: string; title: string; venue: string | null; stage: string | null; doi: string | null; url: string | null; updated_at: string }

/** The DOI inside a link or a line of text ("https://doi.org/10.1/x" → "10.1/x"), or "". */
export const doiIn = (text: string | null | undefined) => normDoi((text ?? "").match(/10\.\d{4,9}\/\S+/)?.[0]).replace(/[.,;]$/, "");
const titleKey = (text: string | null | undefined) => (text ?? "").toLowerCase().replace(/[*.]/g, "").replace(/\s+/g, " ").trim();
/** Whether the publication is already among `existing` entries: the same DOI, else the same title. */
export function isListed(p: Pick<OwnPublication, "doi" | "title">, existing: { link: string; title: string }[]): boolean {
  const doi = doiIn(p.doi), title = titleKey(p.title);
  return existing.some((e) => (doi && doiIn(e.link) === doi) || (!!title && titleKey(e.title) === title));
}
/** Where the publication can be read: its DOI address, else its link. */
export const publicationLink = (p: Pick<OwnPublication, "doi" | "url">) => (normDoi(p.doi) ? `https://doi.org/${normDoi(p.doi)}` : p.url ?? "");

/**
 * "Pick from my publications": choose manuscripts from the Publications tracker to add as entries.
 * Ones already listed (see isListed) cannot be chosen again.
 */
export function PublicationPicker({ existing, onPick, label = "Pick from my publications" }: {
  existing: { link: string; title: string }[]; onPick: (rows: OwnPublication[]) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}><BookMarked size={14} /> {label}</button>
      {open && <PickModal existing={existing} onClose={() => setOpen(false)} onPick={(rows) => { onPick(rows); setOpen(false); }} />}
    </>
  );
}

function PickModal({ existing, onPick, onClose }: { existing: { link: string; title: string }[]; onPick: (rows: OwnPublication[]) => void; onClose: () => void }) {
  const [rows, setRows] = useState<OwnPublication[] | null>(null);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => {
    if (!core) { setError("Sign in to see your publications."); return; }
    let cancelled = false;
    void core.from("publications").select("id,title,venue,stage,doi,url,updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) setError(e.message); else setRows((data ?? []) as OwnPublication[]);
    });
    return () => { cancelled = true; };
  }, []);
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  return (
    <Modal title="Pick from my publications" wide onClose={onClose}>
      <ErrorText error={error} />
      {!rows ? (!error && <Loading rows={4} card={false} />) : !rows.length ? <Empty>No publications in your tracker yet. Add them under Publications, or enter this one by hand.</Empty> : (
        <ul className="pick-list">
          {rows.map((p) => {
            const listed = isListed(p, existing), on = chosen.includes(p.id);
            return (
              <li key={p.id}>
                <button type="button" aria-pressed={on} disabled={listed} onClick={() => toggle(p.id)}>
                  <strong>{on ? "✓ " : ""}{p.title || "Untitled publication"}</strong>
                  <span className="muted small">{[p.venue, p.stage, listed && "Already listed"].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="form-actions">
        <span className="muted small">Title, journal and link are filled in. Add the authors and year yourself.</span>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={!chosen.length} onClick={() => onPick((rows ?? []).filter((p) => chosen.includes(p.id)))}>
          {chosen.length ? `Add ${chosen.length}` : "Add"}
        </button>
      </div>
    </Modal>
  );
}
