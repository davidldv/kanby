"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/Button";
import { Panel } from "@/components/Card";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirming = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    cancelRef.current?.focus();

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-label="Close dialog"
      />

      <Panel className="relative w-full max-w-md p-5 shadow-[0_30px_80px_-48px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-sm font-semibold text-foreground">
              {title}
            </h3>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-(--muted)">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
            onClick={onCancel}
            aria-label="Close"
            title="Close"
          >
            ×
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            ref={cancelRef}
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={confirming}
          >
            {cancelLabel}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={confirming}>
            {confirming ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
