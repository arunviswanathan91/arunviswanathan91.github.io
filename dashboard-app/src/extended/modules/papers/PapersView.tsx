import { useState } from "react";
import { Plus } from "lucide-react";
import { list, useLoad } from "../../lib/db.ts";
import { setQuery, type Route } from "../../lib/route.ts";
import type { Paper, PaperStatus, ProjectPaper } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { useProjects } from "../../components/pickers.tsx";
import { useAllTags } from "../../components/TagInput.tsx";
import { ErrorText, PageHeader, SearchBox, Select, Tabs } from "../../components/ui.tsx";
import { PaperForm } from "./PaperForm.tsx";
import { PaperRows } from "./PaperRows.tsx";

type StatusTab = PaperStatus | "active" | "all";
type Sort = "added" | "year" | "title" | "rating";

export function PapersView({ route }: { route: Route }) {
  const status = (route.query.get("status") as StatusTab) || "active";
  const project = route.query.get("project") ?? "";
  const tag = route.query.get("tag") ?? "";
  const year = route.query.get("year") ?? "";
  const rating = route.query.get("rating") ?? "";
  const search = route.query.get("q") ?? "";
  const sort = (route.query.get("sort") as Sort) || "added";
  const [adding, setAdding] = useState(false);
  const { projects } = useProjects();
  const tags = useAllTags();

  const { data, error } = useLoad(async () => {
    const [papers, links] = await Promise.all([list<Paper>("papers"), list<ProjectPaper>("project_papers")]);
    return { papers, links };
  }, []);
  const papers = data?.papers ?? [];
  const years = [...new Set(papers.map((p) => p.year).filter((y): y is number => !!y))].sort((a, b) => b - a);

  const base = papers.filter(
    (p) =>
      (!project || data!.links.some((l) => l.project_id === project && l.paper_id === p.id)) &&
      (!tag || p.tags.includes(tag)) &&
      (!year || String(p.year) === year) &&
      (!rating || (p.rating ?? 0) >= Number(rating)) &&
      (!search ||
        [p.title, p.authors.join(" "), p.publication, p.abstract, p.summary, p.findings, p.doi, p.tags.join(" ")].join(" ").toLowerCase().includes(search.toLowerCase())),
  );
  const inTab = (p: Paper) => (status === "all" ? true : status === "active" ? p.status !== "archived" : p.status === status);
  const counts = Object.fromEntries((["to_read", "reading", "read", "to_cite"] as PaperStatus[]).map((s) => [s, base.filter((p) => p.status === s).length]));
  const shown = base.filter(inTab).sort((a, b) =>
    sort === "year" ? (b.year ?? 0) - (a.year ?? 0) : sort === "title" ? a.title.localeCompare(b.title) : sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) : b.created_at.localeCompare(a.created_at),
  );

  return (
    <section>
      <PageHeader
        section="papers"
        title="Papers"
        subtitle="Your reading library. Each paper is stored once and can be linked to any number of projects."
        actions={<button className="primary" onClick={() => setAdding(true)}><Plus size={16} /> Paper</button>}
      />
      <Tabs
        value={status}
        options={[["active", "Library"], ["to_read", "To read"], ["reading", "Reading"], ["read", "Read"], ["to_cite", "To cite"], ["archived", "Archived"]]}
        counts={counts}
        onChange={(v) => setQuery("status", v)}
      />
      <div className="filters">
        <SearchBox value={search} onChange={(v) => setQuery("q", v)} placeholder="Search title, authors, notes" />
        <Select label="Project" allLabel="Any project" value={project} options={projects.map((p) => [p.id, p.title] as [string, string])} onChange={(v) => setQuery("project", v)} />
        <Select label="Tag" allLabel="Any tag" value={tag} options={tags.map((t) => [t, `#${t}`] as [string, string])} onChange={(v) => setQuery("tag", v)} />
        <Select label="Year" allLabel="Any year" value={year} options={years.map((y) => [String(y), String(y)] as [string, string])} onChange={(v) => setQuery("year", v)} />
        <Select label="Rating" allLabel="Any rating" value={rating} options={[["3", "★★★ or more"], ["4", "★★★★ or more"], ["5", "★★★★★"]]} onChange={(v) => setQuery("rating", v)} />
        <Select label="Sort" value={sort} options={[["added", "Recently added"], ["year", "Year"], ["title", "Title"], ["rating", "Rating"]] as [Sort, string][]} onChange={(v) => setQuery("sort", v || undefined)} />
      </div>
      <ErrorText error={error} />
      <div className="card list-card">
        {data && <PaperRows papers={shown} empty={papers.length ? "No papers match these filters." : "Your library is empty. Add a paper by DOI, arXiv or PubMed id."} />}
      </div>
      {adding && (
        <Modal title="Add paper" wide onClose={() => setAdding(false)}>
          <PaperForm presetProjectId={project || undefined} onDone={() => setAdding(false)} />
        </Modal>
      )}
    </section>
  );
}

