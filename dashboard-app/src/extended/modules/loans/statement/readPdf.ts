import { piecesToLines } from "./lines.ts";

export class PdfPasswordError extends Error {
  constructor(public wrong: boolean) {
    super(wrong ? "That password didn’t open the PDF." : "This PDF is password protected.");
  }
}

/** Text lines of every page. pdf.js loads only when a statement is imported, and runs on the device. */
export async function readPdfLines(file: File, password?: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise;
  } catch (e) {
    if ((e as { name?: string }).name === "PasswordException") throw new PdfPasswordError(Boolean(password));
    throw new Error("Couldn’t read this PDF. Is it the statement downloaded from the bank?");
  }
  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    lines.push(...piecesToLines(content.items.flatMap((t) => ("str" in t ? [{ str: t.str, x: t.transform[4], y: t.transform[5], width: t.width }] : []))));
  }
  await doc.destroy();
  return lines;
}
