// Fonts for the PDF. Web fonts come from the @fontsource files on jsDelivr (the same families the
// preview loads from Google Fonts); two keys map to the PDF's built-in fonts.
import { Font } from "@react-pdf/renderer";
import type { FontKey } from "../model.ts";

const SOURCES: Partial<Record<FontKey, string>> = {
  serif: "source-serif-4", amiri: "amiri", vollkorn: "vollkorn", lora: "lora", merriweather: "merriweather",
  garamond: "eb-garamond", crimson: "crimson-pro", sans: "dm-sans", inter: "inter", lato: "lato", opensans: "open-sans",
};
const BUILT_IN: Partial<Record<FontKey, string>> = { classic: "Times-Roman", mono: "Courier" };

export type FontResolver = (id: string, weight: 400 | 700, style: "normal" | "italic") => string;
export const cdnFont: FontResolver = (id, w, style) => `https://cdn.jsdelivr.net/npm/@fontsource/${id}/files/${id}-latin-${w}-${style}.woff`;

const done = new Set<string>();
let hyphenOff = false;

/** Register a font once and return the family name to use in styles. */
export function pdfFamily(key: FontKey, resolve: FontResolver = cdnFont): string {
  if (!hyphenOff) { Font.registerHyphenationCallback((w) => [w]); hyphenOff = true; }
  const builtIn = BUILT_IN[key];
  if (builtIn) return builtIn;
  const id = SOURCES[key] ?? "source-serif-4";
  const family = `rv-${id}`;
  if (!done.has(family)) {
    Font.register({
      family,
      fonts: ([[400, "normal"], [700, "normal"], [400, "italic"], [700, "italic"]] as const).map(([w, s]) => ({ src: resolve(id, w, s), fontWeight: w, fontStyle: s })),
    });
    done.add(family);
  }
  return family;
}
