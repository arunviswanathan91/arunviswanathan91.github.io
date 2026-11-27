import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileImage, FileSpreadsheet, Printer } from "lucide-react";
import { Modal } from "../../../components/Modal.tsx";
import { ErrorText } from "../../../components/ui.tsx";
import { downloadCsv, downloadPng, printSheet } from "./exporters.ts";
import { PAPER_TONES, fileBase, formatLabel, geometry, isLabelled, legend, tableRows, type Plate } from "./logic.ts";
import { plateSvg } from "./svg.ts";

interface Options { info: boolean; map: boolean; table: boolean; orientation: "portrait" | "landscape"; real: boolean }
const PAGE = { portrait: { width: 210, height: 297 }, landscape: { width: 297, height: 210 } };
const MARGIN = 10;
const PX_PER_MM = 96 / 25.4;

/** The document that is printed, and shown small as the preview. Sizes are in mm and pt; colours are for paper. */
function Sheet({ title, notes, plates, opts }: { title: string; notes: string; plates: Plate[]; opts: Options }) {
  const page = PAGE[opts.orientation];
  // Fit to page: as wide as the page allows, without the plate running past the bottom of it.
  const fitWidth = (ratio: number) => Math.min(page.width - 2 * MARGIN, (page.height - 2 * MARGIN - 45) * ratio);
  return (
    <div className="pm-sheet">
      {opts.info && (
        <header className="pm-sheet-head">
          <h1>{title}</h1>
          <p>{plates.map((p) => `${p.name}: ${formatLabel(p.rows, p.cols)}, ${Object.values(p.wells).filter(isLabelled).length} labelled`).join(" · ")}</p>
          {notes.trim() && <p className="pm-sheet-notes">{notes.trim()}</p>}
        </header>
      )}
      {plates.map((plate, i) => {
        const real = opts.real && geometry(plate.rows, plate.cols).real;
        const drawing = opts.map ? plateSvg(plate, { size: (w, h) => { const width = real ? w : fitWidth(w / h); return { width: `${width}mm`, height: `${(width * h) / w}mm` }; } }) : null;
        const groups = legend(plate);
        const rows = opts.table ? tableRows(plate) : [];
        return (
          <section key={i} className="pm-sheet-plate">
            {(opts.info || plates.length > 1) && <h2>{plate.name} <span>{formatLabel(plate.rows, plate.cols)}{real ? " · real size" : ""}</span></h2>}
            {drawing && <div className="pm-sheet-map" dangerouslySetInnerHTML={{ __html: drawing.svg }} />}
            {drawing && groups.length > 0 && (
              <ul className="pm-sheet-legend">
                {groups.map((g) => {
                  const tone = PAPER_TONES[g.color];
                  return <li key={g.group}><i style={{ background: tone?.bg ?? "#fff", borderColor: tone?.fg ?? "#8a8a8a" }} />{g.group} ({g.count})</li>;
                })}
              </ul>
            )}
            {opts.table && (rows.length ? (
              <table className="pm-sheet-table">
                <thead><tr><th>Well</th><th>Title</th><th>Group</th><th>Components</th><th>Note</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.well}><td>{r.well}</td><td>{r.title}</td><td>{r.group}</td><td>{r.components}</td><td>{r.note}</td></tr>)}</tbody>
              </table>
            ) : <p className="pm-sheet-empty">No labelled wells.</p>)}
          </section>
        );
      })}
    </div>
  );
}

/** Download: what to include, paper and scale, with a preview, then PDF (print), PNG or CSV. */
export function ExportDialog({ title, notes, plates, current, onClose }: { title: string; notes: string; plates: Plate[]; current: number; onClose: () => void }) {
  const [opts, setOpts] = useState<Options>({ info: true, map: true, table: true, orientation: "landscape", real: false });
  const [which, setWhich] = useState<"current" | "all">("current");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = which === "all" ? plates : [plates[current]];
  const name = fileBase(title);
  const docTitle = title.trim() || "Plate map";
  const canReal = chosen.some((p) => geometry(p.rows, p.cols).real);
  const real = opts.real && canReal;
  const effective = useMemo(() => ({ ...opts, real }), [opts, real]);
  const set = (patch: Partial<Options>) => setOpts((o) => ({ ...o, ...patch }));

  // The preview is the print sheet at page width, scaled down to the dialog.
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const page = PAGE[opts.orientation];
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / (page.width * PX_PER_MM)));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [page.width]);
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => { setHeight(inner.current?.offsetHeight ?? 0); }, [effective, chosen, title, notes]);

  // The sheet for printing sits outside the app (a direct child of <body>), hidden on screen.
  const [root] = useState(() => { const el = document.createElement("div"); el.className = "pm-print-root"; return el; });
  useEffect(() => { document.body.appendChild(root); return () => root.remove(); }, [root]);

  async function png() {
    setBusy(true);
    setProblem("");
    try {
      for (const [i, plate] of chosen.entries()) {
        await downloadPng(plate, chosen.length > 1 ? `${name}-${fileBase(plate.name)}-${i + 1}` : name, opts.info ? (plates.length > 1 ? `${docTitle} · ${plate.name}` : docTitle) : undefined);
      }
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const nothing = !opts.info && !opts.map && !opts.table;
  const sheet = <Sheet title={docTitle} notes={notes} plates={chosen} opts={effective} />;
  return (
    <Modal title="Download plate map" onClose={onClose} wide>
      <div className="pm-export">
        <div className="pm-export-options">
          {plates.length > 1 && (
            <fieldset>
              <legend>Plates</legend>
              <label className="pm-check"><input type="radio" name="pm-which" checked={which === "current"} onChange={() => setWhich("current")} /> <span>{plates[current].name} only</span></label>
              <label className="pm-check"><input type="radio" name="pm-which" checked={which === "all"} onChange={() => setWhich("all")} /> <span>All {plates.length} plates</span></label>
            </fieldset>
          )}
          <fieldset>
            <legend>Include</legend>
            <label className="pm-check"><input type="checkbox" className="check" checked={opts.info} onChange={(e) => set({ info: e.target.checked })} /> <span>Title and plate info</span></label>
            <label className="pm-check"><input type="checkbox" className="check" checked={opts.map} onChange={(e) => set({ map: e.target.checked })} /> <span>Plate map</span></label>
            <label className="pm-check"><input type="checkbox" className="check" checked={opts.table} onChange={(e) => set({ table: e.target.checked })} /> <span>Well table</span></label>
          </fieldset>
          <fieldset>
            <legend>Paper (A4)</legend>
            <label className="pm-check"><input type="radio" name="pm-paper" checked={opts.orientation === "portrait"} onChange={() => set({ orientation: "portrait" })} /> <span>Portrait</span></label>
            <label className="pm-check"><input type="radio" name="pm-paper" checked={opts.orientation === "landscape"} onChange={() => set({ orientation: "landscape" })} /> <span>Landscape</span></label>
          </fieldset>
          <fieldset>
            <legend>Scale of the map</legend>
            <label className="pm-check"><input type="radio" name="pm-scale" checked={!real} onChange={() => set({ real: false })} /> <span>Fit to page</span></label>
            <label className="pm-check"><input type="radio" name="pm-scale" checked={real} disabled={!canReal} onChange={() => set({ real: true })} /> <span>Real size 1:1</span></label>
            <p className="muted small">
              {canReal
                ? "Real size draws the plate at its true dimensions (127.76 × 85.48 mm, standard well spacing), so the printed sheet can sit under a real plate. Print at 100% (“Actual size”), not “Fit to page”. Well positions follow the plate standard; check a plate from your supplier against the first print."
                : "Real size is available for the standard formats (6 to 384 wells); a custom grid has no standard dimensions."}
            </p>
          </fieldset>
        </div>

        <div className="pm-export-preview">
          <span className="muted small">Preview{chosen.length > 1 || opts.table ? " (the printer sets the page breaks)" : ""}</span>
          <div ref={frame} className="pm-preview-frame" aria-label="Preview of the printed sheet" role="img">
            <div className="pm-preview-page" style={{ height: Math.max(height, page.height * PX_PER_MM) * scale }}>
              <div ref={inner} className="pm-preview-inner" style={{ width: `${page.width}mm`, padding: `${MARGIN}mm`, transform: `scale(${scale})` }}>{sheet}</div>
            </div>
          </div>
        </div>
      </div>
      <ErrorText error={problem} />
      <div className="form-actions pm-export-actions">
        <button type="button" disabled={!chosen.some((p) => Object.values(p.wells).some(isLabelled))} onClick={() => downloadCsv(chosen, name)}><FileSpreadsheet size={15} aria-hidden /> CSV (well table)</button>
        <button type="button" disabled={busy} onClick={() => void png()}><FileImage size={15} aria-hidden /> {busy ? "Drawing…" : "PNG (plate map)"}</button>
        <button type="button" className="primary" disabled={nothing} onClick={() => printSheet(name, opts.orientation)}><Printer size={15} aria-hidden /> PDF (print)</button>
      </div>
      <p className="muted small">PDF opens the print dialog: choose “Save as PDF” as the printer. Files are named “{name}”.</p>
      {createPortal(sheet, root)}
    </Modal>
  );
}
