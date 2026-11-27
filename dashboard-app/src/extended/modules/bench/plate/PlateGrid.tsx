import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { allWellIds, isLabelled, parseWellId, rectIds, rowLabel, wellId, type Plate } from "./logic.ts";

/** CSS variables every plate drawing needs: the grid's size, and a gap between wells that shrinks as columns are added. */
export const gridVars = (rows: number, cols: number): CSSProperties =>
  ({ "--rows": rows, "--cols": cols, "--gap": `${cols <= 4 ? 8 : cols <= 6 ? 6 : cols <= 8 ? 4 : cols <= 12 ? 3 : 2}px` } as CSSProperties);
/** How much a well can show: "s" and "m" have room for the well's id, "l" for a title on a wide screen, "xl" for a dot. */
export const plateSize = (rows: number, cols: number): "s" | "m" | "l" | "xl" => (rows * cols <= 24 ? "s" : rows * cols <= 48 ? "m" : cols <= 12 && rows * cols <= 96 ? "l" : "xl");

const wellAt = (x: number, y: number): string | null => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-well]")?.dataset.well ?? null;

/**
 * The plate in the editor. Tap a well to select it; drag across wells, shift-click, or turn
 * on multi-select to pick several; the row letters, column numbers and the corner select
 * whole lines or everything.
 */
export function PlateGrid({ plate, selected, multi, onSelect }: { plate: Plate; selected: string[]; multi: boolean; onSelect: (ids: string[]) => void }) {
  const { rows, cols } = plate;
  const chosen = new Set(selected);
  // The well the next shift-click or arrow key starts from; it is also the one Tab lands on.
  const [anchor, setAnchor] = useState("A1");
  const drag = useRef<{ start: string; last: string; moved: boolean; add: boolean; base: string[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const focusId = parseWellId(anchor) && parseWellId(anchor)!.row < rows && parseWellId(anchor)!.col < cols ? anchor : "A1";

  const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  const toggle = (id: string) => (chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  function down(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (e.button !== 0) return;
    if (e.shiftKey) {
      onSelect(rectIds(focusId, id));
      return;
    }
    // A finger drags the page unless multi-select is on; a mouse or pen always drags a selection.
    if (e.pointerType === "touch" && !multi) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    drag.current = { start: id, last: id, moved: false, add: multi || e.metaKey || e.ctrlKey, base: selected };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const id = wellAt(e.clientX, e.clientY);
    if (!id || id === d.last) return;
    d.last = id;
    d.moved = true;
    const rect = rectIds(d.start, id);
    onSelect(d.add ? union(d.base, rect) : rect);
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      setAnchor(d.start);
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    }
  }
  // A drag ends with a click on the well under the pointer; that click must not change the selection again.
  const suppressClick = useRef(false);
  function click(e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }, id: string) {
    if (suppressClick.current || e.shiftKey) return; // shift-click was handled when the pointer went down
    setAnchor(id);
    onSelect(multi || e.metaKey || e.ctrlKey ? toggle(id) : [id]);
  }
  function key(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    const step: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const by = step[e.key];
    const at = parseWellId(id);
    if (!by || !at) return;
    e.preventDefault();
    const to = wellId(Math.min(rows - 1, Math.max(0, at.row + by[0])), Math.min(cols - 1, Math.max(0, at.col + by[1])));
    box.current?.querySelector<HTMLElement>(`[data-well="${to}"]`)?.focus();
    if (e.shiftKey) onSelect(rectIds(focusId, to));
    else { setAnchor(to); if (!multi) onSelect([to]); }
  }
  function line(ids: string[], add: boolean) {
    const all = ids.every((id) => chosen.has(id));
    if (add) onSelect(all ? selected.filter((id) => !ids.includes(id)) : union(selected, ids));
    else onSelect(all && selected.length === ids.length ? [] : ids);
  }

  const everything = allWellIds(rows, cols);
  const size = plateSize(rows, cols);
  return (
    <div className="pm-scroll">
      <div className="pm-plate" data-size={size} data-dense={cols > 12 || undefined} style={gridVars(rows, cols)}>
        <div ref={box} className="pm-grid" data-multi={multi || undefined} role="group" aria-label={`${plate.name}: ${rows * cols} wells`}
          onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} onPointerLeave={(e) => { if (e.pointerType === "mouse" && e.buttons === 0) drag.current = null; }}>
          <button type="button" className="pm-head pm-corner" aria-label={selected.length === everything.length ? "Clear the selection" : "Select all wells"} onClick={() => line(everything, false)}>
            <span aria-hidden>All</span>
          </button>
          {Array.from({ length: cols }, (_, c) => (
            <button key={c} type="button" className="pm-head" aria-label={`Select column ${c + 1}`} onClick={(e) => line(Array.from({ length: rows }, (_, r) => wellId(r, c)), multi || e.metaKey || e.ctrlKey || e.shiftKey)}>{c + 1}</button>
          ))}
          {Array.from({ length: rows }, (_, r) => [
            <button key={`h${r}`} type="button" className="pm-head" aria-label={`Select row ${rowLabel(r)}`} onClick={(e) => line(Array.from({ length: cols }, (_, c) => wellId(r, c)), multi || e.metaKey || e.ctrlKey || e.shiftKey)}>{rowLabel(r)}</button>,
            ...Array.from({ length: cols }, (_, c) => {
              const id = wellId(r, c);
              const well = plate.wells[id];
              const on = chosen.has(id);
              const name = [id, well?.title, well?.group && `group ${well.group}`, on ? "selected" : ""].filter(Boolean).join(", ");
              return (
                <button key={id} type="button" className="pm-well" data-well={id} data-tone={well?.color || undefined} data-on={on || undefined} data-labelled={isLabelled(well) || undefined}
                  aria-pressed={on} aria-label={name} title={well?.title ? `${id}: ${well.title}` : id} tabIndex={id === focusId ? 0 : -1}
                  onPointerDown={(e) => down(e, id)} onClick={(e) => click(e, id)} onKeyDown={(e) => key(e, id)}>
                  {(size === "s" || size === "m") && <span className="pm-well-id" aria-hidden>{id}</span>}
                  {well?.title && size !== "xl" ? <span className="pm-well-text" aria-hidden>{well.title}</span> : null}
                  {isLabelled(well) && <span className="pm-well-dot" aria-hidden />}
                </button>
              );
            }),
          ])}
        </div>
      </div>
    </div>
  );
}
