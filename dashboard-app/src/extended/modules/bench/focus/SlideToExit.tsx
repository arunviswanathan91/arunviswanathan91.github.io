import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronsRight } from "lucide-react";
import "./focus.css";

/** How far along the track the handle must be let go for the slide to count. */
export const EXIT_AT = 0.8;
/** Where the handle sits (0 to 1) for a pointer at `x`, on a track starting at `left` of `width`, with a handle of `handle`. */
export function slideFraction(x: number, left: number, width: number, handle: number): number {
  const travel = width - handle;
  if (!(travel > 0)) return 0;
  return Math.min(1, Math.max(0, (x - left - handle / 2) / travel));
}

/**
 * Leaves a full-screen mode by sliding a handle across, so a stray touch cannot.
 * The handle is a button: Enter or Space on it leaves too, for a keyboard.
 */
export function SlideToExit({ onExit, label = "Slide to exit" }: { onExit: () => void; label?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  const fraction = (e: PointerEvent) => {
    const box = track.current?.getBoundingClientRect();
    return box ? slideFraction(e.clientX, box.left, box.width, box.height) : 0;
  };
  function down(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setHeld(true);
  }
  function up(e: PointerEvent<HTMLButtonElement>) {
    if (!held) return;
    setHeld(false);
    if (fraction(e) >= EXIT_AT) onExit();
    else setAt(0);
  }
  return (
    <div ref={track} className="slide-exit" data-held={held || undefined} style={{ "--at": at } as CSSProperties}>
      <span className="slide-exit-label" aria-hidden>{label}</span>
      <button type="button" className="slide-exit-handle" aria-label={label}
        onPointerDown={down} onPointerMove={(e) => held && setAt(fraction(e))} onPointerUp={up} onPointerCancel={() => { setHeld(false); setAt(0); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExit(); } }}>
        <ChevronsRight size={20} aria-hidden />
      </button>
    </div>
  );
}
