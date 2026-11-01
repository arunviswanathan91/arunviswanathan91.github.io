import { createRoot } from "react-dom/client";
import "./extended/styles.css";
import { ResumePreview } from "./extended/modules/resumes/ResumePreview.tsx";
import { teachingResume } from "./extended/modules/resumes/starter.ts";
createRoot(document.getElementById("r")!).render(<ResumePreview data={teachingResume()} />);
