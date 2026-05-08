"use client";

import { useState, type ReactNode } from "react";

export function AccordionItem({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 py-3 px-4 text-left transition-colors hover:bg-zinc-50"
      >
        <Chevron open={open} />
        <div className="flex-1 min-w-0">{summary}</div>
      </button>
      {open && <div className="px-4 pb-4 pl-11">{children}</div>}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
        open ? "rotate-90" : ""
      }`}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}
