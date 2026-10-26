import { useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import type { Link } from "../lib/types.ts";

export function LinksEditor({ value, onChange }: { value: Link[]; onChange: (links: Link[]) => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  function add() {
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    onChange([...value, { label: label.trim() || u.replace(/^https?:\/\//, ""), url: u }]);
    setLabel("");
    setUrl("");
  }

  return (
    <div className="links-editor">
      {value.length > 0 && (
        <ul className="link-list">
          {value.map((l, i) => (
            <li key={i}>
              <a href={l.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {l.label}</a>
              <button type="button" className="icon" aria-label={`Remove link ${l.label}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <input placeholder="Label (optional)" aria-label="Link label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input placeholder="https://…" aria-label="Link URL" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <button type="button" onClick={add} aria-label="Add link"><Plus size={15} /></button>
      </div>
    </div>
  );
}

export function LinksView({ links }: { links: Link[] }) {
  if (!links.length) return null;
  return (
    <ul className="link-list">
      {links.map((l, i) => (
        <li key={i}><a href={l.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {l.label}</a></li>
      ))}
    </ul>
  );
}

