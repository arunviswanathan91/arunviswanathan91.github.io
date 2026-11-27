// Bench arithmetic. Pure functions, no React: every number a tool shows comes from here.
//
// Rules that hold throughout:
// - A unit is a power of ten relative to its dimension's base unit (tables below). A conversion
//   is one scaling by the difference of two exponents, never a chain of factors.
// - Impossible or incomplete input gives null (never NaN or Infinity), with a reason to show.
// - Quantities are amounts of something: zero or negative input is rejected, not computed.

// ── Units ────────────────────────────────────────────────────────────────────

export type Dimension = "volume" | "mass" | "amount" | "molar" | "massvol" | "percent" | "fold" | "cells";

/** Power of ten of each unit relative to the base: litre, gram, mole, mol/L. */
const VOLUME: Record<string, number> = { fL: -15, pL: -12, nL: -9, "µL": -6, mL: -3, L: 0 };
const MASS: Record<string, number> = { pg: -12, ng: -9, "µg": -6, mg: -3, g: 0, kg: 3 };
const AMOUNT: Record<string, number> = { fmol: -15, pmol: -12, nmol: -9, "µmol": -6, mmol: -3, mol: 0 };
const MOLAR: Record<string, number> = { fM: -15, pM: -12, nM: -9, "µM": -6, mM: -3, M: 0 };
/** Cell-count multipliers: "e6 cells/mL" is ×10⁶ cells per mL. */
const CELL_MULTIPLIER: Record<string, number> = { "": 0, e1: 1, e2: 2, e3: 3, e6: 6, e9: 9 };

export const VOLUME_UNITS = Object.keys(VOLUME);
export const MASS_UNITS = Object.keys(MASS);
export const AMOUNT_UNITS = Object.keys(AMOUNT);
export const MOLAR_UNITS = Object.keys(MOLAR);
/** The mass-per-volume units offered in menus. Any mass unit over any volume unit is understood. */
export const MASSVOL_UNITS = ["pg/mL", "ng/mL", "µg/mL", "mg/mL", "g/mL", "ng/µL", "µg/µL", "mg/L", "g/L"];
export const CELL_UNITS = ["cells/mL", "e1 cells/mL", "e2 cells/mL", "e3 cells/mL", "e6 cells/mL", "e9 cells/mL", "cells/µL", "e3 cells/µL", "cells/L"];
export const PERCENT_UNIT = "%";
export const FOLD_UNIT = "x";

/** The menu of units for a dimension. */
export function unitsOf(dim: Dimension): string[] {
  switch (dim) {
    case "volume": return VOLUME_UNITS;
    case "mass": return MASS_UNITS;
    case "amount": return AMOUNT_UNITS;
    case "molar": return MOLAR_UNITS;
    case "massvol": return MASSVOL_UNITS;
    case "cells": return CELL_UNITS;
    case "percent": return [PERCENT_UNIT];
    case "fold": return [FOLD_UNIT];
  }
}

/** "uL" and the Greek mu are both the micro sign. */
function normalize(unit: string): string {
  return unit.trim().replace(/μ/g, "µ").replace(/^u(?=L$|g$|M$|mol$|g\/|L\b)/, "µ").replace(/\/u(?=L$)/, "/µ");
}

interface UnitInfo { dim: Dimension; exp: number }

function parseUnit(raw: string): UnitInfo | null {
  const unit = normalize(raw);
  if (unit in VOLUME) return { dim: "volume", exp: VOLUME[unit] };
  if (unit in MASS) return { dim: "mass", exp: MASS[unit] };
  if (unit in AMOUNT) return { dim: "amount", exp: AMOUNT[unit] };
  if (unit in MOLAR) return { dim: "molar", exp: MOLAR[unit] };
  if (unit === "%") return { dim: "percent", exp: 0 };
  if (unit === "x" || unit === "X" || unit === "×") return { dim: "fold", exp: 0 };
  const cells = /^(?:(e\d) )?cells\/(.+)$/.exec(unit);
  if (cells) {
    const mult = cells[1] ?? "";
    if (!(mult in CELL_MULTIPLIER) || !(cells[2] in VOLUME)) return null;
    return { dim: "cells", exp: CELL_MULTIPLIER[mult] - VOLUME[cells[2]] }; // base: cells per litre
  }
  const parts = unit.split("/");
  if (parts.length === 2 && parts[0] in MASS && parts[1] in VOLUME) return { dim: "massvol", exp: MASS[parts[0]] - VOLUME[parts[1]] }; // base: g/L
  return null;
}

export function dimensionOf(unit: string): Dimension | null {
  return parseUnit(unit)?.dim ?? null;
}

/** value × 10^exp. Dividing by an exact power of ten keeps 0.5 mL → 500 µL free of rounding noise. */
function scale(value: number, exp: number): number {
  return exp >= 0 ? value * 10 ** exp : value / 10 ** -exp;
}

const usable = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const positive = (v: number | null | undefined): v is number => usable(v) && v > 0;

/**
 * Convert within a dimension, or between molar and mass per volume when a molecular weight
 * (g/mol) is given. Null for a blank or negative value, an unknown unit, or units that do not match.
 */
export function convert(value: number | null | undefined, from: string, to: string, mw?: number | null): number | null {
  if (!usable(value) || value < 0) return null;
  const a = parseUnit(from), b = parseUnit(to);
  if (!a || !b) return null;
  let v = value;
  if (a.dim !== b.dim) {
    if (!positive(mw)) return null;
    if (a.dim === "molar" && b.dim === "massvol") v = value * mw; // mol/L × g/mol = g/L
    else if (a.dim === "massvol" && b.dim === "molar") v = value / mw;
    else return null;
  }
  const out = scale(v, a.exp - b.exp);
  return Number.isFinite(out) ? out : null;
}

// ── Reading and showing numbers ──────────────────────────────────────────────

/** A quantity as typed: the value may still be blank. */
export interface Q { value: number | null; unit: string }
/** A computed quantity. */
export interface Qty { value: number; unit: string }
/** A result, or why there is none. `incomplete`: something is still blank (not an error). */
export interface Outcome<T> { result: T | null; reason: string; incomplete: boolean }

const ok = <T>(result: T): Outcome<T> => ({ result, reason: "", incomplete: false });
const need = <T>(reason: string): Outcome<T> => ({ result: null, reason, incomplete: true });
const no = <T>(reason: string): Outcome<T> => ({ result: null, reason, incomplete: false });

/**
 * A typed number. Blank or anything that is not a plain number gives null. A single comma is
 * read as the decimal mark ("1,5" is 1.5), so a phone keyboard without a point still works;
 * grouped digits ("1,000,000" or "1.000,5") are refused rather than guessed.
 */
export function num(text: string | number | null | undefined): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  if (text == null) return null;
  let t = text.trim();
  if (!t) return null;
  if (t.includes(",")) {
    if (t.includes(".") || t.indexOf(",") !== t.lastIndexOf(",")) return null;
    t = t.replace(",", ".");
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const SUPERSCRIPT: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const superscript = (n: number) => String(n).replace(/[-\d]/g, (c) => SUPERSCRIPT[c]);

/**
 * A number for display, rounded to `sigfigs` significant figures, without floating-point noise
 * (0.1 + 0.2 shows as 0.3). Very large and very small values are written as 1.5 × 10⁶.
 */
export function fmt(value: number | null | undefined, sigfigs = 4): string {
  if (!usable(value)) return "—";
  const digits = Math.min(15, Math.max(1, Math.round(sigfigs)));
  const r = Number(value.toPrecision(digits));
  if (r === 0) return "0";
  const abs = Math.abs(r);
  if (abs >= 1e6 || abs < 1e-4) {
    const [mantissa, exponent] = r.toExponential(digits - 1).split("e");
    return `${Number(mantissa)} × 10${superscript(Number(exponent))}`;
  }
  return String(r);
}

/** How a unit is written: "x" is "×", "e6 cells/mL" is "×10⁶ cells/mL". */
export function unitLabel(unit: string): string {
  const u = normalize(unit);
  if (u === "x" || u === "X") return "×";
  const cells = /^e(\d) (cells\/.+)$/.exec(u);
  if (cells) return `×10${cells[1] === "1" ? "" : superscript(Number(cells[1]))} ${cells[2]}`;
  return u;
}

/** Units `bestUnit` chooses between, smallest first; one entry when the unit is not rescaled. */
function ladder(unit: string): string[] {
  const u = normalize(unit);
  const info = parseUnit(u);
  if (!info) return [u];
  switch (info.dim) {
    case "volume": return VOLUME_UNITS;
    case "mass": return MASS_UNITS;
    case "amount": return AMOUNT_UNITS;
    case "molar": return MOLAR_UNITS;
    case "massvol": { const per = u.split("/")[1]; return MASS_UNITS.map((m) => `${m}/${per}`); }
    case "cells": { const per = u.slice(u.indexOf("cells/")); return [per, `e3 ${per}`, `e6 ${per}`, `e9 ${per}`]; }
    default: return [u];
  }
}

/** Below this a value moves down a unit: 0.5 mL stays, 0.05 mL becomes 50 µL. */
const SMALLEST_SHOWN = 0.1;

/**
 * The same quantity in the unit of its dimension that reads most easily: the largest unit that
 * keeps the number at 0.1 or more, so it stays below 1000 and is between 1 and 1000 wherever a
 * unit allows (0.0005 mL → 0.5 µL, 1500 µL → 1.5 mL). Outside the range of units, the nearest one.
 */
export function bestUnit(value: number, unit: string): Qty {
  if (!usable(value) || value === 0) return { value, unit: normalize(unit) };
  const steps = ladder(unit);
  let best: Qty | null = null;
  for (const u of steps) {
    const v = convert(Math.abs(value), unit, u);
    if (v === null) continue;
    // Compare what will be shown: 0.09996 mL reads as 0.1 mL, so it stays in mL.
    if (best === null || Number(v.toPrecision(3)) >= SMALLEST_SHOWN) best = { value: Math.sign(value) * v, unit: u };
  }
  return best ?? { value, unit: normalize(unit) };
}

/** "0.5 mL", "10×", "1.08 ×10⁶ cells/mL". `auto` (the default) first moves to the best unit. */
export function fmtQ(q: Qty | null | undefined, sigfigs = 4, auto = true): string {
  if (!q || !usable(q.value)) return "—";
  const shown = auto ? bestUnit(q.value, q.unit) : q;
  const label = unitLabel(shown.unit);
  return label === "×" || label === "%" ? `${fmt(shown.value, sigfigs)}${label === "%" ? " %" : "×"}` : `${fmt(shown.value, sigfigs)} ${label}`;
}

// ── Dilution: C1·V1 = C2·V2 ──────────────────────────────────────────────────

const CONCENTRATIONS: Dimension[] = ["molar", "massvol", "percent", "fold", "cells"];

export type DilutionField = "c1" | "v1" | "c2" | "v2";
/** c1: stock concentration, v1: volume taken from the stock, c2: final concentration, v2: final volume. */
export interface DilutionInput { c1: Q; v1: Q; c2: Q; v2: Q }
export interface DilutionResult {
  /** The field that was blank. */
  solved: DilutionField;
  c1: Qty; v1: Qty; c2: Qty; v2: Qty;
  /** Final volume − volume from stock, in the final volume's unit. */
  diluent: Qty;
  /** How many times the stock is diluted (20 for 1 in 20). */
  fold: number;
}

/** Leave one of the four blank and it is solved. Each quantity keeps its own unit. */
export function dilution(i: DilutionInput): Outcome<DilutionResult> {
  const dc1 = dimensionOf(i.c1.unit), dc2 = dimensionOf(i.c2.unit);
  if (!dc1 || !dc2 || !CONCENTRATIONS.includes(dc1) || !CONCENTRATIONS.includes(dc2)) return no("Choose a concentration unit for the stock and for the final solution.");
  if (dc1 !== dc2) return no("The stock and final concentrations must use the same kind of unit.");
  if (dimensionOf(i.v1.unit) !== "volume" || dimensionOf(i.v2.unit) !== "volume") return no("Choose a volume unit for both volumes.");
  const fields: DilutionField[] = ["c1", "v1", "c2", "v2"];
  if (fields.some((f) => i[f].value !== null && !Number.isFinite(i[f].value))) return no("One of the values is not a number.");
  const blank = fields.filter((f) => i[f].value === null);
  if (blank.length === 0) return need("All four values are filled in. Clear the one you want to calculate.");
  if (blank.length > 1) return need("Enter any three values and the fourth is calculated.");
  if (fields.some((f) => i[f].value !== null && !((i[f].value as number) > 0))) return no("Every value must be greater than zero.");

  const solved = blank[0];
  const c1 = i.c1.value as number, v1 = i.v1.value as number, c2 = i.c2.value as number, v2 = i.v2.value as number;
  let out: number | null;
  let ratio: number | null; // final ÷ stock concentration, which is also stock volume ÷ final volume
  if (solved === "v1" || solved === "v2") {
    const c2InC1 = convert(c2, i.c2.unit, i.c1.unit);
    ratio = c2InC1 === null ? null : c2InC1 / c1;
    if (ratio === null) return no("These concentration units cannot be compared.");
    if (ratio > 1) return no("The final concentration is higher than the stock. Diluting can only lower a concentration.");
    out = solved === "v1" ? convert(v2 * ratio, i.v2.unit, i.v1.unit) : convert(v1 / ratio, i.v1.unit, i.v2.unit);
  } else {
    const v1InV2 = convert(v1, i.v1.unit, i.v2.unit);
    ratio = v1InV2 === null ? null : v1InV2 / v2;
    if (ratio === null) return no("These volume units cannot be compared.");
    if (ratio > 1) return no("The volume taken from the stock is larger than the final volume.");
    out = solved === "c2" ? convert(c1 * ratio, i.c1.unit, i.c2.unit) : convert(c2 / ratio, i.c2.unit, i.c1.unit);
  }
  if (out === null || !(out > 0) || !(ratio > 0) || !Number.isFinite(1 / ratio)) return no("These values do not give a usable result.");
  const q = (f: DilutionField): Qty => ({ value: f === solved ? out : (i[f].value as number), unit: i[f].unit });
  const stockVolume = convert(q("v1").value, i.v1.unit, i.v2.unit);
  if (stockVolume === null) return no("These volume units cannot be compared.");
  return ok({
    solved, c1: q("c1"), v1: q("v1"), c2: q("c2"), v2: q("v2"),
    diluent: { value: Math.max(0, q("v2").value - stockVolume), unit: i.v2.unit },
    fold: 1 / ratio,
  });
}

export interface SerialInput { start: Q; factor: number | null; steps: number | null; volume: Q }
export interface SerialTube { tube: number; fold: number; concentration: Qty }
export interface SerialResult {
  /** Carried from each tube into the next (and from the start solution into tube 1). */
  transfer: Qty;
  /** Put in every tube before transferring. */
  diluent: Qty;
  tubes: SerialTube[];
}

export const MAX_SERIAL_STEPS = 48;

/**
 * A dilution series. `volume` is what each tube holds after mixing (transfer + diluent), so
 * transfer = volume ÷ factor. Tube n is the start concentration ÷ factorⁿ.
 */
export function serialDilution(i: SerialInput): Outcome<SerialResult> {
  const dim = dimensionOf(i.start.unit);
  if (!dim || !CONCENTRATIONS.includes(dim)) return no("Choose a concentration unit for the starting solution.");
  if (dimensionOf(i.volume.unit) !== "volume") return no("Choose a volume unit.");
  if (i.start.value === null || i.factor === null || i.steps === null || i.volume.value === null) return need("Enter the starting concentration, the dilution factor, the number of tubes and the volume per tube.");
  if (!positive(i.start.value) || !positive(i.volume.value)) return no("The concentration and the volume must be greater than zero.");
  if (!usable(i.factor) || i.factor <= 1) return no("The dilution factor must be greater than 1 (10 for a ten-fold series).");
  if (!Number.isInteger(i.steps) || i.steps < 1) return no("The number of tubes must be a whole number, at least 1.");
  if (i.steps > MAX_SERIAL_STEPS) return no(`A series can have at most ${MAX_SERIAL_STEPS} tubes.`);
  const transfer = i.volume.value / i.factor;
  const tubes: SerialTube[] = [];
  for (let n = 1; n <= i.steps; n++) {
    const fold = i.factor ** n;
    const concentration = i.start.value / fold;
    if (!Number.isFinite(fold) || !(concentration > 0)) return no("This series runs past what can be calculated. Use fewer tubes or a smaller factor.");
    tubes.push({ tube: n, fold, concentration: { value: concentration, unit: i.start.unit } });
  }
  return ok({ transfer: { value: transfer, unit: i.volume.unit }, diluent: { value: i.volume.value - transfer, unit: i.volume.unit }, tubes });
}

// ── Cells ────────────────────────────────────────────────────────────────────

/** C1·V1 = C2·V2 for a cell suspension: concentrations in cells per volume. */
export function cellDilution(i: DilutionInput): Outcome<DilutionResult> {
  if (dimensionOf(i.c1.unit) !== "cells" || dimensionOf(i.c2.unit) !== "cells") return no("Cell concentrations must be in cells per volume.");
  return dilution(i);
}

export interface SeedingInput {
  cellsPerWell: number | null;
  wells: number | null;
  /** Extra, in percent of the wells (10 makes 10 % more mix than needed). Blank is none. */
  overagePct: number | null;
  volumePerWell: Q;
  /** Concentration of the cell suspension you have. */
  stock: Q;
}
export interface SeedingResult {
  /** Wells' worth of mix, overage included. */
  portions: number;
  totalCells: number;
  totalVolume: Qty;
  suspension: Qty;
  medium: Qty;
  /** Concentration of the seeding mix. */
  mix: Qty;
}

/** The seeding mix for a plate: how much cell suspension and how much medium. Volumes in the per-well unit. */
export function seeding(i: SeedingInput): Outcome<SeedingResult> {
  if (dimensionOf(i.volumePerWell.unit) !== "volume") return no("Choose a volume unit for the volume per well.");
  if (dimensionOf(i.stock.unit) !== "cells") return no("The cell suspension must be in cells per volume.");
  if (i.cellsPerWell === null || i.wells === null || i.volumePerWell.value === null || i.stock.value === null) return need("Enter the cells per well, the number of wells, the volume per well and the concentration of your suspension.");
  if (!positive(i.cellsPerWell) || !positive(i.volumePerWell.value) || !positive(i.stock.value)) return no("Cells per well, volume per well and the suspension concentration must be greater than zero.");
  if (!Number.isInteger(i.wells) || i.wells < 1) return no("The number of wells must be a whole number, at least 1.");
  const overage = i.overagePct ?? 0;
  if (!usable(overage) || overage < 0) return no("The overage cannot be negative.");
  const unit = i.volumePerWell.unit;
  const portions = i.wells * (1 + overage / 100);
  const totalCells = i.cellsPerWell * portions;
  const totalVolume = i.volumePerWell.value * portions;
  const perUnit = convert(i.stock.value, i.stock.unit, `cells/${unit}`); // cells in one per-well volume unit
  const perMl = convert(i.volumePerWell.value, unit, "mL");
  if (perUnit === null || perMl === null || !(perUnit > 0) || !(perMl > 0)) return no("These units cannot be compared.");
  const suspension = totalCells / perUnit;
  if (!Number.isFinite(suspension) || !Number.isFinite(totalVolume)) return no("These values are too large to calculate.");
  if (suspension > totalVolume * (1 + 1e-12)) return no("The suspension is too dilute for this density: it would take more suspension than the wells hold. Spin the cells down and resuspend them in less medium.");
  return ok({
    portions, totalCells,
    totalVolume: { value: totalVolume, unit },
    suspension: { value: suspension, unit },
    medium: { value: Math.max(0, totalVolume - suspension), unit },
    mix: { value: i.cellsPerWell / perMl, unit: "cells/mL" },
  });
}

/** One large square of a haemocytometer: 1 mm × 1 mm × 0.1 mm = 0.1 µL, so 10⁴ squares per mL. */
export const SQUARES_PER_ML = 1e4;
/** Mean cells per square that count reliably. */
export const COUNT_RANGE = { min: 20, max: 100 };

export interface HaemocytometerInput {
  /** Live cells in each counted large square; blank squares are left out. */
  live: (number | null)[];
  /** Dead (stained) cells per square, matched by position. A blank next to a live count is 0. */
  dead?: (number | null)[];
  /** 2 for one part cells to one part trypan blue; 1 if undiluted. */
  dilution: number | null;
  /** Volume of the suspension the sample came from, for the total cell number. */
  volume?: Q;
}
export interface HaemocytometerResult {
  squares: number;
  meanLive: number;
  /** Null when no dead cells were counted. */
  meanDead: number | null;
  livePerMl: number;
  deadPerMl: number | null;
  /** Live + dead; equals livePerMl when no dead cells were counted. */
  totalPerMl: number;
  /** Percent live; null without dead counts or without any cells. */
  viability: number | null;
  /** In the whole suspension; null without a volume. */
  totalLiveCells: number | null;
  totalCells: number | null;
  /** The mean count per square (live + dead) is outside the reliable range. */
  warning: "low" | "high" | null;
}

export function haemocytometer(i: HaemocytometerInput): Outcome<HaemocytometerResult> {
  const used = i.live.map((n, k) => ({ live: n, dead: i.dead?.[k] ?? null })).filter((s): s is { live: number; dead: number | null } => s.live !== null);
  if (used.length === 0) return need("Enter the count for at least one square.");
  if (used.some((s) => !usable(s.live) || (s.dead !== null && !usable(s.dead)))) return no("One of the counts is not a number.");
  if (used.some((s) => s.live < 0 || (s.dead ?? 0) < 0)) return no("Counts cannot be negative.");
  if (i.dilution === null) return need("Enter the dilution factor (1 if the sample was not diluted).");
  if (!usable(i.dilution) || i.dilution < 1) return no("The dilution factor must be 1 or more (2 for one part cells to one part trypan blue).");
  const hasDead = used.some((s) => s.dead !== null);
  const sumLive = used.reduce((t, s) => t + s.live, 0);
  const sumDead = used.reduce((t, s) => t + (s.dead ?? 0), 0);
  const meanLive = sumLive / used.length;
  const meanDead = sumDead / used.length;
  const livePerMl = meanLive * i.dilution * SQUARES_PER_ML;
  const deadPerMl = meanDead * i.dilution * SQUARES_PER_ML;
  if (!Number.isFinite(livePerMl) || !Number.isFinite(deadPerMl)) return no("These values are too large to calculate.");
  let ml: number | null = null;
  if (i.volume && i.volume.value !== null) {
    ml = convert(i.volume.value, i.volume.unit, "mL");
    if (ml === null || !(ml > 0)) return no("The suspension volume must be a volume greater than zero.");
  }
  const meanCount = meanLive + (hasDead ? meanDead : 0);
  return ok({
    squares: used.length,
    meanLive,
    meanDead: hasDead ? meanDead : null,
    livePerMl,
    deadPerMl: hasDead ? deadPerMl : null,
    totalPerMl: livePerMl + (hasDead ? deadPerMl : 0),
    viability: hasDead && sumLive + sumDead > 0 ? (100 * sumLive) / (sumLive + sumDead) : null,
    totalLiveCells: ml === null ? null : livePerMl * ml,
    totalCells: ml === null ? null : (livePerMl + (hasDead ? deadPerMl : 0)) * ml,
    warning: meanCount < COUNT_RANGE.min ? "low" : meanCount > COUNT_RANGE.max ? "high" : null,
  });
}

// ── Molarity ─────────────────────────────────────────────────────────────────

const MW_NEEDED = "Enter the molecular weight in g/mol.";
const MW_INVALID = "The molecular weight must be greater than zero.";

/** Mass to weigh for a molar solution: mass = concentration × volume × molecular weight. */
export function massToWeigh(i: { concentration: Q; volume: Q; mw: number | null }): Outcome<{ mass: Qty; moles: Qty }> {
  if (dimensionOf(i.concentration.unit) !== "molar") return no("The concentration must be molar (for example mM).");
  if (dimensionOf(i.volume.unit) !== "volume") return no("Choose a volume unit.");
  if (i.concentration.value === null || i.volume.value === null) return need("Enter the concentration and the volume.");
  if (i.mw === null) return need(MW_NEEDED);
  if (!positive(i.mw)) return no(MW_INVALID);
  if (!positive(i.concentration.value) || !positive(i.volume.value)) return no("The concentration and the volume must be greater than zero.");
  const molar = convert(i.concentration.value, i.concentration.unit, "M");
  const litres = convert(i.volume.value, i.volume.unit, "L");
  if (molar === null || litres === null) return no("These units cannot be used here.");
  const moles = molar * litres;
  const mass = moles * i.mw;
  if (!Number.isFinite(mass) || !(mass > 0)) return no("These values do not give a usable result.");
  return ok({ mass: { value: mass, unit: "g" }, moles: { value: moles, unit: "mol" } });
}

/** Amount of substance in a mass: moles = mass ÷ molecular weight. */
export function molesFromMass(i: { mass: Q; mw: number | null }): Outcome<Qty> {
  if (dimensionOf(i.mass.unit) !== "mass") return no("Choose a mass unit.");
  if (i.mass.value === null) return need("Enter the mass.");
  if (i.mw === null) return need(MW_NEEDED);
  if (!positive(i.mw)) return no(MW_INVALID);
  if (!positive(i.mass.value)) return no("The mass must be greater than zero.");
  const grams = convert(i.mass.value, i.mass.unit, "g");
  if (grams === null) return no("This unit cannot be used here.");
  const moles = grams / i.mw;
  if (!Number.isFinite(moles) || !(moles > 0)) return no("These values do not give a usable result.");
  return ok({ value: moles, unit: "mol" });
}

/** Concentration of a mass dissolved in a volume: molar (mass ÷ MW ÷ volume) and mass per volume. */
export function concentrationFrom(i: { mass: Q; volume: Q; mw: number | null }): Outcome<{ molar: Qty; massvol: Qty }> {
  if (dimensionOf(i.mass.unit) !== "mass") return no("Choose a mass unit.");
  if (dimensionOf(i.volume.unit) !== "volume") return no("Choose a volume unit.");
  if (i.mass.value === null || i.volume.value === null) return need("Enter the mass and the volume.");
  if (i.mw === null) return need(MW_NEEDED);
  if (!positive(i.mw)) return no(MW_INVALID);
  if (!positive(i.mass.value) || !positive(i.volume.value)) return no("The mass and the volume must be greater than zero.");
  const grams = convert(i.mass.value, i.mass.unit, "g");
  const litres = convert(i.volume.value, i.volume.unit, "L");
  if (grams === null || litres === null || !(litres > 0)) return no("These units cannot be used here.");
  const massvol = grams / litres;
  const molar = massvol / i.mw;
  if (!Number.isFinite(molar) || !(molar > 0)) return no("These values do not give a usable result.");
  return ok({ molar: { value: molar, unit: "M" }, massvol: { value: massvol, unit: "g/L" } });
}

// ── Recipe (medium or buffer) ────────────────────────────────────────────────

export interface RecipeComponent {
  name: string;
  /** "stock": pipetted from a stock solution. "powder": weighed. */
  mode: "stock" | "powder";
  /** Concentration wanted in the finished solution. For a powder: molar, mass per volume, or % (w/v). */
  desired: Q;
  /** The stock's concentration (stock mode). */
  stock?: Q;
  /** g/mol: needed for a powder given in molar units, or to mix molar and mass-per-volume units. */
  mw?: number | null;
}
export interface RecipeLine {
  name: string;
  mode: "stock" | "powder";
  /** A volume (stock) in the final volume's unit, or a mass (powder) in grams. Null: see `reason`. */
  amount: Qty | null;
  /** Why there is no amount. Empty while the line is just unfinished. */
  reason: string;
}
export interface RecipeResult {
  lines: RecipeLine[];
  /** Sum of the stock volumes; null until every stock line has an amount. */
  liquid: Qty | null;
  /** Final volume − stock volumes. Powders are taken not to add volume. */
  solvent: Qty | null;
  /** Why there is no solvent volume. Empty while the recipe is just unfinished. */
  reason: string;
}

/** Each component's amount for a final volume, and the solvent to top up with. Rescale by changing `volume`. */
export function recipe(i: { volume: Q; components: RecipeComponent[] }): RecipeResult {
  const blank = (reason: string): RecipeResult => ({ lines: i.components.map((c) => ({ name: c.name, mode: c.mode, amount: null, reason: "" })), liquid: null, solvent: null, reason });
  if (dimensionOf(i.volume.unit) !== "volume") return blank("Choose a volume unit for the final volume.");
  if (i.volume.value === null) return blank("");
  if (!positive(i.volume.value)) return blank("The final volume must be greater than zero.");
  const total = i.volume.value, unit = i.volume.unit;
  const litres = convert(total, unit, "L");
  if (litres === null) return blank("This volume unit cannot be used here.");

  const lines = i.components.map((c): RecipeLine => {
    const line = (amount: Qty | null, reason = ""): RecipeLine => ({ name: c.name, mode: c.mode, amount, reason });
    const dim = dimensionOf(c.desired.unit);
    if (!dim || !CONCENTRATIONS.includes(dim)) return line(null, "Choose a concentration unit.");
    const mw = c.mw ?? null;
    if (mw !== null && !positive(mw)) return line(null, MW_INVALID);
    if (c.desired.value !== null && !positive(c.desired.value)) return line(null, "The concentration must be greater than zero.");
    if (c.mode === "stock") {
      const stock = c.stock;
      if (!stock) return line(null);
      const stockDim = dimensionOf(stock.unit);
      if (!stockDim || !CONCENTRATIONS.includes(stockDim)) return line(null, "Choose a concentration unit for the stock.");
      if (stock.value !== null && !positive(stock.value)) return line(null, "The stock concentration must be greater than zero.");
      const mixed = stockDim !== dim;
      if (mixed && !((dim === "molar" && stockDim === "massvol") || (dim === "massvol" && stockDim === "molar"))) return line(null, "The wanted and stock concentrations must use the same kind of unit.");
      if (c.desired.value === null || stock.value === null) return line(null);
      if (mixed && mw === null) return line(null, "Enter the molecular weight to combine molar and mass-per-volume units.");
      const wanted = convert(c.desired.value, c.desired.unit, stock.unit, mw);
      if (wanted === null) return line(null, "These concentration units cannot be compared.");
      const ratio = wanted / stock.value;
      if (ratio > 1) return line(null, "The wanted concentration is higher than the stock.");
      const volume = total * ratio;
      return Number.isFinite(volume) && volume > 0 ? line({ value: volume, unit }) : line(null, "These values do not give a usable result.");
    }
    if (dim !== "molar" && dim !== "massvol" && dim !== "percent") return line(null, "For a powder use a molar, mass-per-volume or % (w/v) concentration.");
    if (c.desired.value === null) return line(null);
    let gramsPerLitre: number | null;
    if (dim === "molar") {
      if (mw === null) return line(null, MW_NEEDED);
      gramsPerLitre = convert(c.desired.value, c.desired.unit, "g/L", mw);
    } else if (dim === "massvol") gramsPerLitre = convert(c.desired.value, c.desired.unit, "g/L");
    else gramsPerLitre = c.desired.value * 10; // 1 % (w/v) = 1 g per 100 mL = 10 g/L
    if (gramsPerLitre === null) return line(null, "This unit cannot be used here.");
    const mass = gramsPerLitre * litres;
    return Number.isFinite(mass) && mass > 0 ? line({ value: mass, unit: "g" }) : line(null, "These values do not give a usable result.");
  });

  const stocks = lines.filter((l) => l.mode === "stock");
  if (stocks.some((l) => !l.amount)) return { lines, liquid: null, solvent: null, reason: "" };
  const liquid = stocks.reduce((t, l) => t + (l.amount as Qty).value, 0);
  const rest = total - liquid;
  // Parts that add up to exactly the final volume may miss it by a rounding error.
  if (rest < -1e-9 * total) return { lines, liquid: { value: liquid, unit }, solvent: null, reason: "The stock volumes add up to more than the final volume. Use more concentrated stocks or weigh a component as powder." };
  return { lines, liquid: { value: liquid, unit }, solvent: { value: Math.max(0, rest), unit }, reason: "" };
}

// ── Master mix ───────────────────────────────────────────────────────────────

export interface MixReagent {
  name: string;
  /** Volume in one reaction. Ignored when both stock and final concentration are given. */
  perReaction?: Q;
  stock?: Q;
  final?: Q;
}
export interface MasterMixInput {
  reactions: number | null;
  reactionVolume: Q;
  /** Extra mix: a percentage on top, or a number of extra reactions. Blank is none. */
  overage: { mode: "percent" | "reactions"; value: number | null };
  reagents: MixReagent[];
  /** Add a solvent row that fills each reaction up to the reaction volume. */
  fill: boolean;
}
export interface MixLine {
  name: string;
  perReaction: Qty | null;
  /** Per reaction × reactions, overage included. */
  total: Qty | null;
  reason: string;
}
export interface MasterMixResult {
  /** Reactions' worth of mix: reactions × (1 + overage), or reactions + extra. */
  portions: number;
  lines: MixLine[];
  /** The solvent row; null when not asked for. */
  fill: MixLine | null;
  /** Everything in one reaction, and in the whole mix; null until every row has a volume. */
  perReaction: Qty | null;
  total: Qty | null;
  /** A problem with the volumes (they exceed the reaction volume). */
  reason: string;
}

export function masterMix(i: MasterMixInput): Outcome<MasterMixResult> {
  if (dimensionOf(i.reactionVolume.unit) !== "volume") return no("Choose a volume unit for the reaction volume.");
  if (i.reactions === null || i.reactionVolume.value === null) return need("Enter the number of reactions and the volume per reaction.");
  if (!Number.isInteger(i.reactions) || i.reactions < 1) return no("The number of reactions must be a whole number, at least 1.");
  if (!positive(i.reactionVolume.value)) return no("The reaction volume must be greater than zero.");
  const extra = i.overage.value ?? 0;
  if (!usable(extra) || extra < 0) return no("The overage cannot be negative.");
  const portions = i.overage.mode === "percent" ? i.reactions * (1 + extra / 100) : i.reactions + extra;
  const volume = i.reactionVolume.value, unit = i.reactionVolume.unit;
  if (!Number.isFinite(portions) || !Number.isFinite(volume * portions)) return no("These values are too large to calculate.");

  let sum = 0; // per reaction, in the reaction volume's unit
  let complete = true;
  const lines = i.reagents.map((r): MixLine => {
    const fail = (reason = ""): MixLine => { complete = false; return { name: r.name, perReaction: null, total: null, reason }; };
    let per: Qty;
    if (r.stock && r.final && r.stock.value !== null && r.final.value !== null) {
      const ds = dimensionOf(r.stock.unit), df = dimensionOf(r.final.unit);
      if (!ds || !df || !CONCENTRATIONS.includes(ds) || ds !== df) return fail("The stock and final concentrations must use the same kind of unit.");
      if (!positive(r.stock.value) || !positive(r.final.value)) return fail("The concentrations must be greater than zero.");
      const wanted = convert(r.final.value, r.final.unit, r.stock.unit);
      if (wanted === null) return fail("These concentration units cannot be compared.");
      const ratio = wanted / r.stock.value;
      if (ratio > 1) return fail("The final concentration is higher than the stock.");
      per = { value: volume * ratio, unit };
    } else if (r.perReaction && r.perReaction.value !== null) {
      if (dimensionOf(r.perReaction.unit) !== "volume") return fail("Choose a volume unit.");
      if (!positive(r.perReaction.value)) return fail("The volume must be greater than zero.");
      per = { value: r.perReaction.value, unit: r.perReaction.unit };
    } else return fail();
    const inUnit = convert(per.value, per.unit, unit);
    if (inUnit === null || !Number.isFinite(per.value * portions) || !(per.value > 0)) return fail("These values do not give a usable result.");
    sum += inUnit;
    return { name: r.name, perReaction: per, total: { value: per.value * portions, unit: per.unit }, reason: "" };
  });

  let reason = "";
  let fill: MixLine | null = null;
  const over = sum > volume * (1 + 1e-9);
  if (i.fill) {
    if (!complete) fill = { name: "", perReaction: null, total: null, reason: "" };
    else if (over) {
      reason = "The reagents add up to more than the reaction volume, so there is no room left to fill.";
      fill = { name: "", perReaction: null, total: null, reason };
    } else {
      const rest = Math.max(0, volume - sum);
      fill = { name: "", perReaction: { value: rest, unit }, total: { value: rest * portions, unit }, reason: "" };
      sum = volume;
    }
  } else if (over) reason = "The reagents add up to more than the reaction volume.";
  const done = complete && !(i.fill && over);
  if (!Number.isFinite(sum * portions)) return no("These values are too large to calculate.");
  return ok({
    portions, lines, fill,
    perReaction: done ? { value: sum, unit } : null,
    total: done ? { value: sum * portions, unit } : null,
    reason,
  });
}

// ── Calibration curve ────────────────────────────────────────────────────────

export interface Point { x: number; y: number }
export interface Fit {
  slope: number;
  intercept: number;
  /** Null when every y is the same (nothing to explain). Through the origin it is the uncentred
   *  R² = 1 − Σ(y − slope·x)² ÷ Σy², the usual definition for a fit without an intercept. */
  r2: number | null;
  /** Points used. */
  n: number;
  throughOrigin: boolean;
}

/**
 * Straight line through the standards by least squares. Null with fewer than two different x
 * values (one, not at zero, when forced through the origin).
 */
export function linearFit(points: Point[], throughOrigin = false): Fit | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n === 0) return null;
  if (throughOrigin) {
    const sxx = pts.reduce((t, p) => t + p.x * p.x, 0);
    if (!(sxx > 0)) return null;
    const slope = pts.reduce((t, p) => t + p.x * p.y, 0) / sxx;
    const syy = pts.reduce((t, p) => t + p.y * p.y, 0);
    const res = pts.reduce((t, p) => t + (p.y - slope * p.x) ** 2, 0);
    if (!Number.isFinite(slope)) return null;
    return { slope, intercept: 0, r2: syy > 0 ? 1 - res / syy : null, n, throughOrigin: true };
  }
  const mx = pts.reduce((t, p) => t + p.x, 0) / n;
  const my = pts.reduce((t, p) => t + p.y, 0) / n;
  const sxx = pts.reduce((t, p) => t + (p.x - mx) ** 2, 0);
  if (new Set(pts.map((p) => p.x)).size < 2 || !(sxx > 0)) return null;
  const slope = pts.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) / sxx;
  const intercept = my - slope * mx;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;
  const tot = pts.reduce((t, p) => t + (p.y - my) ** 2, 0);
  const res = pts.reduce((t, p) => t + (p.y - (intercept + slope * p.x)) ** 2, 0);
  return { slope, intercept, r2: tot > 0 ? 1 - res / tot : null, n, throughOrigin: false };
}

/** y on the fitted line at x. */
export function predictY(fit: Fit | null, x: number | null): number | null {
  if (!fit || !usable(x)) return null;
  const y = fit.intercept + fit.slope * x;
  return Number.isFinite(y) ? y : null;
}

/** x on the fitted line at y (reading an unknown off the curve). Null for a flat line. */
export function predictX(fit: Fit | null, y: number | null): number | null {
  if (!fit || !usable(y) || fit.slope === 0) return null;
  const x = (y - fit.intercept) / fit.slope;
  return Number.isFinite(x) ? x : null;
}

/**
 * Two columns pasted from a spreadsheet: one pair per line, split on tabs (or semicolons,
 * or spaces, or a single comma). Lines without two numbers, such as a header, are skipped.
 */
export function parsePairs(text: string): Point[] {
  const out: Point[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.includes("\t") ? line.split("\t") : line.includes(";") ? line.split(";") : /\s/.test(line) ? line.split(/\s+/) : line.split(",");
    const x = num(cells[0]), y = num(cells[1]);
    if (cells.length >= 2 && x !== null && y !== null) out.push({ x, y });
  }
  return out;
}

/** Round axis ticks covering min…max: about `target` of them, at 1, 2 or 5 × a power of ten. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min > max) [min, max] = [max, min];
  if (min === max) { const pad = Math.abs(min) || 1; min -= pad; max += pad; }
  const rough = (max - min) / Math.max(1, target);
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
  if (!(step > 0) || !Number.isFinite(step)) return [];
  const first = Math.floor(min / step), last = Math.ceil(max / step);
  const ticks: number[] = [];
  for (let k = first; k <= last && ticks.length < 50; k++) ticks.push(Number((k * step).toPrecision(12)));
  return ticks;
}
