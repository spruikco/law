"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabDef {
  id: string;
  label: string;
  count?: number;
  hidden?: boolean;
}

export function Tabs({
  tabs,
  initial,
  children,
}: {
  tabs: TabDef[];
  initial?: string;
  children: (active: string) => ReactNode;
}) {
  const visible = tabs.filter((t) => !t.hidden);
  const [active, setActive] = useState<string>(initial ?? visible[0]?.id ?? "");
  const baseId = useId();
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = visible.findIndex((t) => t.id === active);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % visible.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + visible.length) % visible.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = visible.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = visible[next];
    setActive(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200">
        <nav role="tablist" className="-mb-px flex flex-wrap gap-x-6 gap-y-1">
          {visible.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(t.id, el);
                  else tabRefs.current.delete(t.id);
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.id}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel-${t.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(t.id)}
                onKeyDown={onKeyDown}
                className={`group relative flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {t.label}
                {typeof t.count === "number" && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      isActive
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-600 group-hover:bg-zinc-200"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
      >
        {children(active)}
      </div>
    </div>
  );
}
