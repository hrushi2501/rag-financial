"use client";

import { useEffect, useRef } from "react";
import type { ApiDocument } from "@/lib/types";
import { Icons } from "./icons";

type Props = { document: ApiDocument; onCancel: () => void; onConfirm: () => void };

export function ConfirmDialog({ document, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-copy">
        <span className="dialog__icon"><Icons.trash /></span>
        <h2 id="delete-title">Remove this document?</h2>
        <p id="delete-copy"><strong>{document.filename}</strong> and its indexed evidence will be removed from this workspace.</p>
        <div className="dialog__actions">
          <button type="button" ref={cancelRef} className="button button--secondary" onClick={onCancel}>Keep document</button>
          <button type="button" className="button button--danger" onClick={onConfirm}>Remove</button>
        </div>
      </div>
    </div>
  );
}
