import { useEffect, useRef, useState } from "react";

// In-page replacements for alert / confirm / prompt. Call notify(), ask() or askText() from anywhere;
// <DialogHost /> (mounted once in App) shows them one at a time.
type Request =
  | { kind: "notice"; message: string; done: () => void }
  | { kind: "confirm"; message: string; confirmLabel: string; done: (ok: boolean) => void }
  | { kind: "text"; message: string; initial: string; done: (value: string | null) => void };

let queue: Request[] = [];
let listener: (() => void) | null = null;
const push = (r: Request) => { queue = [...queue, r]; listener?.(); };

/** Shows a message; does not block the caller. */
export function notify(message: string): void {
  push({ kind: "notice", message, done: () => {} });
}

/** Yes/no question; resolves true only if the user confirms. */
export function ask(message: string, confirmLabel = "Confirm"): Promise<boolean> {
  return new Promise((resolve) => push({ kind: "confirm", message, confirmLabel, done: resolve }));
}

/** Asks for a line of text; resolves null if cancelled. */
export function askText(message: string, initial = ""): Promise<string | null> {
  return new Promise((resolve) => push({ kind: "text", message, initial, done: resolve }));
}

export function DialogHost() {
  const [, rerender] = useState(0);
  useEffect(() => {
    listener = () => rerender((n) => n + 1);
    return () => { listener = null; };
  }, []);
  const current = queue[0];
  if (!current) return null;
  return <DialogView key={queue.length + current.message} request={current} onClose={() => { queue = queue.slice(1); rerender((n) => n + 1); }} />;
}

function DialogView({ request, onClose }: { request: Request; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(request.kind === "text" ? request.initial : "");
  const settled = useRef(false);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLElement>("input, button.primary")?.focus();
  }, []);
  // Every way out (buttons, Escape) settles the request exactly once. Clicking outside does nothing.
  const finish = (ok: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (request.kind === "notice") request.done();
    else if (request.kind === "confirm") request.done(ok);
    else request.done(ok ? text : null);
    ref.current?.close();
    onClose();
  };
  return (
    <dialog ref={ref} className="modal dialog-small" role={request.kind === "notice" ? "alert" : "dialog"} aria-label={request.message}
      onCancel={(e) => { e.preventDefault(); finish(false); }}>
      <form className="modal-body form" onSubmit={(e) => { e.preventDefault(); finish(true); }}>
        <p className="dialog-message">{request.message}</p>
        {request.kind === "text" && <input value={text} onChange={(e) => setText(e.target.value)} aria-label={request.message} />}
        <div className="row dialog-actions">
          {request.kind !== "notice" && <button type="button" onClick={() => finish(false)}>Cancel</button>}
          <button type="submit" className={request.kind === "confirm" ? "danger-button" : "primary"}>{request.kind === "confirm" ? request.confirmLabel : "OK"}</button>
        </div>
      </form>
    </dialog>
  );
}
