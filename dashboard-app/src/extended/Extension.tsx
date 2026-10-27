import { useEffect } from "react";
import { useRoute, type Route } from "./lib/route";
import { toneStyle, type SectionId, SECTIONS } from "./lib/sections";
import "./styles.css";
import { QuickAddHost } from "./components/QuickAdd.tsx";
import { AgendaView } from "./modules/agenda/AgendaView.tsx";
import { BudgetView } from "./modules/budget/BudgetView.tsx";
import { DeadlinePage } from "./modules/deadlines/DeadlinePage.tsx";
import { DeadlinesView } from "./modules/deadlines/DeadlinesView.tsx";
import { HabitsView } from "./modules/habits/HabitsView.tsx";
import { HomeView } from "./modules/home/HomeView.tsx";
import { LoansView } from "./modules/loans/LoansView.tsx";
import { MeetingPage } from "./modules/meetings/MeetingPage.tsx";
import { MeetingsView } from "./modules/meetings/MeetingsView.tsx";
import { NotePage } from "./modules/notes/NotePage.tsx";
import { NotesView } from "./modules/notes/NotesView.tsx";
import { PaperPage } from "./modules/papers/PaperPage.tsx";
import { PapersView } from "./modules/papers/PapersView.tsx";
import { PrintMeetings, PrintProject } from "./modules/print/PrintViews.tsx";
import { ReviewView } from "./modules/review/ReviewView.tsx";
import { ProjectsView } from "./modules/projects/ProjectsView.tsx";
import { SearchView } from "./modules/search/Search.tsx";
import { TasksView } from "./modules/tasks/TasksView.tsx";
function Page({ route }: { route: Route }) {
  const [section, id] = route.path;
  switch (section) {
    case "agenda": return <AgendaView />;
    case "review": return <ReviewView />;
    // One project page: the old workspace address opens it, keeping the tab.
    case "projects": if (id) { const tab = route.query.get("tab"); location.replace(`#/project/${id}${tab ? `?tab=${tab}` : ""}`); return null; } return <ProjectsView route={route} />;
    case "tasks": return <TasksView route={route} />;
    case "papers": return id ? <PaperPage id={id} /> : <PapersView route={route} />;
    case "notes": return id ? <NotePage id={id} /> : <NotesView route={route} />;
    case "meetings": return id ? <MeetingPage id={id} /> : <MeetingsView route={route} />;
    case "deadlines": return id ? <DeadlinePage id={id} /> : <DeadlinesView route={route} />;
    case "budget": return <BudgetView route={route} />;
    case "loans": return <LoansView />;
    case "habits": return <HabitsView />;
    case "search": return <SearchView route={route} />;
    case "settings": location.replace("#/settings"); return null;
    default: return <HomeView />;
  }
}


export function Extension({home=false}:{home?:boolean}){
 const current=useRoute();const route=home?{path:["home"],query:new URLSearchParams()}:current;
 const section=route.path[0];const tone=(section in SECTIONS?section:"home") as SectionId;
 useEffect(()=>{document.body.classList.toggle("workspace-print",section==="print");return()=>document.body.classList.remove("workspace-print")},[section]);
 return <div className="extension-workspace" style={toneStyle(tone)}>
 {section==="print" ? route.path[1]==="meetings"?<PrintMeetings ids={(route.query.get("ids")??"").split(",").filter(Boolean)}/>:<PrintProject id={route.query.get("id")??""}/>:<Page route={route}/>}
 <QuickAddHost/>
 </div>;
}
