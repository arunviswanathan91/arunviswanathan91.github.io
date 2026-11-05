import { useCallback, useEffect, useState } from "react";

/**
 * Show a change the moment it is made, while it saves. `rows` are the loaded records;
 * `apply(id, patch, save)` updates the screen at once, then runs `save`; if it fails, the
 * change is undone and the error returned. Fresh rows from the server replace the overlay.
 */
export function useOptimistic<T extends { id: string }>(rows: T[] | undefined) {
  const [overlay, setOverlay] = useState<Record<string, Partial<T>>>({});
  useEffect(() => setOverlay({}), [rows]);
  const merged = (rows ?? []).map((r) => (overlay[r.id] ? { ...r, ...overlay[r.id] } : r));
  const apply = useCallback(async (id: string, patch: Partial<T>, save: () => Promise<unknown>): Promise<string> => {
    setOverlay((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
    try {
      await save();
      return "";
    } catch (e) {
      setOverlay((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
      return (e as Error).message;
    }
  }, []);
  return [merged, apply] as const;
}
