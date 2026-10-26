import { useEffect, useState, type ReactNode } from "react";
import { Check, CloudOff, Loader2, Search, type LucideIcon } from "lucide-react";
import { SECTIONS, type SectionId } from "../lib/sections.ts";
import type { SaveStatus } from "../lib/useAutosave.ts";

export function PageHeader({ title, subtitle, kicker, actions, section }: { title: ReactNode; subtitle?: ReactNode; kicker?: ReactNode; actions?: ReactNode; section?: SectionId }) {
  const Icon = section ? SECTIONS[section].icon : null;
  return (
    <header className="page-head">
      <div className="page-head-text">
        {Icon && <span className="sec-chip lg" aria-hidden><Icon size={22} /></span>}
        <div>
          {kicker && <div className="kicker">{kicker}</div>}
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Tabs<T extends string>({ value, options, onChange, counts }: { value: T; options: [T, string][]; onChange: (v: T) => void; counts?: Partial<Record<T, number>> }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {label}
          {counts?.[v] ? <span className="tab-count">{counts[v]}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Empty state: an icon in the section colour, one line, and an optional action. */
export function Empty({ children, icon: Icon, action }: { children: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="empty">
      {Icon && <span className="empty-icon" aria-hidden><Icon size={20} /></span>}
      <div>{children}</div>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone ?? ""}`}>{children}</span>;
}

export function SaveIndicator({ status, error }: { status: SaveStatus; error?: string }) {
  const map = {
    saved: [<Check key="i" size={14} />, "Saved"],
    unsaved: [<Loader2 key="i" size={14} />, "Unsaved changes"],
    saving: [<Loader2 key="i" size={14} className="spin" />, "Saving…"],
    error: [<CloudOff key="i" size={14} />, `Not saved: ${error ?? "error"} — will retry`],
  } as const;
  const [icon, label] = map[status];
  return (
    <span className={`save-status ${status}`} role="status" aria-live="polite">
      {icon}
      {label}
    </span>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = window.setTimeout(() => local !== value && onChange(local), 200);
    return () => window.clearTimeout(t);
  }, [local, value, onChange]);
  return (
    <label className="searchbox">
      <Search size={15} aria-hidden />
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={local} onChange={(e) => setLocal(e.target.value)} />
    </label>
  );
}

export function Select<T extends string>({ value, options, onChange, label, allLabel }: { value: T | ""; options: [T, string][]; onChange: (v: T | "") => void; label: string; allLabel?: string }) {
  return (
    <select className="filter" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T | "")}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ error }: { error: string }) {
  return error ? <p className="error" role="alert">{error}</p> : null;
}

export function Stars({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  return (
    <span className="stars" aria-label={`Rating ${value ?? 0} of 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" className={n <= (value ?? 0) ? "on" : ""} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(value === n ? null : n)}>★</button>
        ) : (
          <span key={n} className={n <= (value ?? 0) ? "on" : ""}>★</span>
        ),
      )}
    </span>
  );
}

/** Ask before anything destructive. */
export function confirmDanger(message: string): boolean {
  return window.confirm(message);
}

export function priorityTone(p: string) {
  return p === "urgent" ? "danger" : p === "high" ? "warn" : p === "low" ? "quiet" : "";
}

