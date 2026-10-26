import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { rpc, useLoad } from "../lib/db.ts";

/** Tags shared across the workspace; suggestions come from every tag already in use. */
export function useAllTags(): string[] {
  const { data } = useLoad(() => rpc<{ tag: string }[]>("all_tags"), []);
  return (data ?? []).map((t) => t.tag);
}

export function normalizeTag(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, "-").replace(/^#/, "");
}

export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState("");
  const all = useAllTags();
  const listId = useId();

  function add(raw: string) {
    const t = normalizeTag(raw);
    if (t && !value.includes(t)) onChange([...value, t]);
    setText("");
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="tag">
          #{t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X size={12} /></button>
        </span>
      ))}
      <input
        list={listId}
        value={text}
        placeholder={value.length ? "" : "Add tags…"}
        aria-label="Add tag"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>
        {all.filter((t) => !value.includes(t)).map((t) => <option key={t} value={t} />)}
      </datalist>
    </div>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="tag-list">
      {tags.map((t) => <span key={t} className="tag small">#{t}</span>)}
    </span>
  );
}

