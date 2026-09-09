/**
 * Hand-curated concept graph, seeded from the research tags on the public site
 * (index.html: Pancreatic Cancer, Tumor Immunology, Single-Cell & Spatial
 * Transcriptomics, Multi-omics Integration, Bayesian Modelling, Flow Cytometry,
 * Metabolomics) plus the themes running through the publication list.
 *
 * Listing the surface forms per concept is what makes "pancreatic ductal
 * adenocarcinoma" match "pancreatic cancer" without any embedding model. Eleven
 * hand-weighted concepts beat anything learned from a few hundred examples.
 */
export interface Concept { id: string; label: string; weight: number; terms: RegExp[] }

const re = (...sources: string[]) => sources.map(s => new RegExp(s, "i"));

export const ONTOLOGY: Concept[] = [
 { id: "pdac", label: "PDAC", weight: 1.0, terms: re(
   "\\bpancreatic ductal adenocarcinoma\\b", "\\bpdac\\b", "\\bpancreatic cancer\\b",
   "\\bpancreatic tumou?rs?\\b", "\\bpancreas cancer\\b", "\\bpancreatic neoplas",
 )},
 { id: "tme", label: "tumour microenvironment", weight: 0.8, terms: re(
   "\\btumou?r microenvironment\\b", "\\btme\\b", "\\bdesmoplas",
   "\\bcancer[- ]associated fibroblast", "\\bcafs?\\b", "\\bstromal? (cell|compartment)",
 )},
 { id: "cancerimm", label: "cancer immunology", weight: 0.8, terms: re(
   "\\bcancer immunolog", "\\btumou?r immunolog", "\\bimmuno[- ]?oncolog",
   "\\bimmunotherap", "\\bt[- ]cell exhaustion", "\\bmyeloid[- ]derived",
   "\\bmacrophage polaris", "\\bcheckpoint (blockade|inhibitor)", "\\btumou?r immunity",
 )},
 { id: "stat3", label: "STAT3 signalling", weight: 0.8, terms: re(
   "\\bstat3\\b", "\\bjak[/-]stat\\b", "\\bil-?6 signal",
 )},
 { id: "obesity", label: "obesity and lipid metabolism", weight: 0.75, terms: re(
   "\\bobesity\\b", "\\badipos", "\\bmetabolic reprogram", "\\blipid metabolism",
   "\\bsphingolipid", "\\bceramide", "\\bsphingosine[- ]1[- ]phosphate", "\\bs1p\\b",
 )},
 { id: "singlecell", label: "single-cell", weight: 0.6, terms: re(
   "\\bsingle[- ]cell\\b", "\\bscrna", "\\bsc[- ]?rna[- ]?seq\\b", "\\bcite-?seq\\b",
   "\\bsnrna", "\\batac[- ]?seq\\b",
 )},
 { id: "spatial", label: "spatial transcriptomics", weight: 0.6, terms: re(
   "\\bspatial transcriptom", "\\bvisium\\b", "\\bmerfish\\b", "\\bxenium\\b",
   "\\bimaging mass cytometry\\b", "\\bspatial omics\\b",
 )},
 { id: "omics", label: "multi-omics", weight: 0.6, terms: re(
   "\\bmulti[- ]?omic", "\\bproteomic", "\\blc-?ms/?ms\\b", "\\bmass spectrometr",
   "\\bmetabolomic", "\\bintegrative omics\\b",
 )},
 { id: "stats", label: "computational biology", weight: 0.55, terms: re(
   "\\bbayesian\\b", "\\bhierarchical model", "\\bcomputational biolog",
   "\\bbioinformatic", "\\bstatistical model", "\\bmachine learning\\b",
 )},
 { id: "flow", label: "flow cytometry", weight: 0.5, terms: re(
   "\\bflow cytometr", "\\bfacs\\b", "\\bcytof\\b", "\\bmass cytometr",
 )},
 { id: "broad", label: "cancer biology", weight: 0.35, terms: re(
   "\\bcancer\\b", "\\bcancer biolog", "\\boncolog", "\\btumou?r\\b", "\\bimmunolog",
   "\\btranslational research\\b", "\\bcarcinogen",
 )},
];

export interface TopicMatch { raw: number; hits: string[]; labels: string[] }

/**
 * Saturating score: two strong concepts already read as a good match, and a
 * listing that name-drops everything cannot run away with the ranking.
 */
export function topicMatch(title: string, description: string): TopicMatch {
 const body = description.slice(0, 12000);
 let raw = 0;
 const hits: string[] = [];
 const labels: string[] = [];

 for (const c of ONTOLOGY) {
  let inTitle = false;
  let count = 0;
  for (const term of c.terms) {
   if (term.test(title)) inTitle = true;
   const g = new RegExp(term.source, "gi");
   count += (body.match(g) ?? []).length;
  }
  if (!inTitle && count === 0) continue;
  hits.push(c.id);
  labels.push(c.label);
  raw += c.weight * (3 * (inTitle ? 1 : 0) + Math.min(Math.log1p(count), 2.0));
 }
 return { raw, hits, labels };
}
