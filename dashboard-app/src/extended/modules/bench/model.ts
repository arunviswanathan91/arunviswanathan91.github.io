// What each bench tool keeps: its inputs exactly as typed (text, so "0.50" stays "0.50").
// A saved item stores this as `data`; opening it reads it back through the functions below,
// which fill in anything missing, so an item saved by an older version still opens.
import type { BenchKind } from "../../lib/types.ts";
import { CELL_UNITS, FOLD_UNIT, MASSVOL_UNITS, MOLAR_UNITS, PERCENT_UNIT, dimensionOf, num, type Dimension, type Q } from "./calc.ts";

export type ToolId = "dilution" | "cells" | "haemocytometer" | "molarity" | "convert" | "recipe" | "mastermix" | "curve" | "timers" | "plate" | "power" | "cellLines";

export interface ToolInfo { id: ToolId; label: string; blurb: string; /** What a saved item of this tool is stored as; none for a tool that is not saved. */ kind?: BenchKind }
export const TOOLS: Record<ToolId, ToolInfo> = {
  dilution: { id: "dilution", label: "Dilution", blurb: "C1·V1 = C2·V2 for any solution, and serial dilutions.", kind: "dilution" },
  cells: { id: "cells", label: "Cell dilution & seeding", blurb: "Dilute a cell suspension or make the mix to seed a plate.", kind: "cell_dilution" },
  haemocytometer: { id: "haemocytometer", label: "Haemocytometer", blurb: "Counts per square to cells/mL, viability and total cells.", kind: "haemocytometer" },
  molarity: { id: "molarity", label: "Molarity", blurb: "Mass to weigh, moles in a mass, concentration of a solution.", kind: "molarity" },
  convert: { id: "convert", label: "Unit converter", blurb: "Volume, mass, molar, mass per volume and cell concentrations." },
  recipe: { id: "recipe", label: "Buffer & medium recipe", blurb: "Components from stocks or powder for any final volume.", kind: "recipe" },
  mastermix: { id: "mastermix", label: "Master mix", blurb: "Reagent volumes for a number of reactions, with overage.", kind: "master_mix" },
  curve: { id: "curve", label: "Calibration curve", blurb: "Fit a line to standards and read unknowns off it.", kind: "curve" },
  timers: { id: "timers", label: "Multi-timer", blurb: "Several named timers running side by side.", kind: "timer_set" },
  plate: { id: "plate", label: "Plate map", blurb: "Label the wells of a plate and pipette it well by well.", kind: "plate" },
  power: { id: "power", label: "Power & sample size", blurb: "Samples for the power you want, or power for the samples you have, per assay.", kind: "power_analysis" },
  cellLines: { id: "cellLines", label: "Cell lines", blurb: "Look up a cell line and track your own stock: profile, growth, seeding, splitting and passages.", kind: "cell_line" },
};
/** The order of the tiles on the Bench page. */
export const TOOL_ORDER: ToolId[] = ["dilution", "cells", "haemocytometer", "molarity", "convert", "recipe", "mastermix", "curve", "power", "cellLines", "timers", "plate"];
export const isTool = (id: string): id is ToolId => id in TOOLS;
export function toolOfKind(kind: BenchKind): ToolId {
  return TOOL_ORDER.find((t) => TOOLS[t].kind === kind) ?? "dilution";
}

// ── Reading stored values ────────────────────────────────────────────────────

/** A quantity as typed. */
export interface QText { value: string; unit: string }
export const toQ = (t: QText): Q => ({ value: num(t.value), unit: t.unit });
export const qt = (unit: string, value = ""): QText => ({ value, unit });

type Raw = Record<string, unknown>;
const obj = (raw: unknown): Raw => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Raw) : {});
const arr = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : []);
const text = (raw: unknown, fallback = ""): string => (typeof raw === "string" ? raw : typeof raw === "number" && Number.isFinite(raw) ? String(raw) : fallback);
const flag = (raw: unknown, fallback: boolean): boolean => (typeof raw === "boolean" ? raw : fallback);
const pick = <T extends string>(raw: unknown, options: readonly T[], fallback: T): T => (options.includes(raw as T) ? (raw as T) : fallback);
/** A stored quantity; the unit falls back when it is missing or of the wrong kind. */
function quantity(raw: unknown, fallback: string, dims: Dimension[]): QText {
  const o = obj(raw);
  const unit = typeof o.unit === "string" ? o.unit : "";
  const dim = dimensionOf(unit);
  return { value: text(raw && typeof raw === "object" ? o.value : raw), unit: dim && dims.includes(dim) ? unit : fallback };
}
const SOLUTION: Dimension[] = ["molar", "percent", "fold", "massvol"];

// ── Dilution ─────────────────────────────────────────────────────────────────

export type ConcType = "molar" | "percent" | "fold" | "massvol";
export const CONC_TYPES: [ConcType, string][] = [["molar", "Molar"], ["percent", "Percent"], ["fold", "Fold (×)"], ["massvol", "Mass / volume"]];
export const CONC_UNITS: Record<ConcType, string[]> = { molar: MOLAR_UNITS, percent: [PERCENT_UNIT], fold: [FOLD_UNIT], massvol: MASSVOL_UNITS };
/** Units a concentration type starts with: [stock, final]. */
// Stock and target start in the same unit, so typing 10 and 1 means a tenfold dilution and never a hidden thousandfold one.
export const CONC_DEFAULT: Record<ConcType, [string, string]> = { molar: ["mM", "mM"], percent: ["%", "%"], fold: ["x", "x"], massvol: ["mg/mL", "mg/mL"] };

export type DilutionTab = "dilution" | "serial" | "reverse" | "make";
export interface DilutionData {
  tab: DilutionTab;
  /** Dilution: leave one blank (normally the stock volume) and it is solved. */
  c1: QText; v1: QText; c2: QText; v2: QText;
  /** Serial dilution. `by`: a ratio and a number of steps, or a target concentration to reach. */
  by: "steps" | "target";
  start: QText;
  /** The dilution per step as typed: "1:10" or "10". */
  ratio: string;
  /** A different dilution for every step: `ratios`, one per step. */
  perStep: boolean; ratios: string[];
  steps: string;
  volume: QText; volumeIs: "transfer" | "tube";
  target: QText;
  /** Target mode: work out the factor for a number of steps, or the steps for a ratio. */
  find: "factor" | "steps";
  /** Reverse dilution. */
  rc1: QText; rStock: QText; rSolvent: QText;
  /** Make solution. */
  mw: string; mConc: QText; mVolume: QText;
}
export function concTypeOf(unit: string): ConcType {
  const dim = dimensionOf(unit);
  return dim === "percent" || dim === "fold" || dim === "massvol" ? dim : "molar";
}
export function dilutionData(raw: unknown): DilutionData {
  const o = obj(raw);
  const c1 = quantity(o.c1, "mM", SOLUTION);
  const type = concTypeOf(c1.unit);
  const [stock, final] = CONC_DEFAULT[type];
  return {
    tab: pick(o.tab, ["dilution", "serial", "reverse", "make"] as const, "dilution"),
    c1,
    c2: quantity(o.c2, final, [type]),
    v1: quantity(o.v1, "mL", ["volume"]),
    v2: quantity(o.v2, "mL", ["volume"]),
    by: pick(o.by, ["steps", "target"] as const, "steps"),
    start: quantity(o.start, stock, [type]),
    ratio: text(o.ratio, "1:10"),
    perStep: flag(o.perStep, false),
    ratios: arr(o.ratios).map((r) => text(r)),
    steps: text(o.steps, "6"),
    volume: quantity(o.volume, "µL", ["volume"]),
    volumeIs: pick(o.volumeIs, ["transfer", "tube"] as const, "transfer"),
    target: quantity(o.target, final, [type]),
    find: pick(o.find, ["factor", "steps"] as const, "factor"),
    rc1: quantity(o.rc1, stock, [type]),
    rStock: quantity(o.rStock, "mL", ["volume"]),
    rSolvent: quantity(o.rSolvent, "mL", ["volume"]),
    mw: text(o.mw),
    mConc: quantity(o.mConc, "mM", ["molar", "massvol", "percent"]),
    mVolume: quantity(o.mVolume, "mL", ["volume"]),
  };
}

// ── Cells ────────────────────────────────────────────────────────────────────

export interface CellsData {
  tab: "dilute" | "seed";
  c1: QText; v1: QText; c2: QText; v2: QText;
  cellsPerWell: string; wells: string; overage: string; perWell: QText; stock: QText;
}
const CELL_DEFAULT = CELL_UNITS[4]; // ×10⁶ cells/mL
export function cellsData(raw: unknown): CellsData {
  const o = obj(raw);
  return {
    tab: pick(o.tab, ["dilute", "seed"] as const, "dilute"),
    c1: quantity(o.c1, CELL_DEFAULT, ["cells"]),
    v1: quantity(o.v1, "mL", ["volume"]),
    c2: quantity(o.c2, CELL_DEFAULT, ["cells"]),
    v2: quantity(o.v2, "mL", ["volume"]),
    cellsPerWell: text(o.cellsPerWell),
    wells: text(o.wells),
    overage: text(o.overage, "10"),
    perWell: quantity(o.perWell, "µL", ["volume"]),
    stock: quantity(o.stock, CELL_DEFAULT, ["cells"]),
  };
}

// ── Haemocytometer ───────────────────────────────────────────────────────────

export type HaemoMode = "tap" | "square" | "total";
/**
 * `counted` holds which of the nine large squares are counted (0 to 8, in reading order);
 * `live` and `dead` hold one count for each of them, in the same order. The total fields
 * belong to the "total" mode, for a count kept on a tally counter.
 */
export interface HaemoData {
  mode: HaemoMode;
  counted: number[];
  live: string[]; dead: string[];
  total: string; totalDead: string; totalSquares: string;
  countDead: boolean; dilution: string; volume: QText;
}
export const START_SQUARES = 4;
export const CHAMBER_SQUARES = 9;
export const HAEMO_LAYOUTS = {
  corners: [0, 2, 6, 8],
  centre: [0, 2, 4, 6, 8],
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8],
} as const;
export type HaemoLayout = keyof typeof HAEMO_LAYOUTS;

/** The label of each counted square: C1, C2, … in reading order. */
export const squareLabel = (k: number): string => `C${k + 1}`;
/** Which named layout these squares make, if any. */
export function layoutOf(counted: number[]): HaemoLayout | null {
  const key = counted.join();
  return (Object.keys(HAEMO_LAYOUTS) as HaemoLayout[]).find((l) => HAEMO_LAYOUTS[l].join() === key) ?? null;
}
/** Where n squares counted by an older version sit on the chamber. */
function squaresFor(n: number): number[] {
  if (n <= 4) return [...HAEMO_LAYOUTS.corners];
  if (n === 5) return [...HAEMO_LAYOUTS.centre];
  return HAEMO_LAYOUTS.all.slice(0, n);
}
/** Counts another set of squares, keeping the count of every square that stays. */
export function recount(d: HaemoData, squares: number[]): HaemoData {
  const counted = [...new Set(squares)].filter((s) => Number.isInteger(s) && s >= 0 && s < CHAMBER_SQUARES).sort((a, b) => a - b);
  if (counted.length === 0) return d;
  const at = (list: string[], square: number) => list[d.counted.indexOf(square)] ?? "";
  return { ...d, counted, live: counted.map((s) => at(d.live, s)), dead: counted.map((s) => at(d.dead, s)) };
}
/** The total-mode fields that the per-square counts add up to; blank where nothing was counted. */
export function totalsOf(live: string[], dead: string[]): { total: string; totalDead: string; totalSquares: string } {
  const used = live.map((v, k) => ({ live: num(v), dead: num(dead[k] ?? "") })).filter((s): s is { live: number; dead: number | null } => s.live !== null);
  if (used.length === 0) return { total: "", totalDead: "", totalSquares: "" };
  const sum = (values: (number | null)[]) => String(Number(values.reduce((t: number, v) => t + (v ?? 0), 0).toPrecision(12)));
  return { total: sum(used.map((s) => s.live)), totalDead: used.some((s) => s.dead !== null) ? sum(used.map((s) => s.dead)) : "", totalSquares: String(used.length) };
}

/** One cell more or fewer in a counted square, as tapped. A square tapped back to nothing is blank again, so it is left out. */
export function tally(d: HaemoData, k: number, kind: "live" | "dead", by: 1 | -1): HaemoData {
  if (!(k >= 0 && k < d.counted.length)) return d;
  const whole = (v: string | undefined) => Math.max(0, Math.round(num(v ?? "") ?? 0));
  let live = whole(d.live[k]);
  let dead = d.countDead ? whole(d.dead[k]) : 0;
  if (kind === "live") live = Math.max(0, live + by);
  else dead = Math.max(0, dead + by);
  const put = (list: string[], value: string) => d.counted.map((_, j) => (j === k ? value : list[j] ?? ""));
  return { ...d, live: put(d.live, live > 0 || dead > 0 ? String(live) : ""), dead: d.countDead ? put(d.dead, dead > 0 ? String(dead) : "") : d.dead };
}

const HAEMO_MODES = ["tap", "square", "total"] as const;
export function haemoData(raw: unknown): HaemoData {
  const o = obj(raw);
  const live = arr(o.live ?? o.counts).map((v) => text(v));
  const dead = arr(o.dead).map((v) => text(v));
  const rest = {
    total: text(o.total), totalDead: text(o.totalDead), totalSquares: text(o.totalSquares, String(START_SQUARES)),
    countDead: flag(o.countDead, dead.some((v) => v.trim() !== "")), dilution: text(o.dilution), volume: quantity(o.volume, "mL", ["volume"]),
  };
  const on = (squares: number[], mode: HaemoMode, from: { live: string[]; dead: string[] }): HaemoData => (
    { mode, counted: squares, live: squares.map((_, k) => from.live[k] ?? ""), dead: squares.map((_, k) => from.dead[k] ?? ""), ...rest }
  );
  const counted = [...new Set(arr(o.counted).filter((s): s is number => typeof s === "number" && Number.isInteger(s) && s >= 0 && s < CHAMBER_SQUARES))].sort((a, b) => a - b);
  if (counted.length > 0) return on(counted, pick(o.mode, HAEMO_MODES, "square"), { live, dead });
  // Saved before the chamber picture: a plain list of up to 25 squares, placed on the chamber by how many there are.
  if (live.length > CHAMBER_SQUARES) {
    // More squares than the chamber has: keep what they add up to, as a total.
    const sums = totalsOf(live, dead);
    return { ...on(squaresFor(START_SQUARES), "total", { live: [], dead: [] }), ...(sums.total === "" ? {} : sums) };
  }
  return on(squaresFor(Math.max(START_SQUARES, live.length)), pick(o.mode, HAEMO_MODES, live.length > 0 ? "square" : "tap"), { live, dead });
}

// ── Molarity ─────────────────────────────────────────────────────────────────

export interface MolarityData { tab: "mass" | "moles" | "conc"; mw: string; conc: QText; volume: QText; mass: QText }
export function molarityData(raw: unknown): MolarityData {
  const o = obj(raw);
  return {
    tab: pick(o.tab, ["mass", "moles", "conc"] as const, "mass"),
    mw: text(o.mw),
    conc: quantity(o.conc, "mM", ["molar"]),
    volume: quantity(o.volume, "mL", ["volume"]),
    mass: quantity(o.mass, "mg", ["mass"]),
  };
}

// ── Recipe ───────────────────────────────────────────────────────────────────

export interface RecipeRow { name: string; mode: "stock" | "powder"; desired: QText; stock: QText; mw: string }
export interface RecipeData { name: string; volume: QText; solvent: string; components: RecipeRow[] }
export const newRecipeRow = (): RecipeRow => ({ name: "", mode: "stock", desired: qt("mM"), stock: qt("M"), mw: "" });
export function recipeData(raw: unknown): RecipeData {
  const o = obj(raw);
  const components = arr(o.components).map((c): RecipeRow => {
    const r = obj(c);
    const desired = quantity(r.desired, "mM", [...SOLUTION, "cells"]);
    return { name: text(r.name), mode: pick(r.mode, ["stock", "powder"] as const, "stock"), desired, stock: quantity(r.stock, desired.unit, [...SOLUTION, "cells"]), mw: text(r.mw) };
  });
  return {
    name: text(o.name),
    volume: quantity(o.volume, "mL", ["volume"]),
    solvent: text(o.solvent, "Water"),
    components: components.length ? components : [newRecipeRow()],
  };
}

// ── Master mix ───────────────────────────────────────────────────────────────

export interface MixRow { name: string; /** Work the volume out from a stock and a final concentration. */ byConc: boolean; per: QText; stock: QText; final: QText }
export interface MixData {
  name: string; reactions: string; volume: QText;
  overageMode: "percent" | "reactions"; overage: string;
  fill: boolean; fillName: string; reagents: MixRow[];
}
export const newMixRow = (): MixRow => ({ name: "", byConc: false, per: qt("µL"), stock: qt("µM"), final: qt("µM") });
export function mixData(raw: unknown): MixData {
  const o = obj(raw);
  const reagents = arr(o.reagents).map((c): MixRow => {
    const r = obj(c);
    const stock = quantity(r.stock, "µM", [...SOLUTION, "cells"]);
    return { name: text(r.name), byConc: flag(r.byConc, false), per: quantity(r.per, "µL", ["volume"]), stock, final: quantity(r.final, stock.unit, [...SOLUTION, "cells"]) };
  });
  return {
    name: text(o.name),
    reactions: text(o.reactions),
    volume: quantity(o.volume, "µL", ["volume"]),
    overageMode: pick(o.overageMode, ["percent", "reactions"] as const, "percent"),
    overage: text(o.overage, "10"),
    fill: flag(o.fill, true),
    fillName: text(o.fillName, "Water"),
    reagents: reagents.length ? reagents : [newMixRow()],
  };
}

// ── Calibration curve ────────────────────────────────────────────────────────

export interface CurveUnknown { name: string; /** Which of the two was typed; the other is read off the line. */ given: "x" | "y"; value: string }
export interface CurveData { xLabel: string; yLabel: string; origin: boolean; standards: { x: string; y: string }[]; unknowns: CurveUnknown[] }
export const START_STANDARDS = 5;
export function curveData(raw: unknown): CurveData {
  const o = obj(raw);
  const standards = arr(o.standards).map((p) => ({ x: text(obj(p).x), y: text(obj(p).y) }));
  while (standards.length < START_STANDARDS) standards.push({ x: "", y: "" });
  const unknowns = arr(o.unknowns).map((u): CurveUnknown => ({ name: text(obj(u).name), given: pick(obj(u).given, ["x", "y"] as const, "y"), value: text(obj(u).value) }));
  return {
    xLabel: text(o.xLabel, "Concentration"),
    yLabel: text(o.yLabel, "Signal"),
    origin: flag(o.origin, false),
    standards,
    unknowns: unknowns.length ? unknowns : [{ name: "", given: "y", value: "" }],
  };
}

// ── Power & sample size ──────────────────────────────────────────────────────

export type PowerTab = "size" | "power" | "effect";
export type PowerEngine = "ttest" | "count";
/** How the effect is entered in the t-test engine: a fold change (with a CV) or Cohen's d directly. */
export type EffectMode = "fold" | "d";

/** A per-assay starting point. `cv` is the typical CV (t-test) or BCV (count); `features` seeds the Bonferroni count. */
export interface PowerProfile { id: string; label: string; engine: PowerEngine; cv: string; features: string; mu: string }
export const CUSTOM_PROFILE = "custom";
export const POWER_PROFILES: PowerProfile[] = [
  { id: "rtqpcr", label: "RT-qPCR (ΔΔCt)", engine: "ttest", cv: "0.3", features: "1", mu: "20" },
  { id: "elisa", label: "ELISA / targeted assay", engine: "ttest", cv: "0.15", features: "1", mu: "20" },
  { id: "proteomics", label: "Proteomics (global LC-MS)", engine: "ttest", cv: "0.2", features: "5000", mu: "20" },
  { id: "phospho", label: "Phosphoproteomics", engine: "ttest", cv: "0.4", features: "15000", mu: "20" },
  { id: "glyco", label: "Glycoproteomics", engine: "ttest", cv: "0.4", features: "5000", mu: "20" },
  { id: "metabolomics", label: "Metabolomics", engine: "ttest", cv: "0.25", features: "1000", mu: "20" },
  { id: "rnaseq_human", label: "Bulk RNA-seq (human)", engine: "count", cv: "0.4", features: "18000", mu: "20" },
  { id: "rnaseq_model", label: "Bulk RNA-seq (cell line / model organism)", engine: "count", cv: "0.1", features: "18000", mu: "20" },
  { id: "scrnaseq", label: "scRNA-seq (pseudobulk)", engine: "count", cv: "0.5", features: "15000", mu: "20" },
  { id: "atac", label: "ATAC-seq", engine: "count", cv: "0.3", features: "80000", mu: "20" },
];
export const powerProfile = (id: string): PowerProfile | undefined => POWER_PROFILES.find((p) => p.id === id);

export interface PowerData {
  tab: PowerTab;
  /** A profile id, or CUSTOM_PROFILE once a profile value has been changed by hand. */
  profile: string;
  engine: PowerEngine;
  alpha: string;
  sides: "two" | "one";
  /** Number of features tested at once; 1 means no multiple-testing correction. */
  features: string;
  /** Target power (size and effect tabs). */
  power: string;
  /** Samples per group (power and effect tabs). */
  n: string;
  /** t-test effect: a fold change, or Cohen's d directly. */
  effectMode: EffectMode;
  fold: string;
  d: string;
  /** Count engine: log2 fold change and the mean count per group. */
  log2fc: string;
  mu: string;
  /** Typical variability: CV for the t-test, BCV for counts. */
  cv: string;
}
export function powerData(raw: unknown): PowerData {
  const o = obj(raw);
  const profile = typeof o.profile === "string" ? o.profile : "rnaseq_human";
  const base = powerProfile(profile);
  return {
    tab: pick(o.tab, ["size", "power", "effect"] as const, "size"),
    profile,
    engine: pick(o.engine, ["ttest", "count"] as const, base?.engine ?? "count"),
    alpha: text(o.alpha, "0.05"),
    sides: pick(o.sides, ["two", "one"] as const, "two"),
    features: text(o.features, base?.features ?? "1"),
    power: text(o.power, "0.8"),
    n: text(o.n, ""),
    effectMode: pick(o.effectMode, ["fold", "d"] as const, "fold"),
    fold: text(o.fold, "2"),
    d: text(o.d, "0.8"),
    log2fc: text(o.log2fc, "1"),
    mu: text(o.mu, base?.mu ?? "20"),
    cv: text(o.cv, base?.cv ?? "0.4"),
  };
}

// ── Cell lines ───────────────────────────────────────────────────────────────

export type CellLineTab = "overview" | "profile" | "seeding" | "timer" | "passages";
export interface PassageRecord { id: string; seedingDate: string; medium: string; antibiotic: string; incubation: string; note: string }

export interface CellLineData {
  tab: CellLineTab;
  /** Catalogue id a line was started from, or "custom". */
  reference: string;
  name: string;
  organism: string;
  tissue: string;
  disease: string;
  culture: "adherent" | "suspension";
  doublingTimeH: string;
  densityPerCm2: string;
  medium: string;
  mutations: string;
  receptor: string;
  maxPassages: string;
  startingPassage: string;
  details: string;
  /** Growth preview + splitting: seeding and target confluency (%). */
  seedPct: string;
  targetPct: string;
  /** Seeding calculator. */
  seedDensity: string;
  stockConc: string;
  seedVessel: string;
  seedCount: string;
  /** Splitting timer: compute from confluency, or pick a date. */
  timerMode: "calc" | "date";
  reminderAt: string;
  passages: PassageRecord[];
}

let passageSeq = 0;
export const newPassage = (seedingDate = ""): PassageRecord => ({ id: `p${Date.now().toString(36)}${passageSeq++}`, seedingDate, medium: "", antibiotic: "", incubation: "37°C, 5% CO₂", note: "" });

export function cellLineData(raw: unknown): CellLineData {
  const o = obj(raw);
  const passages = arr(o.passages).map((p): PassageRecord => {
    const r = obj(p);
    return {
      id: text(r.id) || `p${Date.now().toString(36)}${passageSeq++}`,
      seedingDate: text(r.seedingDate),
      medium: text(r.medium),
      antibiotic: text(r.antibiotic),
      incubation: text(r.incubation),
      note: text(r.note),
    };
  });
  return {
    tab: pick(o.tab, ["overview", "profile", "seeding", "timer", "passages"] as const, "overview"),
    reference: text(o.reference, "custom"),
    name: text(o.name),
    organism: text(o.organism, "Human"),
    tissue: text(o.tissue),
    disease: text(o.disease),
    culture: pick(o.culture, ["adherent", "suspension"] as const, "adherent"),
    doublingTimeH: text(o.doublingTimeH, "24"),
    densityPerCm2: text(o.densityPerCm2, "130000"),
    medium: text(o.medium, "DMEM + 10% FBS"),
    mutations: text(o.mutations),
    receptor: text(o.receptor),
    maxPassages: text(o.maxPassages, "20"),
    startingPassage: text(o.startingPassage, "0"),
    details: text(o.details),
    seedPct: text(o.seedPct, "20"),
    targetPct: text(o.targetPct, "90"),
    seedDensity: text(o.seedDensity, "15000"),
    stockConc: text(o.stockConc, "1000000"),
    seedVessel: text(o.seedVessel, "t75"),
    seedCount: text(o.seedCount, "1"),
    timerMode: pick(o.timerMode, ["calc", "date"] as const, "calc"),
    reminderAt: text(o.reminderAt),
    passages,
  };
}
