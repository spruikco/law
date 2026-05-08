"use client";

import { useState, type ReactNode } from "react";

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
  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex flex-wrap gap-x-6 gap-y-1">
          {visible.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
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
      <div>{children(active)}</div>
    </div>
  );
}
