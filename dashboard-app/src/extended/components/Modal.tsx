import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    // showModal() focuses the close button; start in the first field instead.
    dialog?.querySelector<HTMLElement>("[autofocus], input, select, textarea")?.focus();
  }, []);
  return (
    <dialog ref={ref} className={`modal ${wide ? "wide" : ""}`} onClose={onClose} onMouseDown={(e) => e.target === ref.current && onClose()}>
      <div className="modal-body">
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

