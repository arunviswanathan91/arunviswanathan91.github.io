/** A piece of text pdf.js found on a page, with its position (PDF units, y grows upwards). */
export interface TextPiece {
  str: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Rebuild reading lines from positioned text: pieces at the same height form one line, left to
 * right, with wide gaps kept as two spaces so columns stay apart ("Date  Description  Amount").
 */
export function piecesToLines(pieces: TextPiece[]): string[] {
  const rows: { y: number; items: TextPiece[] }[] = [];
  for (const p of pieces) {
    if (!p.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - p.y) < 2.5);
    if (row) row.items.push(p);
    else rows.push({ y: p.y, items: [p] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const items = r.items.sort((a, b) => a.x - b.x);
    let line = "";
    let end = -Infinity;
    for (const it of items) {
      const gap = it.x - end;
      line += line ? (gap > 6 ? "  " : gap > 0.5 ? " " : "") : "";
      line += it.str.trim();
      end = it.x + it.width;
    }
    return line.replace(/[ \t]{3,}/g, "  ").trim();
  });
}
