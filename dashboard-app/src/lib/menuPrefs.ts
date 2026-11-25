// Which menu items are shown, and which groups are folded. Kept in this browser only,
// so a phone can show a shorter menu than a desktop. Hiding an item never removes the
// page: it stays reachable from Search & commands and from links elsewhere.
import { useSyncExternalStore } from "react";
import { Highlighter, PenLine, type LucideIcon } from "lucide-react";
import { ENTITIES, ENTITY_ORDER } from "../entities";
import { SECTIONS, type SectionId } from "../extended/lib/sections";
import { loadRaw, save } from "./persist";

export interface MenuItem { key: string; label: string; icon: LucideIcon }
export interface MenuGroup { id: string; label: string; items: MenuItem[] }

export const RESEARCH_SECTIONS: SectionId[] = ["agenda", "review", "goals", "projects", "thesis", "tasks", "papers", "notes", "experiments", "meetings", "deadlines", "trips", "funding", "resumes", "website"];
export const PERSONAL_SECTIONS: SectionId[] = ["budget", "loans", "networth", "habits"];
export const toolKey = (id: SectionId) => `tool:${id}`;
export const viewKey = (id: string) => `view:${id}`;

const tool = (id: SectionId): MenuItem => ({ key: toolKey(id), label: SECTIONS[id].label, icon: SECTIONS[id].icon });
/** Every item that can be hidden. Home, Trash and Settings always stay. */
export const MENU_GROUPS: MenuGroup[] = [
  { id: "research", label: "Research & planning", items: RESEARCH_SECTIONS.map(tool) },
  { id: "personal", label: "Personal", items: PERSONAL_SECTIONS.map(tool) },
  { id: "workflows", label: "Workflows", items: [
    ...ENTITY_ORDER.filter((k) => k !== "tasks").map((k) => ({ key: viewKey(k), label: ENTITIES[k].plural, icon: ENTITIES[k].icon as LucideIcon })),
    { key: viewKey("clippings"), label: "Clippings", icon: Highlighter },
    { key: viewKey("writing"), label: "Writing", icon: PenLine },
  ] },
];

export interface MenuPrefs { hidden: string[]; folded: string[] }
const EMPTY: MenuPrefs = { hidden: [], folded: [] };
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

let prefs: MenuPrefs = (() => {
  const raw = loadRaw<Partial<MenuPrefs> | null>("menu", null);
  return raw && typeof raw === "object" ? { hidden: strings(raw.hidden), folded: strings(raw.folded) } : EMPTY;
})();
const listeners = new Set<() => void>();
function set(next: MenuPrefs) {
  prefs = next;
  save("menu", next);
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const flip = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

export function useMenuPrefs() {
  const p = useSyncExternalStore(subscribe, () => prefs);
  return {
    hidden: p.hidden,
    isShown: (key: string) => !p.hidden.includes(key),
    isFolded: (group: string) => p.folded.includes(group),
    toggleShown: (key: string) => set({ ...prefs, hidden: flip(prefs.hidden, key) }),
    setGroupShown: (group: MenuGroup, shown: boolean) => {
      const keys = group.items.map((i) => i.key);
      set({ ...prefs, hidden: shown ? prefs.hidden.filter((k) => !keys.includes(k)) : [...new Set([...prefs.hidden, ...keys])] });
    },
    toggleFolded: (group: string) => set({ ...prefs, folded: flip(prefs.folded, group) }),
    showAll: () => set({ ...prefs, hidden: [] }),
  };
}
