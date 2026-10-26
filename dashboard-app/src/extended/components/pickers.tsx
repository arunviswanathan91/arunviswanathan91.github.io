import { useState } from "react";
import { X } from "lucide-react";
import { list, useLoad } from "../lib/db.ts";
import type { ContactRow, Project } from "../lib/types.ts";

export function useProjects() {
  const { data = [], reload } = useLoad(() => list<Project>("projects", { order: [["title"]] }), []);
  return { projects: data, reload };
}

export function projectName(projects: Project[], id: string | null | undefined): string {
  return projects.find((p) => p.id === id)?.title ?? "";
}

/** Single optional project. Archived projects are hidden unless already selected. */
export function ProjectSelect({ value, onChange, label = "Project", none = "No project" }: { value: string | null; onChange: (id: string | null) => void; label?: string; none?: string }) {
  const { projects } = useProjects();
  const options = projects.filter((p) => p.status !== "archived" || p.id === value);
  return (
    <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{none}</option>
      {options.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
    </select>
  );
}

/** Several items chosen from a list, shown as removable chips. */
export function MultiPicker({ selected, options, onAdd, onRemove, placeholder }: {
  selected: string[];
  options: { id: string; label: string }[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  placeholder: string;
}) {
  const [pick, setPick] = useState("");
  const byId = new Map(options.map((o) => [o.id, o.label]));
  return (
    <div className="multi-picker">
      {selected.map((id) => (
        <span key={id} className="chip">
          {byId.get(id) ?? "…"}
          <button type="button" aria-label={`Remove ${byId.get(id) ?? ""}`} onClick={() => onRemove(id)}><X size={12} /></button>
        </span>
      ))}
      <select
        aria-label={placeholder}
        value={pick}
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
          setPick("");
        }}
      >
        <option value="">{placeholder}</option>
        {options.filter((o) => !selected.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function useContacts() {
  const { data = [] } = useLoad(() => list<ContactRow>("contacts", { order: [["name"]] }), []);
  return data;
}

