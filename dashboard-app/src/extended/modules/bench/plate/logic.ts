// Plate maps: everything that can be worked out without the screen. Well names, the order
// wells are visited in while pipetting, the fill helpers, the CSV, and where the wells of a
// real plate sit in millimetres. Nothing here touches the DOM or the database.

// ── What is stored ───────────────────────────────────────────────────────────

export interface WellComponent { name: string; amount?: string; unit?: string }
export interface Well { title?: string; note?: string; color?: string; group?: string; components?: WellComponent[] }
export type Order = "row" | "column";
export type Channels = 1 | 8 | 12;
/** Pipetting progress. `order` and `done` are always there; the rest remembers how the pass was set up. */
export interface Progress {
  order: Order;
  /** Well ids in the order they were marked, so the last one can be taken back. */
  done: string[];
  snake?: boolean;
  /** Left out until it is chosen by hand; see `labelledOnlyOn`. */
  labelledOnly?: boolean;
  channels?: Channels;
  /** Epoch ms of the first and the last "Pipetted". */
  startedAt?: number;
  finishedAt?: number;
}
export interface Plate { name: string; rows: number; cols: number; wells: Record<string, Well>; progress?: Progress }
export interface PlateMapData { plates: Plate[] }

export const MAX_ROWS = 32;
export const MAX_COLS = 48;

// ── Formats ──────────────────────────────────────────────────────────────────

export interface PlateFormat { wells: number; rows: number; cols: number; /** Centre-to-centre well spacing, mm. */ pitch: number }
export const FORMATS: PlateFormat[] = [
  { wells: 6, rows: 2, cols: 3, pitch: 39.1 },
  { wells: 12, rows: 3, cols: 4, pitch: 26 },
  { wells: 24, rows: 4, cols: 6, pitch: 19.3 },
  { wells: 48, rows: 6, cols: 8, pitch: 13 },
  { wells: 96, rows: 8, cols: 12, pitch: 9 },
  { wells: 384, rows: 16, cols: 24, pitch: 4.5 },
];
export const formatOf = (rows: number, cols: number): PlateFormat | null => FORMATS.find((f) => f.rows === rows && f.cols === cols) ?? null;
export const formatLabel = (rows: number, cols: number): string => {
  const f = formatOf(rows, cols);
  return f ? `${f.wells}-well (${rows} × ${cols})` : `Custom (${rows} × ${cols}, ${rows * cols} wells)`;
};

export const newPlate = (name: string, rows = 8, cols = 12): Plate => ({ name, rows, cols, wells: {} });

// ── Well ids ─────────────────────────────────────────────────────────────────

/** Row 0 is A, 25 is Z, 26 is AA, 27 is AB (the way spreadsheet columns are named). */
export function rowLabel(row: number): string {
  let n = Math.floor(row) + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = (n - 1 - r) / 26;
  }
  return s;
}
export function rowIndex(label: string): number {
  let n = 0;
  for (const ch of label.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
/** Zero-based row and column to an id such as "A1". */
export const wellId = (row: number, col: number): string => `${rowLabel(row)}${col + 1}`;
/** "P24" to { row: 15, col: 23 }; null for anything that is not a well id. */
export function parseWellId(id: string): { row: number; col: number } | null {
  const m = /^([A-Za-z]+)([1-9]\d*)$/.exec(id.trim());
  return m ? { row: rowIndex(m[1]), col: Number(m[2]) - 1 } : null;
}
export function allWellIds(rows: number, cols: number): string[] {
  const ids: string[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ids.push(wellId(r, c));
  return ids;
}
/** The wells of the rectangle between two wells, corners included. */
export function rectIds(a: string, b: string): string[] {
  const p = parseWellId(a), q = parseWellId(b);
  if (!p || !q) return [];
  const ids: string[] = [];
  for (let r = Math.min(p.row, q.row); r <= Math.max(p.row, q.row); r++) for (let c = Math.min(p.col, q.col); c <= Math.max(p.col, q.col); c++) ids.push(wellId(r, c));
  return ids;
}
/** Ids put in reading order: along each row, or down each column. */
export function sortIds(ids: string[], order: Order): string[] {
  const at = (id: string) => parseWellId(id) ?? { row: 0, col: 0 };
  return [...ids].sort((x, y) => {
    const a = at(x), b = at(y);
    return order === "row" ? a.row - b.row || a.col - b.col : a.col - b.col || a.row - b.row;
  });
}

// ── Wells ────────────────────────────────────────────────────────────────────

const has = (s: string | undefined) => !!s && s.trim() !== "";
/** A well counts as labelled when it has a title, a group, a note or a named component. Colour alone does not. */
export const isLabelled = (w: Well | undefined): boolean => !!w && (has(w.title) || has(w.group) || has(w.note) || !!w.components?.some((c) => has(c.name)));
export const isEmptyWell = (w: Well | undefined): boolean => !isLabelled(w) && !has(w?.color) && !w?.components?.length;

/** Drop blank fields so an untouched well is not stored at all. */
export function cleanWell(w: Well): Well | null {
  const out: Well = {};
  if (has(w.title)) out.title = w.title;
  if (has(w.note)) out.note = w.note;
  if (has(w.color)) out.color = w.color;
  if (has(w.group)) out.group = w.group;
  if (w.components?.length) out.components = w.components;
  return Object.keys(out).length ? out : null;
}

/** Change the same fields on several wells. `patch` may be a function of the well's id. */
export function patchWells(plate: Plate, ids: string[], patch: Partial<Well> | ((id: string, well: Well) => Partial<Well>)): Plate {
  const wells = { ...plate.wells };
  for (const id of ids) {
    const before = wells[id] ?? {};
    const next = cleanWell({ ...before, ...(typeof patch === "function" ? patch(id, before) : patch) });
    if (next) wells[id] = next;
    else delete wells[id];
  }
  return { ...plate, wells };
}
export function clearWells(plate: Plate, ids: string[]): Plate {
  const wells = { ...plate.wells };
  for (const id of ids) delete wells[id];
  return { ...plate, wells };
}
/** Another size for the same plate: wells that no longer exist are dropped, and so is progress. */
export function resizePlate(plate: Plate, rows: number, cols: number): Plate {
  const wells: Record<string, Well> = {};
  for (const [id, w] of Object.entries(plate.wells)) {
    const p = parseWellId(id);
    if (p && p.row < rows && p.col < cols) wells[id] = w;
  }
  return { name: plate.name, rows, cols, wells };
}
export const lostOnResize = (plate: Plate, rows: number, cols: number): number =>
  Object.keys(plate.wells).filter((id) => { const p = parseWellId(id); return !p || p.row >= rows || p.col >= cols; }).length;

export const componentText = (c: WellComponent): string => [c.name.trim(), [c.amount?.trim(), c.unit?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(" ");
export const componentsText = (components: WellComponent[] | undefined): string => (components ?? []).filter((c) => has(c.name) || has(c.amount)).map(componentText).join("; ");

export interface LegendEntry { group: string; color: string; count: number }
/** Groups in the order they first appear on the plate, each with the colour of its first well. */
export function legend(plate: Plate): LegendEntry[] {
  const out = new Map<string, LegendEntry>();
  for (const id of allWellIds(plate.rows, plate.cols)) {
    const w = plate.wells[id];
    const group = w?.group?.trim();
    if (!w || !group) continue;
    const entry = out.get(group);
    if (entry) { entry.count++; if (!entry.color && w.color) entry.color = w.color; }
    else out.set(group, { group, color: w.color ?? "", count: 1 });
  }
  return [...out.values()];
}

// ── Visiting order ───────────────────────────────────────────────────────────

export interface OrderOptions { order: Order; snake?: boolean; /** Keep only these wells (e.g. the labelled ones). */ only?: (id: string) => boolean }

/**
 * The order wells are visited in. By row: A1, A2, … then B1. By column: A1, B1, … then A2.
 * Snake turns round at the end of every row (or column): A1…A12, then B12…B1.
 * The turn follows the plate, not the wells kept by `only`, so skipped wells never change direction.
 */
export function visitOrder(rows: number, cols: number, opts: OrderOptions): string[] {
  const ids: string[] = [];
  const outer = opts.order === "row" ? rows : cols;
  const inner = opts.order === "row" ? cols : rows;
  for (let o = 0; o < outer; o++) {
    for (let k = 0; k < inner; k++) {
      const i = opts.snake && o % 2 === 1 ? inner - 1 - k : k;
      const id = opts.order === "row" ? wellId(o, i) : wellId(i, o);
      if (!opts.only || opts.only(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Multichannel pipettes have tips 9 mm apart. An 8-channel fills a column of a plate with 8
 * rows in one go, or every other well of a column with 16 rows (384-well); a 12-channel does
 * the same along a row of 12 or 24 columns. The stride is 1 or 2; 0 means it does not fit.
 */
export function channelStride(rows: number, cols: number, channels: Channels): number {
  if (channels === 1) return 1;
  const n = channels === 8 ? rows : cols;
  return n === channels ? 1 : n === channels * 2 ? 2 : 0;
}
export const channelChoices = (rows: number, cols: number): Channels[] => ([1, 8, 12] as Channels[]).filter((c) => channelStride(rows, cols, c) > 0);

export interface StepOptions extends OrderOptions { channels?: Channels }

/**
 * The steps of a pass: each step is the wells filled at once. With a single channel that is one
 * well per step, in `visitOrder`. With 8 channels a step is a column (two interleaved steps per
 * column on 16 rows), taken column by column; with 12 channels it is a row, taken row by row.
 * Steps left with no wells by `only` are dropped.
 */
export function visitSteps(rows: number, cols: number, opts: StepOptions): string[][] {
  const channels = opts.channels ?? 1;
  const stride = channelStride(rows, cols, channels);
  if (channels === 1 || !stride) return visitOrder(rows, cols, opts).map((id) => [id]);
  const steps: string[][] = [];
  const lines = channels === 8 ? cols : rows;
  for (let line = 0; line < lines; line++) {
    for (let offset = 0; offset < stride; offset++) {
      const step: string[] = [];
      for (let k = 0; k < channels; k++) {
        const i = offset + k * stride;
        const id = channels === 8 ? wellId(i, line) : wellId(line, i);
        if (!opts.only || opts.only(id)) step.push(id);
      }
      if (step.length) steps.push(step);
    }
  }
  return steps;
}

export const stepDone = (step: string[], done: ReadonlySet<string>): boolean => step.every((id) => done.has(id));
export const stepsDone = (steps: string[][], done: ReadonlySet<string>): number => steps.filter((s) => stepDone(s, done)).length;
/** The first step not yet done after `from`, wrapping round to the start; -1 when all are done. */
export function nextOpenStep(steps: string[][], done: ReadonlySet<string>, from: number): number {
  for (let k = 1; k <= steps.length; k++) {
    const i = (from + k) % steps.length;
    if (!stepDone(steps[i], done)) return i;
  }
  return -1;
}
/** The open steps that follow `from`, in order, at most `count` of them. */
export function upcomingSteps(steps: string[][], done: ReadonlySet<string>, from: number, count: number): number[] {
  const out: number[] = [];
  for (let k = 1; k < steps.length && out.length < count; k++) {
    const i = (from + k) % steps.length;
    if (!stepDone(steps[i], done)) out.push(i);
  }
  return out;
}
/** Mark a step: its wells are appended to `done` (once each). */
export const markStep = (done: string[], step: string[]): string[] => [...done, ...step.filter((id) => !done.includes(id))];
/** Take back the last marked step. Returns the new list and the index of that step (-1 if nothing was done). */
export function undoLastStep(steps: string[][], done: string[]): { done: string[]; index: number } {
  const last = done[done.length - 1];
  if (last === undefined) return { done, index: -1 };
  const index = steps.findIndex((s) => s.includes(last));
  const drop = new Set(index >= 0 ? steps[index] : [last]);
  return { done: done.filter((id) => !drop.has(id)), index };
}
/** Where a step sits on the plate: its top-left well and how many rows and columns it spans. */
export function stepBox(step: string[]): { row: number; col: number; rows: number; cols: number } {
  const at = step.map(parseWellId).filter((p): p is { row: number; col: number } => !!p);
  if (!at.length) return { row: 0, col: 0, rows: 1, cols: 1 };
  const r0 = Math.min(...at.map((p) => p.row)), r1 = Math.max(...at.map((p) => p.row));
  const c0 = Math.min(...at.map((p) => p.col)), c1 = Math.max(...at.map((p) => p.col));
  return { row: r0, col: c0, rows: r1 - r0 + 1, cols: c1 - c0 + 1 };
}
/** "A1" for one well, "A1–H1" for a multichannel step. */
export const stepLabel = (step: string[]): string => (step.length <= 1 ? step[0] ?? "" : `${step[0]}–${step[step.length - 1]}`);

/**
 * Whether a pass keeps to the labelled wells. Until it is chosen by hand it follows the plate:
 * on when at least one well is labelled, off for a blank plate.
 */
export const labelledOnlyOn = (setting: boolean | undefined, labelledCount: number): boolean => setting ?? labelledCount > 0;

export interface Pass { order: Order; channels: Channels; snake: boolean; labelledOnly: boolean; steps: string[][] }
/** The pass a plate is set up for: its stored progress read with the defaults, and the steps that follow. */
export function planPass(plate: Plate): Pass {
  const p = plate.progress;
  const channels: Channels = p?.channels && channelStride(plate.rows, plate.cols, p.channels) ? p.channels : 1;
  // A multichannel pipette sets the direction: an 8-channel goes column by column, a 12-channel row by row.
  const order: Order = channels === 8 ? "column" : channels === 12 ? "row" : p?.order ?? "row";
  const labelled = new Set(Object.keys(plate.wells).filter((id) => isLabelled(plate.wells[id])));
  const labelledOnly = labelledOnlyOn(p?.labelledOnly, labelled.size);
  const snake = !!p?.snake;
  return { order, channels, snake, labelledOnly, steps: visitSteps(plate.rows, plate.cols, { order, snake, channels, only: labelledOnly ? (id) => labelled.has(id) : undefined }) };
}
/** Wells of the pass that are done, and how many it has: the one progress figure. */
export function passCount(steps: string[][], done: ReadonlySet<string>): { done: number; total: number } {
  let n = 0, total = 0;
  for (const step of steps) for (const id of step) { total++; if (done.has(id)) n++; }
  return { done: n, total };
}

/** A plate with more wells than this is shown a part at a time while pipetting. */
export const WHOLE_PLATE_WELLS = 96;
/** The part of a large plate on show: 8 rows by 12 columns, or the full length of the line a multichannel pipette fills. */
export function viewSize(rows: number, cols: number, channels: Channels = 1): { rows: number; cols: number } {
  if (rows * cols <= WHOLE_PLATE_WELLS) return { rows, cols };
  return { rows: channels === 8 ? rows : Math.min(rows, 8), cols: channels === 12 ? cols : Math.min(cols, 12) };
}
/**
 * The first row and column of the window that holds a well. The plate is cut into windows of
 * `viewRows` by `viewCols` from A1, so the view stays still while a pass crosses it and moves on
 * only when the well leaves it; the last window is pulled back inside the plate.
 */
export function zoomWindow(rows: number, cols: number, row: number, col: number, viewRows: number, viewCols: number): { row: number; col: number } {
  const first = (n: number, at: number, view: number) => {
    const v = Math.max(1, Math.min(Math.floor(view), n));
    const i = Math.min(n - 1, Math.max(0, Math.floor(at)));
    return Math.max(0, Math.min(Math.floor(i / v) * v, n - v));
  };
  return { row: first(rows, row, viewRows), col: first(cols, col, viewCols) };
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${sec} s` : `${sec} s`;
}

// ── Fill helpers ─────────────────────────────────────────────────────────────

/**
 * Titles that count up. The number in the pattern is where counting starts: "Sample 1" gives
 * Sample 1, Sample 2, …; "S07" keeps its zeros (S07, S08); "T{n}h" counts where {n} stands
 * (from 1); a pattern with no number gets one added ("Ctrl" gives Ctrl 1, Ctrl 2).
 * `ids` must already be in the order to fill (see sortIds).
 */
export function fillSeries(ids: string[], pattern: string, step = 1): Record<string, string> {
  const p = pattern.trim();
  const out: Record<string, string> = {};
  let make: (i: number) => string;
  const last = /(\d+)(?!.*\d)/.exec(p);
  if (p.includes("{n}")) make = (i) => p.split("{n}").join(String(1 + i * step));
  else if (last) {
    const start = Number(last[1]);
    const width = last[1].startsWith("0") ? last[1].length : 0;
    make = (i) => p.slice(0, last.index) + String(start + i * step).padStart(width, "0") + p.slice(last.index + last[1].length);
  } else make = (i) => (p ? `${p} ${1 + i * step}` : String(1 + i * step));
  ids.forEach((id, i) => { out[id] = make(i); });
  return out;
}

/** Each label repeated `n` times, in order. Wells left over once the labels run out are not touched. */
export function replicates(ids: string[], labels: string[], n: number): Record<string, string> {
  const times = Math.max(1, Math.floor(n) || 1);
  const out: Record<string, string> = {};
  ids.forEach((id, i) => {
    const label = labels[Math.floor(i / times)];
    if (label !== undefined) out[id] = label;
  });
  return out;
}
/** Labels typed one per line, or separated by commas or semicolons on one line. */
export const parseLabels = (text: string): string[] => (text.includes("\n") ? text.split("\n") : text.split(/[,;]/)).map((s) => s.trim()).filter(Boolean);

/** A number as typed, with a comma or a point for decimals; null when it is not a number. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
/** Four significant figures, no trailing zeros, no exponent for ordinary sizes. */
export function formatAmount(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9 || abs < 1e-6) return n.toExponential(3).replace(/\.?0+e/, "e");
  return String(Number(n.toPrecision(4)));
}

/**
 * A dilution series: the first well gets `start`, each one after it the amount before divided
 * by `factor`. With `restart`, counting begins again on every row (filling by row) or column
 * (filling by column), so the same series runs across each replicate line.
 */
export function dilutionSeries(ids: string[], opts: { start: number; factor: number; order: Order; restart?: boolean }): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(opts.factor > 0) || !Number.isFinite(opts.start)) return out;
  const sorted = sortIds(ids, opts.order);
  let line = -1, k = 0;
  for (const id of sorted) {
    const p = parseWellId(id);
    if (!p) continue;
    const here = opts.order === "row" ? p.row : p.col;
    if (opts.restart && here !== line) k = 0;
    line = here;
    out[id] = formatAmount(opts.start / opts.factor ** k);
    k++;
  }
  return out;
}
/** Set (or replace, by name) one component of a well. */
export function withComponent(well: Well, c: WellComponent): WellComponent[] {
  const list = well.components ?? [];
  const i = list.findIndex((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
  return i >= 0 ? list.map((x, k) => (k === i ? c : x)) : [...list, c];
}

// ── Table and CSV ────────────────────────────────────────────────────────────

export interface TableRow { plate: string; well: string; title: string; group: string; components: string; note: string }
/** One line per labelled well, in reading order. */
export function tableRows(plate: Plate): TableRow[] {
  return allWellIds(plate.rows, plate.cols).filter((id) => isLabelled(plate.wells[id])).map((id) => {
    const w = plate.wells[id];
    return { plate: plate.name, well: id, title: w.title ?? "", group: w.group ?? "", components: componentsText(w.components), note: w.note ?? "" };
  });
}

/** A CSV cell: quoted when it holds a comma, a quote, a line break or outer spaces; quotes doubled. */
export function csvCell(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
/** The well table of every plate given. The Plate column is left out for a single plate. */
export function toCsv(plates: Plate[]): string {
  const many = plates.length > 1;
  const head = [...(many ? ["Plate"] : []), "Well", "Title", "Group", "Components", "Note"];
  const lines = [head.join(",")];
  for (const plate of plates) {
    for (const r of tableRows(plate)) lines.push([...(many ? [r.plate] : []), r.well, r.title, r.group, r.components, r.note].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** A file name from the map's title: letters, digits and dashes only. */
export function fileBase(title: string): string {
  const s = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return s || "plate-map";
}

// ── Real-size geometry (mm) ──────────────────────────────────────────────────

/** The footprint every SBS (ANSI/SLAS) microplate shares. */
export const FOOTPRINT = { width: 127.76, height: 85.48 };

export interface Geometry {
  /** Outline of the plate, mm. */
  width: number; height: number;
  pitch: number; diameter: number;
  /** Centre of A1 from the top-left corner of the outline. */
  x0: number; y0: number;
  /** True for the standard formats, whose printout matches a real plate. */
  real: boolean;
}
/**
 * Where the wells are. The standard formats use the SBS footprint with the well grid centred
 * on it, which is the standard's own position for 96 wells (A1 at 14.38, 11.24 mm) and 384
 * (12.13, 8.99 mm). A custom grid is drawn at 9 mm spacing on an outline that just fits it.
 */
export function geometry(rows: number, cols: number): Geometry {
  const f = formatOf(rows, cols);
  if (f) {
    return {
      ...FOOTPRINT, pitch: f.pitch, diameter: round2(f.pitch * 0.76), real: true,
      x0: round2((FOOTPRINT.width - (cols - 1) * f.pitch) / 2), y0: round2((FOOTPRINT.height - (rows - 1) * f.pitch) / 2),
    };
  }
  const pitch = 9, edge = 11;
  return { width: (cols - 1) * pitch + 2 * edge, height: (rows - 1) * pitch + 2 * edge, pitch, diameter: round2(pitch * 0.76), x0: edge, y0: edge, real: false };
}
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Centre of a well in mm from the top-left corner of the plate. */
export function wellCentre(rows: number, cols: number, id: string): { x: number; y: number } | null {
  const p = parseWellId(id);
  if (!p || p.row >= rows || p.col >= cols) return null;
  const g = geometry(rows, cols);
  return { x: round2(g.x0 + p.col * g.pitch), y: round2(g.y0 + p.row * g.pitch) };
}

// ── Colours ──────────────────────────────────────────────────────────────────

/** The palette a well can take: names of the app's tone colours. */
export const WELL_COLORS = ["green", "blue", "amber", "red", "violet", "pink", "teal", "slate"] as const;
/** The same tones as fixed values, for files and paper (always on white). */
export const PAPER_TONES: Record<string, { fg: string; bg: string }> = {
  green: { fg: "#256f4d", bg: "#dcf0e5" }, blue: { fg: "#3a5a99", bg: "#e8edfa" }, amber: { fg: "#8a6417", bg: "#fbf0d6" }, red: { fg: "#b0463a", bg: "#fbeae7" },
  violet: { fg: "#5f4a99", bg: "#eee9fa" }, pink: { fg: "#9c4372", bg: "#fae9f2" }, teal: { fg: "#1c6b6b", bg: "#dcf0f0" }, slate: { fg: "#4c5a55", bg: "#e7eae8" },
};

// ── Reading what was stored ──────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const obj = (raw: unknown): Raw => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Raw) : {});
const str = (raw: unknown): string => (typeof raw === "string" ? raw : typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "");
const int = (raw: unknown, fallback: number, max: number): number => (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? Math.min(raw, max) : fallback);

function readWell(raw: unknown): Well | null {
  const o = obj(raw);
  const components = (Array.isArray(o.components) ? o.components : []).map((c): WellComponent => {
    const r = obj(c);
    const out: WellComponent = { name: str(r.name) };
    if (str(r.amount)) out.amount = str(r.amount);
    if (str(r.unit)) out.unit = str(r.unit);
    return out;
  }).filter((c) => c.name || c.amount);
  return cleanWell({ title: str(o.title), note: str(o.note), color: str(o.color), group: str(o.group), components });
}
function readProgress(raw: unknown, rows: number, cols: number): Progress | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = obj(raw);
  const inside = (id: unknown): id is string => { const p = typeof id === "string" ? parseWellId(id) : null; return !!p && p.row < rows && p.col < cols; };
  const out: Progress = { order: o.order === "column" ? "column" : "row", done: [...new Set((Array.isArray(o.done) ? o.done : []).filter(inside))] };
  if (o.snake === true) out.snake = true;
  if (typeof o.labelledOnly === "boolean") out.labelledOnly = o.labelledOnly;
  if ((o.channels === 8 || o.channels === 12) && channelStride(rows, cols, o.channels)) out.channels = o.channels;
  if (typeof o.startedAt === "number") out.startedAt = o.startedAt;
  if (typeof o.finishedAt === "number") out.finishedAt = o.finishedAt;
  return out;
}
/** Stored data back into a map; anything missing or malformed is filled in, so an old item still opens. */
export function parsePlateMap(raw: unknown): PlateMapData {
  const o = obj(raw);
  // An early shape kept one plate at the top level.
  const list = Array.isArray(o.plates) ? o.plates : o.rows || o.cols ? [o] : [];
  const plates = list.map((p, i): Plate => {
    const r = obj(p);
    const rows = int(r.rows, 8, MAX_ROWS), cols = int(r.cols, 12, MAX_COLS);
    const wells: Record<string, Well> = {};
    for (const [id, w] of Object.entries(obj(r.wells))) {
      const at = parseWellId(id);
      const well = readWell(w);
      if (at && well && at.row < rows && at.col < cols) wells[wellId(at.row, at.col)] = well;
    }
    const plate: Plate = { name: str(r.name) || `Plate ${i + 1}`, rows, cols, wells };
    const progress = readProgress(r.progress, rows, cols);
    if (progress) plate.progress = progress;
    return plate;
  });
  return { plates: plates.length ? plates : [newPlate("Plate 1")] };
}

export function mapSummary(data: PlateMapData): string {
  const first = data.plates[0];
  const labelled = data.plates.reduce((n, p) => n + Object.values(p.wells).filter(isLabelled).length, 0);
  const size = data.plates.length === 1 ? formatLabel(first.rows, first.cols) : `${data.plates.length} plates`;
  return `${size} · ${labelled} labelled well${labelled === 1 ? "" : "s"}`;
}
