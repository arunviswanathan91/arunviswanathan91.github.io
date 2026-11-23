// What the public profile page shows. Published as one document; the page
// (js/site-content.js in the site root) reads the same shape.

export interface SitePublication { year: string; authors: string; title: string; venue: string; url: string; badge: string }
export interface SitePresentation { year: string; title: string; venue: string; url: string; note: string }
export interface SiteTimelineEntry { role: string; org: string; date: string }
export const LINK_KEYS = ["orcid", "scholar", "researchgate", "github", "linkedin"] as const;
export type LinkKey = (typeof LINK_KEYS)[number];
export const LINK_LABELS: Record<LinkKey, string> = { orcid: "ORCID", scholar: "Google Scholar", researchgate: "ResearchGate", github: "GitHub", linkedin: "LinkedIn" };

export interface SiteContent {
  tagline: string;
  location: string;
  bio: string;
  /** Empty: the file that ships with the site. */
  photo_url: string;
  cv_url: string;
  links: Record<LinkKey, string>;
  interests: string[];
  publications: SitePublication[];
  presentations: SitePresentation[];
  awards: string[];
  experience: SiteTimelineEntry[];
  education: SiteTimelineEntry[];
  emails: string[];
  address: string;
}

/** The page as it was written by hand, so the first edit starts from what is live. */
export const STARTER: SiteContent = {
  tagline: "PhD Candidate & Senior Research Fellow at Rajiv Gandhi Centre for Biotechnology (RGCB)",
  location: "Thiruvananthapuram, Kerala, India",
  bio: "I am a PhD candidate and Senior Research Fellow at RGCB, working on obesity-driven pancreatic ductal adenocarcinoma (PDAC) under Dr. K. B. Harikumar. My work centres on STAT3 signalling and how it reshapes the tumour immune microenvironment, and draws on a range of methods depending on the question, including spatial transcriptomics, LC-MS/MS proteomics, metabolomics, and Bayesian statistical modelling, to understand how obesity drives pancreatic cancer progression. My academic foundation is in Biochemistry & Molecular Biology (Pondicherry University).",
  photo_url: "",
  cv_url: "",
  links: {
    orcid: "https://orcid.org/0000-0002-5682-5170",
    scholar: "https://scholar.google.com/citations?user=lwKlI8EAAAAJ&hl=en",
    researchgate: "https://www.researchgate.net/profile/Arun-Viswanathan",
    github: "https://github.com/arunviswanathan91",
    linkedin: "https://www.linkedin.com/in/arungeethaviswanathan",
  },
  interests: ["Pancreatic Cancer", "Tumor Immunology", "Single-Cell & Spatial Transcriptomics", "Multi-omics Integration", "Bayesian Modelling", "Flow Cytometry", "Metabolomics"],
  publications: [
    { year: "2026", authors: "Viswanathan A, Seby J, Harikumar KB.", title: "Overweight status drives early tumor microenvironment reprogramming in pancreatic ductal adenocarcinoma: a cell-type-resolved Bayesian hierarchical modeling and interactome analysis.", venue: "bioRxiv.", url: "", badge: "Preprint" },
    { year: "2026", authors: "Keerthana CK, Rayginia TP, Kalimuthu K, et al., **Viswanathan A**, et al.", title: "Uttroside B, a US FDA-designated “Orphan Drug,” mitigates the development of hepatocellular carcinoma and its pulmonary metastasis via EGFR/ERK-mediated inhibition of SREBP-1 and STAT-3.", venue: "Cell Death Discovery.", url: "", badge: "" },
    { year: "2024", authors: "Vijayan Y, James S, **Viswanathan A**, Aparna JS, Bindu A, et al.", title: "Targeting acid ceramidase enhances antitumor immune response in colorectal cancer.", venue: "Journal of Advanced Research, 65, 73–87.", url: "", badge: "" },
    { year: "2023", authors: "Mohammed S, Bindu A, **Viswanathan A**, Harikumar KB.", title: "Sphingosine 1-phosphate signaling during infection and immunity.", venue: "Progress in Lipid Research, 92, 101251.", url: "", badge: "" },
    { year: "2018", authors: "Subastri A, **Viswanathan A**, Sharma P, et al.", title: "Synthesis and characterisation of arsenic nanoparticles and its interaction with DNA and cytotoxic potential on breast cancer cells.", venue: "Chemico-Biological Interactions, 295, 73–83.", url: "", badge: "" },
  ],
  presentations: [
    { year: "2026", title: "STAT3-Mediated Immune Dysfunction and… (Abstract P29)", venue: "Cancer Research, 86(13_Supplement).", url: "https://aacrjournals.org/cancerres/article/86/13_Supplement/P29/786022/Abstract-P29-STAT3-Mediated-Immune-Dysfunction-And", note: "Presented with support of the Travel Award, Frontiers in Cancer Science 2025 (Singapore)." },
  ],
  awards: [
    "Best Oral Presentation (2nd place), Global Cancer Consortium Conference (GCC 2024)",
    "Best Poster Presentation (Top 5), National Symposium for Biotechnology for Sustainable Development, 2025",
    "Travel Award, Frontiers in Cancer Science 2025, Singapore",
  ],
  experience: [
    { role: "Senior Research Fellow & PhD Candidate", org: "Rajiv Gandhi Centre for Biotechnology", date: "2022 – present" },
    { role: "Junior Research Fellow & PhD Candidate", org: "Rajiv Gandhi Centre for Biotechnology", date: "2020 – 2022" },
    { role: "Guest Lecturer", org: "Al Salama College of Optometry & Management Studies", date: "2017 – 2020" },
  ],
  education: [
    { role: "PhD, Biotechnology", org: "Rajiv Gandhi Centre for Biotechnology", date: "2020 – present" },
    { role: "M.Sc., Biochemistry & Molecular Biology", org: "Pondicherry University", date: "2014 – 2016" },
    { role: "B.Sc.Ed.", org: "Regional Institute of Education, Mysore", date: "2009 – 2013" },
  ],
  emails: ["arunviswanathan91@gmail.com", "arunv@rgcb.res.in"],
  address: "Rajiv Gandhi Centre for Biotechnology, Thiruvananthapuram, Kerala, India",
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strings = (v: unknown, fallback: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : fallback);
function rows<T extends object>(v: unknown, blank: T, fallback: T[]): T[] {
  if (!Array.isArray(v)) return fallback;
  return v.filter((x) => x && typeof x === "object").map((x) => {
    const out = { ...blank } as Record<string, string>;
    for (const k of Object.keys(blank)) out[k] = str((x as Record<string, unknown>)[k]);
    return out as T;
  });
}

export const BLANK_PUBLICATION: SitePublication = { year: "", authors: "", title: "", venue: "", url: "", badge: "" };
export const BLANK_PRESENTATION: SitePresentation = { year: "", title: "", venue: "", url: "", note: "" };
export const BLANK_ENTRY: SiteTimelineEntry = { role: "", org: "", date: "" };

/** A complete document from whatever is stored; anything missing comes from the starter. */
export function normalizeSite(raw: unknown): SiteContent {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const links = (r.links && typeof r.links === "object" ? r.links : {}) as Record<string, unknown>;
  return {
    tagline: str(r.tagline, STARTER.tagline),
    location: str(r.location, STARTER.location),
    bio: str(r.bio, STARTER.bio),
    photo_url: str(r.photo_url),
    cv_url: str(r.cv_url),
    links: Object.fromEntries(LINK_KEYS.map((k) => [k, str(links[k], r.links ? "" : STARTER.links[k])])) as Record<LinkKey, string>,
    interests: strings(r.interests, STARTER.interests),
    publications: rows(r.publications, BLANK_PUBLICATION, STARTER.publications),
    presentations: rows(r.presentations, BLANK_PRESENTATION, STARTER.presentations),
    awards: strings(r.awards, STARTER.awards),
    experience: rows(r.experience, BLANK_ENTRY, STARTER.experience),
    education: rows(r.education, BLANK_ENTRY, STARTER.education),
    emails: strings(r.emails, STARTER.emails),
    address: str(r.address, STARTER.address),
  };
}

/** What gets published: trimmed, with empty lines and untitled entries dropped. */
export function cleanSite(c: SiteContent): SiteContent {
  const t = (s: string) => s.trim();
  const trimRow = <T extends object>(row: T) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, t(v as string)])) as T;
  return {
    ...c,
    tagline: t(c.tagline), location: t(c.location), bio: t(c.bio), address: t(c.address),
    links: trimRow(c.links),
    interests: c.interests.map(t).filter(Boolean),
    awards: c.awards.map(t).filter(Boolean),
    emails: c.emails.map(t).filter(Boolean),
    publications: c.publications.map(trimRow).filter((p) => p.title),
    presentations: c.presentations.map(trimRow).filter((p) => p.title),
    experience: c.experience.map(trimRow).filter((e) => e.role),
    education: c.education.map(trimRow).filter((e) => e.role),
  };
}

/** Problems that would publish something broken; empty when the document is fine. */
export function siteProblems(c: SiteContent): string[] {
  const out: string[] = [];
  const web = (u: string) => !u.trim() || /^https?:\/\/\S+$/i.test(u.trim());
  for (const k of LINK_KEYS) if (!web(c.links[k])) out.push(`${LINK_LABELS[k]} link must start with https://`);
  c.publications.forEach((p) => { if (!web(p.url)) out.push(`Publication “${p.title.slice(0, 40)}”: the link must start with https://`); });
  c.presentations.forEach((p) => { if (!web(p.url)) out.push(`Presentation “${p.title.slice(0, 40)}”: the link must start with https://`); });
  c.emails.forEach((e) => { if (e.trim() && !/^[^@\s]+@[^@\s]+$/.test(e.trim())) out.push(`“${e.trim()}” is not an email address`); });
  if (!c.bio.trim()) out.push("The bio is empty");
  return out;
}
