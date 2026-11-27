// Getting a plate map out of the app: a CSV, a PNG drawn from the SVG through a canvas, and
// the browser's print dialog ("Save as PDF") for the print sheet.
import { toCsv, type Plate } from "./logic.ts";
import { plateSvg } from "./svg.ts";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCsv(plates: Plate[], name: string) {
  // The byte-order mark makes spreadsheet programs read µ and other non-ASCII text correctly.
  download(new Blob(["﻿", toCsv(plates)], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
}

const PX_PER_MM = 300 / 25.4; // 300 dpi

export async function downloadPng(plate: Plate, name: string, heading?: string): Promise<void> {
  const probe = plateSvg(plate, { heading });
  const scale = Math.min(PX_PER_MM, 4096 / probe.width);
  const w = Math.round(probe.width * scale), h = Math.round(probe.height * scale);
  const { svg } = plateSvg(plate, { heading, size: () => ({ width: String(w), height: String(h) }) });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The image could not be drawn."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("The image could not be drawn.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The image could not be saved.");
    download(blob, `${name}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Open the print dialog for the sheet rendered in `.pm-print-root`. While printing, the body
 * carries `workspace-print` (the app's own print mode) and `pm-printing`, which hides
 * everything but the sheet; the page size comes from a temporary @page rule, and the document
 * title names the PDF.
 */
export function printSheet(title: string, orientation: "portrait" | "landscape") {
  const page = document.createElement("style");
  page.textContent = `@page { size: A4 ${orientation}; margin: 10mm; }`;
  document.head.appendChild(page);
  const before = document.title;
  const hadPrintClass = document.body.classList.contains("workspace-print");
  document.title = title;
  document.body.classList.add("workspace-print", "pm-printing");
  let cleaned = false;
  const clean = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("afterprint", clean);
    page.remove();
    document.title = before;
    document.body.classList.remove("pm-printing");
    if (!hadPrintClass) document.body.classList.remove("workspace-print");
  };
  window.addEventListener("afterprint", clean);
  window.print();
  // Where print() returns at once and "afterprint" never comes, tidy up when the page is used again.
  window.setTimeout(() => window.addEventListener("pointerdown", clean, { once: true }), 1000);
}
