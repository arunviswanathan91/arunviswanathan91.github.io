// The plate as an SVG drawing in millimetres. One drawing serves the print sheet (at real
// size it lines up with a real plate), the preview and the PNG. Paper colours only.
import { PAPER_TONES, allWellIds, geometry, rowLabel, wellCentre, type Plate } from "./logic.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => String(Math.round(v * 100) / 100);
const FONT = "Helvetica, Arial, sans-serif";

/** A title cut to what fits across a well: one or two lines. */
function fitTitle(title: string, perLine: number): string[] {
  const t = title.trim();
  if (!t || perLine < 2) return [];
  if (t.length <= perLine) return [t];
  const words = t.split(/\s+/);
  // Break at a space when the first word fits a line, otherwise mid-word.
  let first = words[0].length <= perLine ? words[0] : t.slice(0, perLine);
  if (words[0].length <= perLine) for (const w of words.slice(1)) { if ((first + " " + w).length > perLine) break; first += " " + w; }
  const rest = t.slice(first.length).trim();
  return [first, rest.length > perLine ? rest.slice(0, Math.max(1, perLine - 1)) + "…" : rest].filter(Boolean);
}

export interface PlateSvg { svg: string; /** Size of the drawing, mm. */ width: number; height: number }

/**
 * `heading` adds a line of text above the plate. `size` sets the width and height attributes
 * (e.g. "127.76mm" for print, pixels for a bitmap); without it the drawing takes its box's width.
 */
export function plateSvg(plate: Plate, opts: { heading?: string; size?: (width: number, height: number) => { width: string; height: string } } = {}): PlateSvg {
  const g = geometry(plate.rows, plate.cols);
  const pad = 0.5; // room for the outline's stroke
  const head = opts.heading?.trim() ? 7 : 0;
  const width = g.width + 2 * pad, height = g.height + 2 * pad + head;
  const r = g.diameter / 2;
  const labelSize = Math.min(3, g.pitch * 0.5);
  const textSize = Math.min(2.6, g.diameter * 0.27);
  const perLine = Math.floor((g.diameter * 0.86) / (textSize * 0.54));
  const out: string[] = [];
  out.push(`<rect x="0" y="0" width="${n(width)}" height="${n(height)}" fill="#ffffff"/>`);
  if (head) out.push(`<text x="${pad}" y="4.6" font-size="4" font-weight="700" fill="#111111">${esc(opts.heading!.trim())}</text>`);
  out.push(`<g transform="translate(${pad} ${n(pad + head)})">`);
  out.push(`<rect x="0" y="0" width="${n(g.width)}" height="${n(g.height)}" rx="3" fill="#ffffff" stroke="#111111" stroke-width="0.3"/>`);
  for (let c = 0; c < plate.cols; c++) out.push(`<text x="${n(g.x0 + c * g.pitch)}" y="${n(g.y0 - r - 1.2)}" font-size="${n(labelSize)}" text-anchor="middle" fill="#444444">${c + 1}</text>`);
  for (let row = 0; row < plate.rows; row++) out.push(`<text x="${n(g.x0 - r - 1.4)}" y="${n(g.y0 + row * g.pitch + labelSize * 0.36)}" font-size="${n(labelSize)}" text-anchor="end" fill="#444444">${rowLabel(row)}</text>`);
  for (const id of allWellIds(plate.rows, plate.cols)) {
    const at = wellCentre(plate.rows, plate.cols, id)!;
    const well = plate.wells[id];
    const tone = well?.color ? PAPER_TONES[well.color] : undefined;
    out.push(`<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(r)}" fill="${tone?.bg ?? "#ffffff"}" stroke="${tone?.fg ?? "#8a8a8a"}" stroke-width="${tone ? 0.35 : 0.2}"/>`);
    const lines = textSize >= 1.2 ? fitTitle(well?.title ?? "", perLine) : [];
    lines.forEach((line, i) => {
      const y = at.y + textSize * 0.35 + (i - (lines.length - 1) / 2) * textSize * 1.12;
      out.push(`<text x="${n(at.x)}" y="${n(y)}" font-size="${n(textSize)}" text-anchor="middle" fill="#111111">${esc(line)}</text>`);
    });
  }
  out.push("</g>");
  const size = opts.size?.(width, height);
  const attrs = size ? ` width="${size.width}" height="${size.height}"` : "";
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg"${attrs} viewBox="0 0 ${n(width)} ${n(height)}" font-family="${FONT}">${out.join("")}</svg>`, width, height };
}
