// A curated reference catalogue of common cell lines. Facts are drawn from Cellosaurus
// (SIB, CC BY 4.0), DepMap/COSMIC (mutations) and the ATCC/DSMZ catalogues (recommended media,
// doubling times) plus the primary literature for breast receptor status. These are reference
// starting points — doubling time, density and even identity drift between labs, so the tool
// labels them "verify against your own cells". Values are editable once a line is picked.

export type Organism = "Human" | "Mouse" | "Rat" | "Other";
export type CultureType = "adherent" | "suspension";
export interface Receptor { er: "+" | "−"; pr: "+" | "−"; her2: "+" | "−"; subtype: string }

export interface CellLineRef {
  id: string;
  name: string;
  aliases?: string[];
  panel: "pancreatic" | "colorectal" | "breast" | "other";
  organism: Organism;
  tissue: string;
  disease: string;
  culture: CultureType;
  /** Typical doubling time in hours (reference). */
  doublingTimeH: number;
  /** Approximate density at 100% confluency, cells/cm² (reference). */
  densityPerCm2: number;
  /** Recommended growth medium and serum. */
  medium: string;
  /** Headline driver mutations / markers. */
  mutations: string[];
  /** Breast lines: hormone-receptor and HER2 status. */
  receptor?: Receptor;
  cellosaurus: string;
  atcc?: string;
  /** Anything worth a flag: special handling, biosafety, misidentification cautions. */
  note?: string;
}

const B = (er: "+" | "−", pr: "+" | "−", her2: "+" | "−", subtype: string): Receptor => ({ er, pr, her2, subtype });

export const CELL_LINES: CellLineRef[] = [
  // ── Pancreatic (PDAC) ──
  { id: "panc1", name: "PANC-1", panel: "pancreatic", organism: "Human", tissue: "Pancreas (duct)", disease: "Pancreatic ductal adenocarcinoma", culture: "adherent", doublingTimeH: 52, densityPerCm2: 1.0e5, medium: "DMEM + 10% FBS", mutations: ["KRAS p.G12D", "TP53 p.R273H", "CDKN2A homozygous deletion", "SMAD4 wild-type"], cellosaurus: "CVCL_0480", atcc: "CRL-1469" },
  { id: "miapaca2", name: "MIA PaCa-2", panel: "pancreatic", organism: "Human", tissue: "Pancreas", disease: "Pancreatic ductal adenocarcinoma", culture: "adherent", doublingTimeH: 40, densityPerCm2: 1.0e5, medium: "DMEM + 10% FBS + 2.5% horse serum", mutations: ["KRAS p.G12C", "TP53 p.R248W", "CDKN2A deletion", "SMAD4 wild-type"], cellosaurus: "CVCL_0428", atcc: "CRL-1420" },
  { id: "bxpc3", name: "BxPC-3", panel: "pancreatic", organism: "Human", tissue: "Pancreas", disease: "Pancreatic adenocarcinoma", culture: "adherent", doublingTimeH: 48, densityPerCm2: 1.2e5, medium: "RPMI-1640 + 10% FBS", mutations: ["KRAS wild-type (rare for PDAC)", "TP53 p.Y220C", "CDKN2A deletion", "SMAD4 deletion"], cellosaurus: "CVCL_0186", atcc: "CRL-1687" },
  { id: "capan1", name: "Capan-1", panel: "pancreatic", organism: "Human", tissue: "Pancreas (liver metastasis)", disease: "Pancreatic adenocarcinoma", culture: "adherent", doublingTimeH: 60, densityPerCm2: 1.0e5, medium: "IMDM + 20% FBS", mutations: ["KRAS p.G12V", "TP53 p.A159V", "SMAD4 deletion", "BRCA2 mutant"], cellosaurus: "CVCL_0237", atcc: "HTB-79" },
  { id: "capan2", name: "Capan-2", panel: "pancreatic", organism: "Human", tissue: "Pancreas", disease: "Pancreatic adenocarcinoma", culture: "adherent", doublingTimeH: 96, densityPerCm2: 1.0e5, medium: "McCoy's 5A + 10% FBS", mutations: ["KRAS p.G12V", "TP53 wild-type", "SMAD4 wild-type"], cellosaurus: "CVCL_0026", atcc: "HTB-80" },
  { id: "aspc1", name: "AsPC-1", panel: "pancreatic", organism: "Human", tissue: "Pancreas (ascites)", disease: "Pancreatic adenocarcinoma", culture: "adherent", doublingTimeH: 40, densityPerCm2: 1.2e5, medium: "RPMI-1640 + 10% FBS", mutations: ["KRAS p.G12D", "TP53 frameshift", "CDKN2A deletion", "SMAD4 deletion"], cellosaurus: "CVCL_0152", atcc: "CRL-1682" },
  { id: "cfpac1", name: "CFPAC-1", panel: "pancreatic", organism: "Human", tissue: "Pancreas (liver metastasis)", disease: "Pancreatic ductal adenocarcinoma", culture: "adherent", doublingTimeH: 31, densityPerCm2: 1.2e5, medium: "IMDM + 10% FBS", mutations: ["KRAS p.G12V", "TP53 p.C242R", "SMAD4 deletion", "CFTR ΔF508 (donor had cystic fibrosis)"], cellosaurus: "CVCL_1119", atcc: "CRL-1918" },
  { id: "sw1990", name: "SW1990", panel: "pancreatic", organism: "Human", tissue: "Pancreas (spleen metastasis)", disease: "Pancreatic adenocarcinoma", culture: "adherent", doublingTimeH: 50, densityPerCm2: 1.0e5, medium: "Leibovitz L-15 + 10% FBS (no added CO₂)", mutations: ["KRAS p.G12D", "SMAD4 deletion"], cellosaurus: "CVCL_1723", atcc: "CRL-2172", note: "L-15 is CO₂-independent: gas with air, keep caps tight." },
  { id: "hpafii", name: "HPAF-II", panel: "pancreatic", organism: "Human", tissue: "Pancreas (ascites)", disease: "Pancreatic adenocarcinoma", culture: "adherent", doublingTimeH: 48, densityPerCm2: 1.2e5, medium: "EMEM + 10% FBS", mutations: ["KRAS p.G12D", "TP53 p.P151S", "CDKN2A", "SMAD4"], cellosaurus: "CVCL_0313", atcc: "CRL-1997" },
  { id: "su8686", name: "SU.86.86", panel: "pancreatic", organism: "Human", tissue: "Pancreas (liver metastasis)", disease: "Pancreatic ductal adenocarcinoma", culture: "adherent", doublingTimeH: 40, densityPerCm2: 1.2e5, medium: "RPMI-1640 + 10% FBS", mutations: ["KRAS p.G12D", "TP53", "CDKN2A deletion"], cellosaurus: "CVCL_3881", atcc: "CRL-1837" },
  { id: "hpac", name: "HPAC", panel: "pancreatic", organism: "Human", tissue: "Pancreas", disease: "Pancreatic ductal adenocarcinoma", culture: "adherent", doublingTimeH: 40, densityPerCm2: 1.2e5, medium: "DMEM:F12 (1:1) + 5% FBS + supplements", mutations: ["KRAS p.G12D", "TP53", "CDKN2A"], cellosaurus: "CVCL_3517", atcc: "CRL-2119" },
  { id: "panc1005", name: "Panc 10.05", panel: "pancreatic", organism: "Human", tissue: "Pancreas", disease: "Pancreatic ductal adenocarcinoma", culture: "adherent", doublingTimeH: 48, densityPerCm2: 1.0e5, medium: "RPMI-1640 + 15% FBS + insulin", mutations: ["KRAS p.G12D", "TP53", "SMAD4"], cellosaurus: "CVCL_1639", atcc: "CRL-2547" },

  // ── Colorectal (CRC) ──
  { id: "hct116", name: "HCT116", panel: "colorectal", organism: "Human", tissue: "Colon", disease: "Colorectal carcinoma", culture: "adherent", doublingTimeH: 21, densityPerCm2: 1.5e5, medium: "McCoy's 5A + 10% FBS (DMEM also used)", mutations: ["KRAS p.G13D", "PIK3CA p.H1047R", "CTNNB1 mutant", "MLH1-deficient → MSI-high", "TP53 wild-type"], cellosaurus: "CVCL_0291", atcc: "CCL-247" },
  { id: "ht29", name: "HT-29", panel: "colorectal", organism: "Human", tissue: "Colon", disease: "Colorectal adenocarcinoma", culture: "adherent", doublingTimeH: 24, densityPerCm2: 1.5e5, medium: "McCoy's 5A + 10% FBS", mutations: ["BRAF p.V600E", "TP53 p.R273H", "APC mutant", "PIK3CA p.P449T", "MSS"], cellosaurus: "CVCL_0320", atcc: "HTB-38" },
  { id: "sw480", name: "SW480", panel: "colorectal", organism: "Human", tissue: "Colon (primary)", disease: "Colorectal adenocarcinoma", culture: "adherent", doublingTimeH: 38, densityPerCm2: 1.3e5, medium: "Leibovitz L-15 + 10% FBS (no added CO₂; DMEM with CO₂)", mutations: ["KRAS p.G12V", "APC mutant", "TP53 p.R273H / p.P309S", "MSS"], cellosaurus: "CVCL_0546", atcc: "CCL-228" },
  { id: "sw620", name: "SW620", panel: "colorectal", organism: "Human", tissue: "Colon (lymph-node metastasis)", disease: "Colorectal adenocarcinoma", culture: "adherent", doublingTimeH: 21, densityPerCm2: 1.3e5, medium: "Leibovitz L-15 + 10% FBS (no added CO₂)", mutations: ["KRAS p.G12V", "APC mutant", "TP53", "MSS"], cellosaurus: "CVCL_0547", atcc: "CCL-227", note: "Same patient as SW480 (metastasis)." },
  { id: "caco2", name: "Caco-2", panel: "colorectal", organism: "Human", tissue: "Colon", disease: "Colorectal adenocarcinoma", culture: "adherent", doublingTimeH: 62, densityPerCm2: 1.0e5, medium: "EMEM + 20% FBS (DMEM also used)", mutations: ["APC mutant", "TP53 mutant", "KRAS wild-type"], cellosaurus: "CVCL_0025", atcc: "HTB-37", note: "Differentiates into a polarised enterocyte monolayer — a gut-barrier model." },
  { id: "dld1", name: "DLD-1", panel: "colorectal", organism: "Human", tissue: "Colon", disease: "Colorectal adenocarcinoma", culture: "adherent", doublingTimeH: 24, densityPerCm2: 1.5e5, medium: "RPMI-1640 + 10% FBS", mutations: ["KRAS p.G13D", "TP53 p.S241F", "APC mutant", "PIK3CA", "MSI-high"], cellosaurus: "CVCL_0248", atcc: "CCL-221" },
  { id: "lovo", name: "LoVo", panel: "colorectal", organism: "Human", tissue: "Colon (metastasis)", disease: "Colorectal adenocarcinoma", culture: "adherent", doublingTimeH: 34, densityPerCm2: 1.3e5, medium: "F-12K + 10% FBS", mutations: ["KRAS p.G13D", "APC mutant", "MSI-high"], cellosaurus: "CVCL_0399", atcc: "CCL-229" },
  { id: "rko", name: "RKO", panel: "colorectal", organism: "Human", tissue: "Colon", disease: "Colorectal carcinoma", culture: "adherent", doublingTimeH: 22, densityPerCm2: 1.5e5, medium: "EMEM + 10% FBS", mutations: ["BRAF p.V600E", "PIK3CA p.H1047R", "MLH1-silenced → MSI-high", "TP53 wild-type"], cellosaurus: "CVCL_0504", atcc: "CRL-2577" },
  { id: "colo205", name: "COLO 205", panel: "colorectal", organism: "Human", tissue: "Colon (ascites)", disease: "Colorectal adenocarcinoma", culture: "suspension", doublingTimeH: 40, densityPerCm2: 1.0e6, medium: "RPMI-1640 + 10% FBS", mutations: ["BRAF p.V600E", "TP53", "APC", "SMAD4"], cellosaurus: "CVCL_0218", atcc: "CCL-222", note: "Grows as a mixed floating/loosely-adherent culture." },

  // ── Breast ──
  { id: "mcf7", name: "MCF7", panel: "breast", organism: "Human", tissue: "Breast (pleural effusion)", disease: "Invasive breast carcinoma", culture: "adherent", doublingTimeH: 38, densityPerCm2: 1.3e5, medium: "EMEM + 10% FBS + 0.01 mg/mL insulin (DMEM also common)", mutations: ["PIK3CA p.E545K", "TP53 wild-type", "CDH1 wild-type"], receptor: B("+", "+", "−", "Luminal A (ER+/PR+/HER2−)"), cellosaurus: "CVCL_0031", atcc: "HTB-22" },
  { id: "mdamb231", name: "MDA-MB-231", panel: "breast", organism: "Human", tissue: "Breast (pleural effusion)", disease: "Breast adenocarcinoma", culture: "adherent", doublingTimeH: 38, densityPerCm2: 1.0e5, medium: "DMEM + 10% FBS (L-15 for CO₂-free)", mutations: ["KRAS p.G13D", "BRAF p.G464V", "TP53 p.R280K", "NF2 mutant"], receptor: B("−", "−", "−", "Triple-negative (claudin-low / mesenchymal)"), cellosaurus: "CVCL_0062", atcc: "HTB-26" },
  { id: "mdamb468", name: "MDA-MB-468", panel: "breast", organism: "Human", tissue: "Breast (pleural effusion)", disease: "Breast adenocarcinoma", culture: "adherent", doublingTimeH: 44, densityPerCm2: 1.2e5, medium: "DMEM + 10% FBS", mutations: ["EGFR amplified", "PTEN null", "TP53 p.R273H", "RB1 deletion", "SMAD4 deletion"], receptor: B("−", "−", "−", "Triple-negative (basal A)"), cellosaurus: "CVCL_0419", atcc: "HTB-132" },
  { id: "mdamb453", name: "MDA-MB-453", panel: "breast", organism: "Human", tissue: "Breast (pericardial effusion)", disease: "Breast carcinoma", culture: "adherent", doublingTimeH: 48, densityPerCm2: 1.2e5, medium: "L-15 + 10% FBS (no added CO₂) or DMEM", mutations: ["PIK3CA p.H1047R", "TP53", "CDH1 mutant", "AR-positive"], receptor: B("−", "−", "+", "Molecular apocrine (HER2+/AR+)"), cellosaurus: "CVCL_0418", atcc: "HTB-131" },
  { id: "mdamb436", name: "MDA-MB-436", panel: "breast", organism: "Human", tissue: "Breast (pleural effusion)", disease: "Breast adenocarcinoma", culture: "adherent", doublingTimeH: 55, densityPerCm2: 1.0e5, medium: "L-15 + 10% FBS + insulin + glutathione", mutations: ["BRCA1 mutant (5396+1G>A)", "TP53 mutant", "PTEN"], receptor: B("−", "−", "−", "Triple-negative (BRCA1-mutant)"), cellosaurus: "CVCL_0623", atcc: "HTB-130" },
  { id: "t47d", name: "T-47D", panel: "breast", organism: "Human", tissue: "Breast (pleural effusion)", disease: "Invasive ductal carcinoma", culture: "adherent", doublingTimeH: 32, densityPerCm2: 1.3e5, medium: "RPMI-1640 + 10% FBS + 0.2 U/mL insulin", mutations: ["TP53 p.L194F", "PIK3CA p.H1047R"], receptor: B("+", "+", "−", "Luminal A (ER+/PR+/HER2−)"), cellosaurus: "CVCL_0553", atcc: "HTB-133" },
  { id: "skbr3", name: "SK-BR-3", panel: "breast", organism: "Human", tissue: "Breast (pleural effusion)", disease: "Breast adenocarcinoma", culture: "adherent", doublingTimeH: 48, densityPerCm2: 1.2e5, medium: "McCoy's 5A + 10% FBS (DMEM also used)", mutations: ["ERBB2 (HER2) amplified", "TP53 p.R175H"], receptor: B("−", "−", "+", "HER2-enriched"), cellosaurus: "CVCL_0033", atcc: "HTB-30" },
  { id: "bt474", name: "BT-474", panel: "breast", organism: "Human", tissue: "Breast", disease: "Invasive ductal carcinoma", culture: "adherent", doublingTimeH: 60, densityPerCm2: 1.2e5, medium: "Hybri-Care or DMEM + 10% FBS", mutations: ["ERBB2 (HER2) amplified", "PIK3CA p.K111N", "TP53 p.E285K"], receptor: B("+", "+", "+", "Luminal B / HER2+"), cellosaurus: "CVCL_0179", atcc: "HTB-20" },
  { id: "bt549", name: "BT-549", panel: "breast", organism: "Human", tissue: "Breast", disease: "Invasive ductal carcinoma", culture: "adherent", doublingTimeH: 55, densityPerCm2: 1.0e5, medium: "RPMI-1640 + 10% FBS + 0.023 U/mL insulin", mutations: ["PTEN null", "RB1 null", "TP53 mutant"], receptor: B("−", "−", "−", "Triple-negative (basal B)"), cellosaurus: "CVCL_1092", atcc: "HTB-122" },
  { id: "hcc1937", name: "HCC1937", panel: "breast", organism: "Human", tissue: "Breast (primary)", disease: "Ductal carcinoma", culture: "adherent", doublingTimeH: 60, densityPerCm2: 1.0e5, medium: "RPMI-1640 + 10% FBS", mutations: ["BRCA1 mutant (5382insC)", "TP53 mutant", "PTEN mutant"], receptor: B("−", "−", "−", "Triple-negative (basal, BRCA1-mutant)"), cellosaurus: "CVCL_0290", atcc: "CRL-2336" },
  { id: "zr751", name: "ZR-75-1", panel: "breast", organism: "Human", tissue: "Breast (ascites)", disease: "Invasive ductal carcinoma", culture: "adherent", doublingTimeH: 80, densityPerCm2: 1.2e5, medium: "RPMI-1640 + 10% FBS", mutations: ["PTEN mutant", "TP53 wild-type"], receptor: B("+", "−", "−", "Luminal B (ER+/HER2−)"), cellosaurus: "CVCL_0588", atcc: "CRL-1500" },

  // ── Other common lines ──
  { id: "hek293", name: "HEK293", aliases: ["293"], panel: "other", organism: "Human", tissue: "Embryonic kidney (adenovirus-5 transformed)", disease: "Non-cancerous (transformed)", culture: "adherent", doublingTimeH: 34, densityPerCm2: 1.3e5, medium: "DMEM + 10% FBS", mutations: ["Adenovirus-5 E1A/E1B integrated", "Likely neuronal-lineage origin"], cellosaurus: "CVCL_0045", atcc: "CRL-1573", note: "Loosely adherent — detaches easily; handle gently." },
  { id: "hek293t", name: "HEK293T", aliases: ["293T", "293T/17"], panel: "other", organism: "Human", tissue: "Embryonic kidney (adenovirus-5 transformed)", disease: "Non-cancerous (transformed)", culture: "adherent", doublingTimeH: 24, densityPerCm2: 1.3e5, medium: "DMEM + 10% FBS", mutations: ["SV40 large T antigen", "Adenovirus-5 E1A/E1B"], cellosaurus: "CVCL_0063", atcc: "CRL-3216", note: "SV40 large T makes it the standard host for transfection and lentivirus packaging." },
];

export const cellLineRef = (id: string): CellLineRef | undefined => CELL_LINES.find((c) => c.id === id);
export const PANELS: [CellLineRef["panel"], string][] = [
  ["pancreatic", "Pancreatic"], ["colorectal", "Colorectal"], ["breast", "Breast"], ["other", "Other"],
];
