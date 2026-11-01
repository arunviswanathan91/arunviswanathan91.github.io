import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { cdnFont, pdfFamily, type FontResolver } from "./fonts.ts";
import { ResumePdf } from "./ResumePdf.tsx";
import { downloadBlob, safeFilename } from "../../../lib/download.ts";
import { pdfFilename, type ResumeData } from "../model.ts";

/** Build the PDF as a Blob. `resolve` only matters for tests (local font files). */
export async function resumePdfBlob(data: ResumeData, title: string, resolve: FontResolver = cdnFont): Promise<Blob> {
  const { pdf } = await import("@react-pdf/renderer");
  const body = pdfFamily(data.style.font, resolve);
  const nameFont = pdfFamily(data.style.nameFont === "same" ? data.style.font : data.style.nameFont, resolve);
  const doc = createElement(ResumePdf, { data, body, nameFont, title }) as unknown as ReactElement<DocumentProps>;
  return pdf(doc).toBlob();
}

export async function downloadResumePdf(data: ResumeData, title: string) {
  const blob = await resumePdfBlob(data, title);
  downloadBlob(blob, `${safeFilename(pdfFilename(title, data.profile.name), "Resume")}.pdf`);
}
