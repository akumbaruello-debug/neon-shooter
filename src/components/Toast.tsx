"use client";

import type { CSSProperties } from "react";
import type { ToastItem } from "@/hooks/useGame";
import { hex } from "./uiUtil";

export interface ToastStackProps {
  items: ToastItem[];
}

/** Transient one-line notifications (threat up, stage clear, seed hints). */
export default function ToastStack({ items }: ToastStackProps) {
  if (items.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className="toast"
          style={t.color !== undefined ? ({ "--toast": hex(t.color) } as CSSProperties) : undefined}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
