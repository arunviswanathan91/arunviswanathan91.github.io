// What each bench tool keeps: its inputs exactly as typed (text, so "0.50" stays "0.50").
// A saved item stores this as `data`; opening it reads it back through the functions below,
// which fill in anything missing, so an item saved by an older version still opens.
import type { BenchKind } from "../../lib/types.ts";
import { CELL_UNITS, FOLD_UNIT, MASSVOL_UNITS, MOLAR_UNITS, PERCENT_UNIT, dimensionOf, num, type Dimension, type Q } from "./calc.ts";

export type ToolId = "dilution" | "cells" | "haemocytometer" | "molarity" | "convert" | "recipe" | "mastermix" | "curve" | "timers";

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
};
/** The order of the tiles on the Bench page. */
export const TOOL_ORDER: ToolId[] = ["dilution", "cells", "haemocytometer", "molarity", "convert", "recipe", "mastermix", "curve", "timers"];
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

export interface HaemoData { live: string[]; dead: string[]; countDead: boolean; dilution: string; volume: QText }
export const START_SQUARES = 4;
export function haemoData(raw: unknown): HaemoData {
  const o = obj(raw);
  const live = arr(o.live ?? o.counts).map((v) => text(v));
  while (live.length < START_SQUARES) live.push("");
  const stored = arr(o.dead).map((v) => text(v));
  const dead = live.map((_, k) => stored[k] ?? "");
  return { live, dead, countDead: flag(o.countDead, dead.some((v) => v.trim() !== "")), dilution: text(o.dilution), volume: quantity(o.volume, "mL", ["volume"]) };
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
