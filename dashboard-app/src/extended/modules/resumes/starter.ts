// "Start from my research resume": the content of the existing FlowCV resume, so nothing is retyped.
import { newItem, newSection, DEFAULT_STYLE, type ResumeData } from "./model.ts";

export function starterResume(): ResumeData {
  const i = newItem;
  const RGCB = "BRIC-Rajiv Gandhi Center for Biotechnology";
  const L = (...x: string[]) => x.join("\n");
  return {
    profile: {
      name: "Arun Viswanathan", headline: "PhD Candidate | Senior Research Fellow",
      email: "arunviswanathan91@gmail.com | arunv@rgcb.res.in", phone: "+91-89219-77055", location: "Thiruvananthapuram, Kerala, India",
      links: [{ label: "LinkedIn", url: "" }],
      summary: "PhD candidate in biotechnology researching STAT3 signaling and tumor immunity in obesity-driven pancreatic cancer. Experience spans preclinical cancer models, immune profiling, functional assays, and computational analysis across multiple research projects, including multi-omics integration and Bayesian statistical modeling. Interested in integrating experimental biology with computational approaches to advance therapeutic target discovery and translational oncology.",
    },
    style: { ...DEFAULT_STYLE, font: "amiri", layouts: { skills: { cols: 2 }, certification: { cols: 4 }, scores: { mode: "compact", sep: "pipe", subinfo: "dash" } } },
    sections: [
      newSection("education", { items: [
        i({ title: "PhD in Biotechnology", subtitle: RGCB, start: "Feb 2020", end: "present", location: "Thiruvananthapuram, India", body: L("Research focus: STAT3 signalling and CD8+ T-cell immunity in obesity-driven pancreatic cancer.", "Supervisor: Dr. Harikumar K. B. Scientist F, BRIC-RGCB.") }),
        i({ title: "Master of Science in Biochemistry and Molecular Biology", subtitle: "Pondicherry University", start: "2014", end: "2016", location: "Pondicherry, India" }),
        i({ title: "Postgraduate Diploma in Biotechnology", subtitle: "Pondicherry University", start: "2015", end: "2016", location: "Pondicherry, India" }),
        i({ title: "Bachelor of Science and Education (B.Sc.Ed.)", subtitle: "Regional Institute of Education", start: "2009", end: "2013", location: "Mysore, India" }),
      ] }),
      newSection("experience", { items: [
        i({ title: "Senior Research Fellow & Ph.D. Candidate", subtitle: RGCB, start: "Feb 2022", end: "present", location: "Thiruvananthapuram, India", body: L(
          "Investigated pancreatic STAT3 signaling in obesity-driven pancreatic cancer using genetically engineered mouse models, tumor immune profiling, and cancer cell–T-cell co-culture assays.",
          "Contributed to analyses across multiple research projects, including transcriptomic, proteomic, metabolomic, and microbiome datasets.",
          "Applied Bayesian hierarchical and paired multi-omics models to investigate BMI-associated molecular variation in pancreatic cancer, evaluating model performance through simulations, posterior diagnostics and sensitivity analyses.",
          "Analyzed bulk RNA-seq and proteomic datasets using DESeq2, limma, and DEqMS.",
          "Evaluated more than seven compounds and derivatives using cell-based assays for research consultancy projects.",
          "Advised research clients on assay selection and interpretation of experimental results.",
          "Analysis and data representation of metagenomic and metabolomic data of 2 different preclinical projects using MetaboAnalyst and MicrobiomeAnalyst.",
          "Integrated Seahorse XFe analyzer into lab workflows for real-time metabolic profiling of cancer cell lines.",
          "Designed immunophenotyping panels (up to 6 colors) to profile immune cell populations in murine tumors.",
          "Trained and mentored 7+ master's students, project staff, and interns") }),
        i({ title: "Junior Research Fellow & Ph.D. Candidate", subtitle: RGCB, start: "Feb 2020", end: "Feb 2022", location: "Thiruvananthapuram, India", body: L(
          "Managed two gastrointestinal cancer projects, overseeing experiments, data analysis (GraphPad Prism and R), and reporting.",
          "Conducted multicolor flow cytometry (6-color panels) for tumor immunophenotyping and CD8+ T cell sorting.",
          "Delivered training sessions on gene-silencing techniques (siRNA, miRNA, shRNA) to biotechnology students.",
          "Verified knockout mouse genotypes and designed breeding strategies.",
          "Performed RNA/DNA isolation and RT-PCR-based gene expression studies across multiple projects.") }),
        i({ title: "Mentorship during Ph.D.", subtitle: "BRIC-Rajiv Gandhi Centre for Biotechnology", start: "Feb 2020", end: "present", location: "Thiruvananthapuram, India", body: L("Trained and mentored over 10+ master's students and interns in molecular biology techniques and data analysis.", "Designed and conducted academic sessions on experimental methods and R programming basics.") }),
        i({ title: "Guest Lecturer", subtitle: "ABATE group of Institutions", start: "Sep 2017", end: "Jan 2020", location: "Calicut, India", body: L("Delivered lectures in General and Ocular Biochemistry, Microbiology, and Nutrition.", "Developed and maintained online learning evaluations via Blackboard and Google Classroom.", "Contributed to thesis evaluation committees for undergraduate optometry students.") }),
        i({ title: "Tutor", subtitle: "Aifer Education", start: "Feb 2024", end: "present", location: "Kozhikode, India", body: L("Conducting online CSIR-UGC exam preparation classes through Zoom for the subject of Developmental Biology.", "Delivering structured topic-wise lectures, sharing digital notes, and conducting weekly assessments.", "Designed and led MCQ practice sessions, PYQ (previous year question) discussions, and comprehensive revision classes.", "Engaging students through interactive sessions, Q&A discussions, and exam-focused strategy support.") }),
        i({ title: "Tutor", subtitle: "Research World Coaching Centre", start: "Dec 2016", end: "Jan 2020", location: "Calicut, India", body: L("Taught Developmental Biology, Endocrinology, Reproductive Biology, and Molecular Biology.", "Designed MCQ question banks and crash courses for national-level competitive exams.") }),
      ] }),
      // Items are listed in the order that makes two flowing columns match the FlowCV page.
      newSection("skills", { items: [
        i({ title: "Computational and statistical analysis", body: L(
          "R programming: Data processing, statistical analysis and custom scripting using RStudio and Google Colab.",
          "Bayesian modelling: Hierarchical models, partial pooling, posterior uncertainty estimation, simulation-based evaluation and sensitivity analysis.",
          "Single-cell RNA-seq: Analysis of 10x Genomics datasets using Seurat.",
          "Bulk RNA-seq and proteomics: Differential expression and protein abundance analysis using DESeq2, limma and DEqMS.",
          "Multi-omics analysis: Integration and comparison of transcriptomic, proteomic and post-translational modification data.",
          "Metabolomics and microbiome analysis: Data analysis and visualisation using MetaboAnalyst and MicrobiomeAnalyst.",
          "Functional enrichment: GSEA, GO, KEGG and Reactome analyses using clusterProfiler and ReactomePA.",
          "Data visualisation: Publication figures using ggplot2, ComplexHeatmap and EnhancedVolcano.") }),
        i({ title: "Pre-clinical Animal Studies", body: L("Mouse handling, breeding of genetically modified mouse lines and PCR-based genotyping.", "Experimental mouse models of pancreatic and colorectal cancer. IVIS imaging and quantitative image analysis.", "Human tissue processing for patient-derived xenograft (PDX) models.") }),
        i({ title: "Softwares", body: L("Statistical analysis and graphing: RStudio and GraphPad Prism.", "Flow cytometry acquisition and analysis: FlowJo, BD FACSDiva, and CytExpert.", "Image analysis: ImageJ, Custom image analysis using Segmentation models") }),
        i({ title: "Experimental Cancer Biology", body: L(
          "Cell culture: Mammalian cell culture and cancer cell-based experiments.",
          "Multicolor flow cytometry: Design of six-color panels for murine tumor immunophenotyping.",
          "T-cell functional studies: T-cell sorting, activation and cancer cell co-culture assays.",
          "Metabolic profiling: Seahorse XFe analysis of cancer cell metabolism.",
          "Molecular techniques: DNA/RNA isolation, RT-PCR, and gene silencing using siRNA, miRNA, and shRNA.",
          "Functional assays: Cell viability, migration, colony formation, apoptosis, and reactive oxygen species measurements.",
          "Fluorescence microscopy: Multicolor imaging with five or more fluorescence channels and it analysis using segmentation models like cellposeSAM",
          "Histological staining: Hematoxylin and eosin (H&E), Masson’s trichrome, and Alcian blue staining.") }),
        i({ title: "Additional Laboratory Techniques", body: L("Bacterial cell culture.", "Circular dichroism and UV–visible spectroscopy.", "Dynamic light scattering.", "Cyclic voltammetry.") }),
        // Hidden in the FlowCV resume; kept (hidden) so the content is not lost.
        i({ title: "Teaching Skills", hidden: true, body: "question skills, reinforcement skills, explaining skills, opening and close skills, small group discussions skills, class management skills, skills of organizing small group work and invidual work." }),
        i({ title: "Instructional Technology & Online Teaching Tools", hidden: true, body: L("Proficient in Zoom for virtual lectures, breakout rooms, screen sharing, and live Q&A.", "Experienced with Google Classroom for managing coursework, announcements, and submissions.", "Worked with Blackboard to deliver quizzes, track performance, and create learning modules.") }),
        i({ title: "Project Management & Consulting", hidden: true, body: L("Scientific Consulting and Client Advising", "Cross-functional Team Leadership and Mentoring", "Remote Scientific Collaboration") }),
        i({ title: "Multicolor Flowcytometry", hidden: true, body: "Flow cytometry analysis and downstream analysis. Designed panels for immunophenotyping with up to 6 colours. Sample preparation and staining. Flow cytometry-based cell cycle analysis, Apoptosis analysis, ROS, MMP and cellular uptake of fluorescent-tagged drugs" }),
      ] }),
      newSection("publications", { items: [
        i({ title: "Uttroside B, a US FDA-designated ‘Orphan Drug’, mitigates the development of hepatocellular carcinoma and its pulmonary metastasis via EGFR/ERK-mediated inhibition of SREBP-1 and STAT-3", subtitle: "Cell Death Discovery", start: "16 Apr 2026" }),
        i({ title: "Sphingosine 1-phosphate signaling during infection and immunity", subtitle: "Progress in Lipid Research", start: "24 Aug 2023" }),
        i({ title: "Targeting Acid Ceramidase enhances antitumor immune response in colorectal cancer", subtitle: "Journal of Advanced Research", start: "21 Dec 2023" }),
        i({ title: "Synthesis and characterisation of arsenic nanoparticles and its interaction with DNA and cytotoxic potential on breast cancer cells", subtitle: "Chemico-Biological Interactions", start: "01 Nov 2017" }),
        i({ title: "Conference Publication: STAT3-Mediated Immune Dysfunction And BMI-Stratified Therapeutic Windows in Obesity-Associated Pancreatic Cancer", subtitle: "Cancer Research", start: "01 Jul 2026" }),
        i({ title: "Uttroside B attenuates aflatoxin B1-induced hepatocellular carcinoma via induction of apoptosis and immunomodulation of the tumor microenvironment", subtitle: "In communication", start: "28 Sep 2026" }),
        i({ title: "A validated Interactive Google Colab Workflow for Segmentation and Quantitative Analysis of Multiplex Immunofluorescence and Chromogenic Immunohistochemistry", subtitle: "Bioprotocol (in communication)", start: "20 Sep 2025" }),
      ] }),
      newSection("certification", { items: [
        i({ title: "Good Clinical Practice", subtitle: "by National Institute on Drug Abuse, NIH" }),
        i({ title: "Transporting Dangerous Goods Training", subtitle: "by Mayo Clinic" }),
        i({ title: "Design and Interpretation of Clinical Trials", subtitle: "by Johns Hopkins University" }),
        i({ title: "Data Management for Clinical Research", subtitle: "by Vanderbilt University" }),
        i({ title: "FlowJo High parameter Data Analysis", subtitle: "by BD Life Sciences" }),
        i({ title: "Certificate course in animal handling", subtitle: "by BRIC-Rajiv Gandhi Center for Biotechnology" }),
        i({ title: "Flow Cytometry: Basics, Applications, Experimental Designing and Data Analysis", subtitle: "Flowcytometry Solutions (P) Ltd, Jaipur, India" }),
      ] }),
      newSection("teaching", { items: [
        i({ title: "Tutor", start: "Feb 2024", end: "Mar 2025", location: "Aifer Education, Calicut, India", body: L("Conducting online CSIR-UGC exam preparation classes through Zoom for the subject of Developmental Biology.", "Delivering structured topic-wise lectures, sharing digital notes, and conducting weekly assessments.", "Designed and led MCQ practice sessions, PYQ (previous year question) discussions, and comprehensive revision classes.", "Engaging students through interactive sessions, Q&A discussions, and exam-focused strategy support") }),
        i({ title: "Guest Lecturer", start: "Sep 2017", end: "Jan 2020", location: "ABATE group of Institutions, Calicut, India", body: L("Delivered lectures in General and Ocular Biochemistry, Microbiology, and Nutrition.", "Developed and maintained online learning evaluations via Blackboard and Google Classroom.", "Contributed to thesis evaluation committees for undergraduate optometry students.") }),
        i({ title: "Tutor", start: "Dec 2016", end: "Jan 2020", location: "Calicut, India", body: L("Taught Developmental Biology, Endocrinology, Reproductive Biology, and Molecular Biology.", "Designed MCQ question banks and crash courses for national-level competitive exams.") }),
      ] }),
      newSection("conferences", { items: [
        i({ title: "Frontiers in Cancer Science 2025", subtitle: "Travel Grant", start: "Nov 2025", location: "NUS, Singapore" }),
        i({ title: "National Symposium for Biotechnology for Sustainable Development 2025", subtitle: "Best poster presentation (Top 5)", start: "May 2025", location: "BRIC-RGCB, Thiruvananthapuram, India" }),
        i({ title: "Global Cancer Consortium Conference (GCC 2024)", subtitle: "Best Oral Presentation (2nd Place)", start: "Aug 2024", location: "Amity University, Noida, India" }),
      ] }),
      newSection("scores", { items: [
        i({ title: "CSIR/UGC - JRF/NET Life Science", body: L("UGC June 2019 - AIR 62", "UGC December 2017 - AIR 44", "UGC December 2016 - AIR 66", "CSIR June 2017 - AIR 56") }),
        i({ title: "GATE Mar 2017", body: "Qualified with Gate score: 504, AIR: 543" }),
      ] }),
      newSection("volunteering", { items: [
        i({ title: "Kerala Sasthra Sahithya Prishad", subtitle: "Invited Guest", start: "2021", location: "Thiruvananthapuram, India", body: "Delivered a talk on gender and inclusion during the \"Gender Talks of Kerala\" webinar event." }),
        i({ title: "Queerythm", subtitle: "Resource Person", start: "Dec 2020", location: "Thiruvananthapuram, India", body: "Conducted educational sessions for 11th standard students at National Service Scheme (NSS) camps on Sexual Orientation and Gender Identity (SOGI) awareness based on SAMADARSHAN guidelines." }),
        i({ title: "Kerala Institute of Local Administration (KILA)", subtitle: "Resource Person", start: "Jan 2020", location: "Thrissur, India", body: "Contributed to the preparation of training modules and handbooks for training resource persons (RPs) to promote LGBTQI+ rights and sensitivity in local self-government bodies." }),
      ] }),
    ],
  };
}

/** The teaching CV: centred header, uppercase headings, Vollkorn. Content as in the FlowCV PDF. */
export function teachingResume(): ResumeData {
  const i = newItem;
  return {
    profile: {
      name: "Arun Viswanathan", headline: "PhD Candidate | Senior Research Fellow",
      email: "arunviswanathan91@gmail.com | arunv@rgcb.res.in", phone: "+91-89219-77055", location: "Thiruvananthapuram, Kerala, India",
      links: [{ label: "LinkedIn", url: "" }],
      summary: "Ph.D. candidate and experienced biology educator with over 5 years of teaching and mentoring at both undergraduate and postgraduate levels. Adept at delivering engaging online lectures, managing virtual classrooms, and fostering inclusive learning environments.",
    },
    style: { ...DEFAULT_STYLE, font: "vollkorn", align: "center", headlinePos: "below", caps: "uppercase", headingStyle: "underline", footer: true, separator: "bar", subtitle: "below", layouts: { scores: { mode: "grid", cols: 3 } } },
    sections: [
      newSection("experience", { title: "Work Experience", items: [
        i({ title: "Tutor", subtitle: "Aifer Education", start: "Feb 2024", end: "present", location: "Kozhikode, India", body: "Conducting online CSIR-UGC exam preparation classes through Zoom for the subject of Developmental Biology.\nDelivering structured topic-wise lectures, sharing digital notes, and conducting weekly assessments.\nDesigned and led MCQ practice sessions, PYQ (previous year question) discussions, and comprehensive revision classes.\nEngaging students through interactive sessions, Q&A discussions, and exam-focused strategy support." }),
        i({ title: "Tutor", subtitle: "Research World Coaching Centre", start: "Dec 2016", end: "Jan 2020", location: "Calicut, India", body: "Taught Developmental Biology, Endocrinology, Reproductive Biology, and Molecular Biology.\nDesigned MCQ question banks and crash courses for national-level competitive exams." }),
        i({ title: "Senior Research Fellow & Ph.D. Candidate", subtitle: "Rajiv Gandhi Center for Biotechnology", start: "Feb 2022", end: "present", location: "Thiruvananthapuram, India", body: [
          "Performed bulk RNA-seq and proteomic data analysis using DESeq2, limma, and DEqMS pipelines.",
          "Analyzed customer-supplied 7+ drugs and derivatives using customer-preferred in-vitro experiments as a part of in-house research consultancy services, contributing 18% to the lab revenue.",
          "Offered research-based advice to 5+ research clients from biotech and non-biotech backgrounds to select from cell-based assays of need and help to navigate through post-analysis conclusions of assays in one-on-one discussions.",
          "Analysis and data representation of metagenomic and metabolomic data of 2 different preclinical projects using MetaboAnalyst and MicrobiomeAnalyst.",
          "Integrated Seahorse XFe analyzer into lab workflows for real-time metabolic profiling of cancer cell lines.",
          "Designed immunophenotyping panels (up to 6 colors) to profile immune cell populations in murine tumors.",
          "Trained and mentored 7+ master's students, project staff, and interns",
        ].join("\n") }),
        i({ title: "Junior Research Fellow & Ph.D. Candidate", subtitle: "Rajiv Gandhi Center for Biotechnology", start: "Feb 2020", end: "Feb 2022", location: "Thiruvananthapuram, India", body: "Managed two gastrointestinal cancer projects, overseeing experiments, data analysis (GraphPad Prism and R), and reporting.\nConducted multicolor flow cytometry (6-color panels) for tumor immunophenotyping and CD8+ T cell sorting.\nDelivered training sessions on gene-silencing techniques (siRNA, miRNA, shRNA) to biotechnology students.\nVerified knockout mouse genotypes and designed breeding strategies.\nPerformed RNA/DNA isolation and RT-PCR-based gene expression studies across multiple projects." }),
        i({ title: "Mentorship during Ph.D.", subtitle: "BRIC-Rajiv Gandhi Centre for Biotechnology", start: "Feb 2020", end: "present", location: "Thiruvananthapuram, India", body: "Trained and mentored over 10+ master's students and interns in molecular biology techniques and data analysis.\nDesigned and conducted academic sessions on experimental methods and R programming basics." }),
        i({ title: "Guest Lecturer", subtitle: "Al salama College of Optometry and Management Studies", start: "Sep 2017", end: "Jan 2020", location: "Calicut, India", body: "Delivered lectures in General and Ocular Biochemistry, Microbiology, and Nutrition.\nDeveloped and maintained online learning evaluations via Blackboard and Google Classroom.\nContributed to thesis evaluation committees for undergraduate optometry students." }),
      ] }),
      newSection("skills", { items: [
        i({ title: "Teaching Skills", body: "question skills, reinforcement skills, explaining skills, opening and close skills, small group discussions skills, class management skills, skills of organizing small group work and invidual work." }),
        i({ title: "Instructional Technology & Online Teaching Tools", body: "Proficient in Zoom for virtual lectures, breakout rooms, screen sharing, and live Q&A.\nExperienced with Google Classroom for managing coursework, announcements, and submissions.\nWorked with Blackboard to deliver quizzes, track performance, and create learning modules.\nComfortable using Microsoft Teams for collaborative sessions and resource sharing.\nFamiliar with Moodle-style LMS systems for course discussion boards, grading, and announcements.\nDeveloped and shared digital notes, lecture slides, and online assessment tools." }),
        i({ title: "Project Management & Consulting", body: "Scientific Consulting and Client Advising\nCross-functional Team Leadership and Mentoring\nRemote Scientific Collaboration" }),
        i({ title: "Other Techniques", body: "Circular dichroism, Dynamic light scattering, UV-visible spectroscopy, Cyclic voltammetry, and post-analysis of metabolomic data using MetaboAnalyst and fluorescent microscopy. PCR, RT-PCR, qPCR" }),
        i({ title: "Personal Skills", body: "Proficient in English. Intellectually curious with problem-solving, communication, decision-making, decisiveness, teamwork, creative solutions, listening skills, Time management, and negotiation." }),
        i({ title: "Data Analysis & Bioinformatics", body: "R Programming (Seurat, DESeq2, limma, clusterProfiler) with expertise in RStudio and Google Colab environments\nSingle-Cell RNA-Seq Analysis (10x Genomics datasets, Seurat pipelines)\nBulk RNA-seq & Proteomics Data Analysis (DEqMS, MetaboAnalyst, MicrobiomeAnalyst)\nFunctional Enrichment Analysis (GSEA, GO, KEGG) using clusterProfiler and ReactomePA\nData Visualization (ggplot2, ComplexHeatmap, EnhancedVolcano, custom R scripting)" }),
        i({ title: "Research & Laboratory Techniques", body: "Multicolor Flow Cytometry: Designed 6-color panels for murine tumor immunophenotyping.\nT Cell Functional Studies: Established protocols for T cell sorting, activation, and cancer co-cultures.\nSeahorse XFe Analysis: Conducted real-time metabolic profiling of cancer cells.\nMolecular Techniques: DNA/RNA isolation, genotyping, RT-PCR, and gene knockdown.\nCell Assays: Performed viability, migration, colony formation, apoptosis, and ROS analyses." }),
        i({ title: "Animal Studies", body: "General handling of mice, Breeding of Knockout mice, IVIS imaging systems and post-imaging analysis.\nAnimal models of pancreatic and colorectal cancer.\nHuman tissue processing for PDX models. PCR-based genotyping of knockout animals." }),
        i({ title: "Multicolor Flowcytometry", body: "Flow cytometry analysis and downstream analysis. Designed panels for immunophenotyping with up to 6 colours. Sample preparation and staining. Flow cytometry-based cell cycle analysis, Apoptosis analysis, ROS, MMP and cellular uptake of fluorescent-tagged drugs" }),
        i({ title: "Softwares", body: "GraphPad Prism, FlowJo, BD FACSDiva, CytExpert, R Studio and ImageJ" }),
      ] }),
      newSection("education", { items: [
        i({ title: "PhD in Biotechnology", subtitle: "Rajiv Gandhi Center for Biotechnology", start: "Feb 2020", end: "present", location: "Thiruvananthapuram, India" }),
        i({ title: "Master of Science in Biochemistry and Molecular Biology", subtitle: "Pondicherry University", start: "2014", end: "2016", location: "Pondicherry, India" }),
        i({ title: "Postgraduate Diploma in Biotechnology", subtitle: "Pondicherry University", start: "2015", end: "2016", location: "Pondicherry, India" }),
        i({ title: "Bachelor of Science and Education (B.Sc.Ed.)", subtitle: "Regional Institute of Education", start: "2009", end: "2013", location: "Mysore, India" }),
        i({ title: "Higher Secondary School", subtitle: "Medical College Campus Higher Secondary School", start: "2007", end: "2009", location: "Calicut, India", body: "Maths, Physics, Chemistry, Biology as compulsory subjects" }),
      ] }),
      newSection("publications", { items: [
        i({ title: "Targeting Acid Ceramidase enhances antitumor immune response in colorectal cancer", subtitle: "Journal of Advanced Research", start: "21 Dec 2023" }),
        i({ title: "Sphingosine 1-phosphate signaling during infection and immunity", subtitle: "Progress in Lipid Research", start: "24 Aug 2023" }),
        i({ title: "Synthesis and characterisation of arsenic nanoparticles and its interaction with DNA and cytotoxic potential on breast cancer cells", subtitle: "Chemico-Biological Interactions", start: "2017" }),
      ] }),
      newSection("certification", { items: [
        i({ title: "Good Clinical Practice", subtitle: "National Institute on Drug Abuse, NIH" }),
        i({ title: "Transporting Dangerous Goods Training", subtitle: "Mayo Clinic" }),
        i({ title: "Design and Interpretation of Clinical Trials", subtitle: "Johns Hopkins University" }),
        i({ title: "Data Management for Clinical Research", subtitle: "Vanderbilt University" }),
        i({ title: "FlowJo High parameter Data Analysis", subtitle: "BD Life Sciences" }),
        i({ title: "Certificate course in animal handling", subtitle: "Rajiv Gandhi Center for Biotechnology, Govt. of India" }),
        i({ title: "Flow Cytometry: Basics, Applications, Experimental Designing and Data Analysis", subtitle: "Flowcytometry Solutions (P) Ltd, Jaipur, India" }),
      ] }),
      newSection("languages", { items: [i({ title: "English" }), i({ title: "Malayalam" })] }),
      newSection("scores", { items: [
        i({ title: "CSIR/UGC - JRF/NET Life Science", body: "UGC June 2019 - AIR 62\nUGC December 2017 - AIR 44\nUGC December 2016 - AIR 66\nCSIR June 2017 - AIR 56" }),
        i({ title: "UGC - JRF/NET Dec 2017", body: "Qualified UGC-JRF/NET in life sciences with AIR 44" }),
        i({ title: "GATE Mar 2017", body: "Qualified with Gate score: 504, AIR: 543" }),
        i({ title: "UGC-JRF/NET Dec 2016", body: "Qualified UGC JRF/NET in life sciences with AIR: 66" }),
        i({ title: "UGC - JRF/NET June 2019", body: "Qualified UGC-JRF/NET in life sciences with AIR 62" }),
        i({ title: "CSIR-JRF/NET Jun 2017", body: "Qualified CSIR JRF/NET in life sciences with AIR 56" }),
      ] }),
      newSection("volunteering", { items: [
        i({ title: "Invited Guest", subtitle: "Kerala Sasthra Sahithya Prishad", start: "2021", location: "Thiruvananthapuram, India", body: "Delivered a talk on gender and inclusion during the \"Gender Talks of Kerala\" webinar event." }),
        i({ title: "Resource Person", subtitle: "Queerythm", start: "Dec 2020", location: "Thiruvananthapuram, India", body: "Conducted educational sessions for 11th standard students at National Service Scheme (NSS) camps on Sexual Orientation and Gender Identity (SOGI) awareness based on SAMADARSHAN guidelines." }),
        i({ title: "Resource Person", subtitle: "Kerala Institute of Local Administration (KILA)", start: "Jan 2020", location: "Thrissur, India", body: "Contributed to the preparation of training modules and handbooks for training resource persons (RPs) to promote LGBTQI+ rights and sensitivity in local self-government bodies." }),
      ] }),
      newSection("conferences", { items: [
        i({ title: "Best poster presentation (Top 5)", subtitle: "National Symposium for Biotechnology for Sustainable Development 2025", start: "May 2025", location: "Thiruvananthapuram, India" }),
        i({ title: "Best Oral Presentation (2nd Place)", subtitle: "Global Cancer Consortium Conference (GCC 2024)" }),
        i({ title: "Frontiers in Cancer Science 2025", location: "Singapore" }),
      ] }),
    ],
  };
}
