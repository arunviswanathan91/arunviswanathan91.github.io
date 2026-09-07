const LEGAL_SUFFIX =
 /\b(ltd|limited|inc|incorporated|llc|l\.l\.c|plc|gmbh|ag|bv|nv|sa|sas|s\.p\.a|pvt|private|pte|co|corp|corporation|company|foundation|trust|society|group|holdings)\b\.?/g;

/** Institutions whose short and long names both appear in the wild. */
const ORG_ALIASES: Record<string, string> = {
 iisc: "indian-institute-science", "indian institute of science": "indian-institute-science",
 rgcb: "rajiv-gandhi-centre-biotechnology",
 "rajiv gandhi centre for biotechnology": "rajiv-gandhi-centre-biotechnology",
 ncbs: "national-centre-biological-sciences",
 "national centre for biological sciences": "national-centre-biological-sciences",
 instem: "instem", "institute for stem cell science": "instem",
 ccmb: "centre-cellular-molecular-biology",
 "centre for cellular and molecular biology": "centre-cellular-molecular-biology",
 tifr: "tata-institute-fundamental-research",
 "tata institute of fundamental research": "tata-institute-fundamental-research",
 thsti: "translational-health-science-technology-institute",
 dkfz: "deutsches-krebsforschungszentrum",
 "german cancer research center": "deutsches-krebsforschungszentrum",
 embl: "european-molecular-biology-laboratory",
 "european molecular biology laboratory": "european-molecular-biology-laboratory",
 mpi: "max-planck", "max planck institute": "max-planck", "max planck society": "max-planck",
 nih: "national-institutes-health", "national institutes of health": "national-institutes-health",
 mskcc: "memorial-sloan-kettering", "memorial sloan kettering": "memorial-sloan-kettering",
};

const deaccent = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function orgKey(name: string | null): string | null {
 if (!name) return null;
 let s = deaccent(name).toLowerCase().trim();
 if (ORG_ALIASES[s]) return ORG_ALIASES[s];
 s = s.replace(/^(the|university of|universitat|universite|universidad)\s+/, "");
 s = s.replace(LEGAL_SUFFIX, " ");
 s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
 if (!s) return null;
 if (ORG_ALIASES[s]) return ORG_ALIASES[s];
 return s.split(" ").slice(0, 4).join("-");
}

const STOPWORDS = new Set([
 "a","an","the","of","for","in","at","to","and","or","with","on","position","vacancy",
 "opening","opportunity","m","f","d","w","x","full","part","time","temporary","contract","new","job",
]);

/**
 * Title reduced to comparable concepts. Folding postdoc synonyms and dropping
 * requisition ids is what lets the same vacancy match across aggregators that
 * each rewrite the headline.
 */
export function titleTokens(title: string): Set<string> {
 let s = title.toLowerCase();
 s = s.replace(/\((m\/f\/d|f\/m\/[dx]|w\/m\/d|all genders?)\)/g, " ");
 s = s.replace(/\b(job\s*)?(id|ref|req(uisition)?)\.?\s*[:#]?\s*[a-z0-9-]{3,}\b/g, " ");
 s = s.replace(/[–—-]\s*(remote|hybrid|onsite|full[- ]time|part[- ]time|fixed[- ]term|\d+\s*(yrs?|years?))\s*$/g, " ");
 s = s.replace(/[^a-z0-9\s]/g, " ");

 const out = new Set<string>();
 for (const raw of s.split(/\s+/)) {
  if (!raw || STOPWORDS.has(raw)) continue;
  if (/^(postdoc|postdoctoral|post|doctoral|pdf|pdra|prf)$/.test(raw)) { out.add("POSTDOC"); continue; }
  if (/^(researcher|scientist|fellow|associate)$/.test(raw)) { out.add("RESEARCHER"); out.add(raw); continue; }
  out.add(raw);
 }
 return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
 if (!a.size || !b.size) return 0;
 let inter = 0;
 for (const x of a) if (b.has(x)) inter++;
 return inter / (a.size + b.size - inter);
}

export const titleKey = (title: string) => [...titleTokens(title)].sort().join(" ");

/** FNV-1a over word 3-grams, folded into a 64-bit simhash. */
export function simhash(text: string): bigint {
 const words = text.split(/\s+/).filter(Boolean);
 if (words.length < 3) return 0n;
 const bits = new Array<number>(64).fill(0);
 for (let i = 0; i + 2 < words.length; i++) {
  const shingle = words[i] + " " + words[i + 1] + " " + words[i + 2];
  let h = 0xcbf29ce484222325n;
  for (let j = 0; j < shingle.length; j++) {
   h ^= BigInt(shingle.charCodeAt(j));
   h = BigInt.asUintN(64, h * 0x100000001b3n);
  }
  for (let b = 0; b < 64; b++) bits[b] += (h >> BigInt(b)) & 1n ? 1 : -1;
 }
 let out = 0n;
 for (let b = 0; b < 64; b++) if (bits[b] > 0) out |= 1n << BigInt(b);
 return BigInt.asIntN(64, out);
}

export function hamming(a: bigint, b: bigint): number {
 let x = BigInt.asUintN(64, a ^ b), n = 0;
 while (x) { x &= x - 1n; n++; }
 return n;
}

/** The four 16-bit bands, stored as columns so candidates can be pre-filtered in SQL. */
export function simhashBands(h: bigint): [number, number, number, number] {
 const u = BigInt.asUintN(64, h);
 return [
  Number((u >> 0n) & 0xffffn), Number((u >> 16n) & 0xffffn),
  Number((u >> 32n) & 0xffffn), Number((u >> 48n) & 0xffffn),
 ];
}
