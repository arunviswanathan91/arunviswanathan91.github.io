import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders markdown with GitHub extras: tables, checklists, strikethrough, autolinks. */
export function MarkdownView({ text, className = "" }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  return (
    <div className={`markdown ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Plain textarea with a Write / Preview toggle. */
export function MarkdownEditor({ value, onChange, onBlur, placeholder, rows = 8, label }: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  label?: string;
}) {
  const [preview, setPreview] = useState(true);
  return (
    <div className="md-editor">
      <div className="md-toolbar">
        {label && <span className="md-label">{label}</span>}
        <div className="md-modes" role="tablist">
          <button type="button" role="tab" aria-selected={!preview} className={!preview ? "on" : ""} onClick={() => setPreview(false)}>Edit</button>
          <button type="button" role="tab" aria-selected={preview} className={preview ? "on" : ""} onClick={() => setPreview(true)}>Preview</button>
        </div>
      </div>
      {preview ? (
        <div className="md-preview">{value.trim() ? <MarkdownView text={value} /> : <p className="muted">Nothing yet.</p>}</div>
      ) : (
        <textarea
          aria-label={label ?? "Markdown"}
          value={value}
          rows={rows}
          placeholder={placeholder ?? "Markdown: # heading, - list, - [ ] checklist, | table |, ```code```"}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            // Tab inserts two spaces instead of leaving the editor
            if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              const t = e.currentTarget;
              const { selectionStart: s, selectionEnd: end } = t;
              onChange(value.slice(0, s) + "  " + value.slice(end));
              requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
            }
          }}
        />
      )}
    </div>
  );
}

