"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AccordionItem } from "./accordion";
import {
  ChipRow,
  SeverityBadge,
  SeverityChip,
  severityRank,
  type Severity,
} from "./severity-badge";

export interface FindingItem {
  id: string;
  title: string;
  severity: Severity;
  /** Rendered into the accordion body when expanded. */
  body: ReactNode;
  /** Optional inline metadata shown next to the title (status badge, etc). */
  trailing?: ReactNode;
  /** Optional secondary info shown below the title in collapsed view. */
  subtitle?: ReactNode;
}

export interface FindingsGroup {
  id: string;
  label: string;
  items: FindingItem[];
  emptyState?: ReactNode;
}

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

/**
 * Severity-grouped, severity-filtered accordion list of findings. Each finding
 * is collapsed by default — click to expand for the full explanation. Summary
 * chips at the top let the user filter to one severity at a time.
 *
 * Designed to handle 1 or 30+ findings without becoming a wall.
 */
export function FindingsAccordion({
  groups,
  defaultOpenSeverity = "critical",
}: {
  groups: FindingsGroup[];
  /** Auto-expand findings of this severity on first render. */
  defaultOpenSeverity?: Severity;
}) {
  const [filter, setFilter] = useState<Severity | null>(null);

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<
      Severity,
      number
    >;
    for (const g of groups) {
      for (const it of g.items) c[it.severity]++;
    }
    return c;
  }, [groups]);

  const total = SEVERITIES.reduce((acc, s) => acc + counts[s], 0);

  if (total === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
        No findings yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ChipRow>
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
            filter === null
              ? "bg-zinc-900 text-white ring-zinc-900"
              : "bg-white text-zinc-700 ring-zinc-200 hover:ring-zinc-300"
          }`}
        >
          All
          <span className="tabular-nums opacity-80">{total}</span>
        </button>
        {SEVERITIES.map((s) => (
          <SeverityChip
            key={s}
            severity={s}
            count={counts[s]}
            active={filter === s}
            onClick={() => setFilter((cur) => (cur === s ? null : s))}
          />
        ))}
      </ChipRow>

      <div className="space-y-8">
        {groups.map((g) => {
          const sorted = [...g.items].sort(
            (a, b) => severityRank(a.severity) - severityRank(b.severity),
          );
          const items = filter
            ? sorted.filter((it) => it.severity === filter)
            : sorted;
          if (items.length === 0 && filter) return null;
          return (
            <section key={g.id}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  {g.label}
                </h3>
                <span className="text-xs tabular-nums text-zinc-400">
                  {items.length} of {sorted.length}
                </span>
              </div>
              {items.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
                  {g.emptyState ?? "None."}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  {items.map((it) => (
                    <AccordionItem
                      key={it.id}
                      defaultOpen={
                        it.severity === defaultOpenSeverity && !filter
                      }
                      summary={
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-medium text-zinc-900 truncate">
                                {it.title}
                              </span>
                            </div>
                            {it.subtitle && (
                              <div className="mt-0.5 text-xs text-zinc-500 truncate">
                                {it.subtitle}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {it.trailing}
                            <SeverityBadge severity={it.severity} />
                          </div>
                        </div>
                      }
                    >
                      {it.body}
                    </AccordionItem>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
