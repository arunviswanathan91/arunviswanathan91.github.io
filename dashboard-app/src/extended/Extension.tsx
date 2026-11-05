import { lazy, Suspense, useEffect } from "react";
import { useRoute, type Route } from "./lib/route";
import { toneStyle, type SectionId, SECTIONS } from "./lib/sections";
import "./styles.css";
import { QuickAddHost } from "./components/QuickAdd.tsx";
import { TasksView } from "./modules/tasks/TasksView.tsx";
import { SearchView } from "./modules/search/Search.tsx";
import { NotesView } from "./modules/notes/NotesView.tsx";
import { HabitsView } from "./modules/habits/HabitsView.tsx";

// Each page is its own download, fetched the first time it opens; once the
// workspace is idle the rest are fetched in the background, so opening a page
// later rarely waits. Tasks, Habits, Notes and Search stay in the main bundle:
// the shell, Quick add and the command palette use them directly.
const loadAgendaView = () => import("./modules/agenda/AgendaView.tsx");
const loadBudgetView = () => import("./modules/budget/BudgetView.tsx");
const loadDeadlinePage = () => import("./modules/deadlines/DeadlinePage.tsx");
const loadDeadlinesView = () => import("./modules/deadlines/DeadlinesView.tsx");
const loadHomeView = () => import("./modules/home/HomeView.tsx");
const loadLoansView = () => import("./modules/loans/LoansView.tsx");
const loadNetWorthView = () => import("./modules/networth/NetWorthView.tsx");
const loadMeetingPage = () => import("./modules/meetings/MeetingPage.tsx");
const loadExperimentsView = () => import("./modules/experiments/ExperimentsView.tsx");
const loadThesisView = () => import("./modules/planning/ThesisView.tsx");
const loadGoalsView = () => import("./modules/planning/GoalsView.tsx");
const loadTripsView = () => import("./modules/planning/TripsView.tsx");
const loadTripPage = () => import("./modules/planning/TripPage.tsx");
const loadFundingView = () => import("./modules/alerts/FundingView.tsx");
const loadExperimentPage = () => import("./modules/experiments/ExperimentPage.tsx");
const loadMeetingsView = () => import("./modules/meetings/MeetingsView.tsx");
const loadNotePage = () => import("./modules/notes/NotePage.tsx");
const loadPaperPage = () => import("./modules/papers/PaperPage.tsx");
const loadPapersView = () => import("./modules/papers/PapersView.tsx");
const loadPrintViews = () => import("./modules/print/PrintViews.tsx");
const loadReviewView = () => import("./modules/review/ReviewView.tsx");
const loadProjectsView = () => import("./modules/projects/ProjectsView.tsx");
const loadResumeEditor = () => import("./modules/resumes/ResumeEditor.tsx");
const loadResumesView = () => import("./modules/resumes/ResumesView.tsx");
const AgendaView = lazy(() => loadAgendaView().then((m) => ({ default: m.AgendaView })));
const BudgetView = lazy(() => loadBudgetView().then((m) => ({ default: m.BudgetView })));
const DeadlinePage = lazy(() => loadDeadlinePage().then((m) => ({ default: m.DeadlinePage })));
const DeadlinesView = lazy(() => loadDeadlinesView().then((m) => ({ default: m.DeadlinesView })));
const HomeView = lazy(() => loadHomeView().then((m) => ({ default: m.HomeView })));
const NetWorthView = lazy(() => loadNetWorthView().then((m) => ({ default: m.NetWorthView })));
const LoansView = lazy(() => loadLoansView().then((m) => ({ default: m.LoansView })));
const ThesisView = lazy(() => loadThesisView().then((m) => ({ default: m.ThesisView })));
const GoalsView = lazy(() => loadGoalsView().then((m) => ({ default: m.GoalsView })));
const TripsView = lazy(() => loadTripsView().then((m) => ({ default: m.TripsView })));
const FundingView = lazy(() => loadFundingView().then((m) => ({ default: m.FundingView })));
const TripPage = lazy(() => loadTripPage().then((m) => ({ default: m.TripPage })));
const ExperimentsView = lazy(() => loadExperimentsView().then((m) => ({ default: m.ExperimentsView })));
const ExperimentPage = lazy(() => loadExperimentPage().then((m) => ({ default: m.ExperimentPage })));
const MeetingPage = lazy(() => loadMeetingPage().then((m) => ({ default: m.MeetingPage })));
const MeetingsView = lazy(() => loadMeetingsView().then((m) => ({ default: m.MeetingsView })));
const NotePage = lazy(() => loadNotePage().then((m) => ({ default: m.NotePage })));
const PaperPage = lazy(() => loadPaperPage().then((m) => ({ default: m.PaperPage })));
const PapersView = lazy(() => loadPapersView().then((m) => ({ default: m.PapersView })));
const PrintMeetings = lazy(() => loadPrintViews().then((m) => ({ default: m.PrintMeetings })));
const PrintProject = lazy(() => loadPrintViews().then((m) => ({ default: m.PrintProject })));
const ReviewView = lazy(() => loadReviewView().then((m) => ({ default: m.ReviewView })));
const ProjectsView = lazy(() => loadProjectsView().then((m) => ({ default: m.ProjectsView })));
const ResumeEditor = lazy(() => loadResumeEditor().then((m) => ({ default: m.ResumeEditor })));
const ResumesView = lazy(() => loadResumesView().then((m) => ({ default: m.ResumesView })));
const PAGE_LOADERS = [loadAgendaView, loadBudgetView, loadDeadlinePage, loadDeadlinesView, loadHomeView, loadLoansView, loadNetWorthView, loadMeetingPage, loadExperimentsView, loadThesisView, loadGoalsView, loadTripsView, loadTripPage, loadFundingView, loadExperimentPage, loadMeetingsView, loadNotePage, loadPaperPage, loadPapersView, loadPrintViews, loadReviewView, loadProjectsView, loadResumeEditor, loadResumesView];
let prefetched = false;
function prefetchPages() {
  if (prefetched) return;
  prefetched = true;
  const run = () => PAGE_LOADERS.forEach((load) => void load().catch(() => { prefetched = false; }));
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 }); else setTimeout(run, 1500);
}
/** Shown for the moment a page's code is still downloading: same skeleton as its data. */
const PageLoading = () => <section className="is-loading" aria-busy="true" />;

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
    case "thesis": return <ThesisView />;
    case "goals": return <GoalsView route={route} />;
    case "funding": return <FundingView route={route} />;
    case "trips": return id ? <TripPage id={id} /> : <TripsView route={route} />;
    case "experiments": return id ? <ExperimentPage id={id} /> : <ExperimentsView route={route} />;
    case "meetings": return id ? <MeetingPage id={id} /> : <MeetingsView route={route} />;
    case "deadlines": return id ? <DeadlinePage id={id} /> : <DeadlinesView route={route} />;
    case "budget": return <BudgetView route={route} />;
    case "loans": return <LoansView />;
    case "networth": return <NetWorthView />;
    case "habits": return <HabitsView />;
    case "resumes": return id ? <ResumeEditor id={id} /> : <ResumesView />;
    case "search": return <SearchView route={route} />;
    case "settings": location.replace("#/settings"); return null;
    default: return <HomeView />;
  }
}


export function Extension({home=false}:{home?:boolean}){
 const current=useRoute();const route=home?{path:["home"],query:new URLSearchParams()}:current;
 const section=route.path[0];const tone=(section in SECTIONS?section:"home") as SectionId;
 useEffect(prefetchPages,[]);
 useEffect(()=>{document.body.classList.toggle("workspace-print",section==="print");return()=>document.body.classList.remove("workspace-print")},[section]);
 return <div className="extension-workspace" style={toneStyle(tone)}>
 <Suspense fallback={<PageLoading/>}>{section==="print" ? route.path[1]==="meetings"?<PrintMeetings ids={(route.query.get("ids")??"").split(",").filter(Boolean)}/>:<PrintProject id={route.query.get("id")??""}/>:<Page route={route}/>}</Suspense>
 <QuickAddHost/>
 </div>;
}
