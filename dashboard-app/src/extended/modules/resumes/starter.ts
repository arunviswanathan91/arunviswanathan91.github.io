// "Start from my research resume": the content of the existing FlowCV resume, so nothing is retyped.
import { newItem, newSection, DEFAULT_STYLE, type ResumeData } from "./model.ts";

export function starterResume(): ResumeData {
  const i = newItem;
  return {
    profile: {
      name: "Arun Viswanathan", headline: "PhD Candidate | Senior Research Fellow",
      email: "arunviswanathan91@gmail.com | arunv@rgcb.res.in", phone: "+91-89219-77055", location: "Thiruvananthapuram, Kerala, India",
      links: [{ label: "LinkedIn", url: "" }],
      summary: "PhD candidate in biotechnology researching STAT3 signaling and tumor immunity in obesity-driven pancreatic cancer. Experience spans preclinical cancer models, immune profiling, functional assays, and computational analysis across multiple research projects, including multi-omics integration and Bayesian statistical modeling. Interested in integrating experimental biology with computational approaches to advance therapeutic target discovery and translational oncology.",
    },
    style: { ...DEFAULT_STYLE },
    sections: [
      newSection("education", { items: [
        i({ title: "PhD in Biotechnology", subtitle: "BRIC-Rajiv Gandhi Center for Biotechnology", start: "Feb 2020", end: "present", location: "Thiruvananthapuram, India", body: "Research focus: STAT3 signalling and CD8+ T-cell immunity in obesity-driven pancreatic cancer.\nSupervisor: Dr. Harikumar K. B. Scientist F, BRIC-RGCB." }),
        i({ title: "Master of Science in Biochemistry and Molecular Biology", subtitle: "Pondicherry University", start: "2014", end: "2016", location: "Pondicherry, India" }),
        i({ title: "Postgraduate Diploma in Biotechnology", subtitle: "Pondicherry University", start: "2015", end: "2016", location: "Pondicherry, India" }),
        i({ title: "Bachelor of Science and Education (B.Sc.Ed.)", subtitle: "Regional Institute of Education", start: "2009", end: "2013", location: "Mysore, India" }),
      ] }),
      newSection("experience", { items: [
        i({ title: "Senior Research Fellow & Ph.D. Candidate", subtitle: "BRIC-Rajiv Gandhi Center for Biotechnology", start: "Feb 2022", end: "present", location: "Thiruvananthapuram, India", body: [
          "Investigated pancreatic STAT3 signaling in obesity-driven pancreatic cancer using genetically engineered mouse models, tumor immune profiling, and cancer cell–T-cell co-culture assays.",
          "Contributed to analyses across multiple research projects, including transcriptomic, proteomic, metabolomic, and microbiome datasets.",
          "Applied Bayesian hierarchical and paired multi-omics models to investigate BMI-associated molecular variation in pancreatic cancer, evaluating model performance through simulations, posterior diagnostics and sensitivity analyses.",
          "Analyzed bulk RNA-seq and proteomic datasets using DESeq2, limma, and DEqMS.",
          "Evaluated more than seven compounds and derivatives using cell-based assays for research consultancy projects.",
          "Advised research clients on assay selection and interpretation of experimental results.",
          "Analysis and data representation of metagenomic and metabolomic data of 2 different preclinical projects using MetaboAnalyst and MicrobiomeAnalyst.",
          "Integrated Seahorse XFe analyzer into lab workflows for real-time metabolic profiling of cancer cell lines.",
          "Designed immunophenotyping panels (up to 6 colors) to profile immune cell populations in murine tumors.",
          "Trained and mentored 7+ master's students, project staff, and interns",
        ].join("\n") }),
        i({ title: "Junior Research Fellow & Ph.D. Candidate", subtitle: "BRIC-Rajiv Gandhi Center for Biotechnology", start: "Feb 2020", end: "Feb 2022", location: "Thiruvananthapuram, India", body: [
          "Managed two gastrointestinal cancer projects, overseeing experiments, data analysis (GraphPad Prism and R), and reporting.",
          "Conducted multicolor flow cytometry (6-color panels) for tumor immunophenotyping and CD8+ T cell sorting.",
          "Delivered training sessions on gene-silencing techniques (siRNA, miRNA, shRNA) to biotechnology students.",
        ].join("\n") }),
      ] }),
      newSection("skills", { items: [
        i({ title: "Computational and statistical analysis", body: [
          "R programming: Data processing, statistical analysis and custom scripting using RStudio and Google Colab.",
          "Bayesian modelling: Hierarchical models, partial pooling, posterior uncertainty estimation, simulation-based evaluation and sensitivity analysis.",
          "Single-cell RNA-seq: Analysis of 10x Genomics datasets using Seurat.",
          "Bulk RNA-seq and proteomics: Differential expression and protein abundance analysis using DESeq2, limma and DEqMS.",
          "Multi-omics analysis: Integration and comparison of transcriptomic, proteomic and post-translational modification data.",
          "Metabolomics and microbiome analysis: Data analysis and visualisation using MetaboAnalyst and MicrobiomeAnalyst.",
          "Functional enrichment: GSEA, GO, KEGG and Reactome analyses using clusterProfiler and ReactomePA.",
          "Data visualisation: Publication figures using ggplot2, ComplexHeatmap and EnhancedVolcano.",
        ].join("\n") }),
        i({ title: "Experimental Cancer Biology", body: [
          "Cell culture: Mammalian cell culture and cancer cell-based experiments.",
          "Multicolor flow cytometry: Design of six-color panels for murine tumor immunophenotyping.",
          "T-cell functional studies: T-cell sorting, activation and cancer cell co-culture assays.",
          "Metabolic profiling: Seahorse XFe analysis of cancer cell metabolism.",
          "Molecular techniques: DNA/RNA isolation, RT-PCR, and gene silencing using siRNA, miRNA, and shRNA.",
          "Functional assays: Cell viability, migration, colony formation, apoptosis, and reactive oxygen species measurements.",
          "Fluorescence microscopy: Multicolor imaging with five or more fluorescence channels and it analysis using segmentation models like cellposeSAM",
          "Histological staining: Hematoxylin and eosin (H&E), Masson's trichrome, and Alcian blue staining.",
        ].join("\n") }),
        i({ title: "Pre-clinical Animal Studies", body: [
          "Mouse handling, breeding of genetically modified mouse lines and PCR-based genotyping.",
          "Experimental mouse models of pancreatic and colorectal cancer. IVIS imaging and quantitative image analysis.",
          "Human tissue processing for patient-derived xenograft (PDX) models.",
        ].join("\n") }),
        i({ title: "Additional Laboratory Techniques", body: "Bacterial cell culture.\nCircular dichroism and UV–visible spectroscopy.\nDynamic light scattering.\nCyclic voltammetry." }),
        i({ title: "Softwares", body: "Statistical analysis and graphing: RStudio and GraphPad Prism.\nFlow cytometry acquisition and analysis: FlowJo, BD FACSDiva, and CytExpert.\nImage analysis: ImageJ, Custom image analysis using Segmentation models" }),
        // Present in the FlowCV resume but hidden there; kept hidden here too.
        i({ title: "Teaching Skills", hidden: true }),
        i({ title: "Project Management & Consulting", hidden: true }),
      ] }),
      newSection("publications", { items: [
        i({ title: "Uttroside B, a US FDA-designated ‘Orphan Drug’, mitigates the development of hepatocellular carcinoma and its pulmonary metastasis via EGFR/ERK-mediated inhibition of SREBP-1 and STAT-3", subtitle: "Cell Death Discovery", start: "16 Apr 2026", end: "", body: "" }),
      ] }),
    ],
  };
}
