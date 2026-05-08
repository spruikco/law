import type { ReactNode } from "react";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "pass" | "fail" | "warning" | "needs_review";

const SEV_STYLES: Record<Severity, string> = {
  critical: "bg-red-50 text-red-900 ring-red-200",
  high: "bg-orange-50 text-orange-900 ring-orange-200",
  medium: "bg-amber-50 text-amber-900 ring-amber-200",
  low: "bg-zinc-50 text-zinc-700 ring-zinc-200",
  info: "bg-sky-50 text-sky-900 ring-sky-200",
};

const SEV_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-zinc-400",
  info: "bg-sky-500",
};

const STATUS_STYLES: Record<FindingStatus, string> = {
  pass: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  fail: "bg-red-50 text-red-900 ring-red-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  needs_review: "bg-zinc-50 text-zinc-700 ring-zinc-200",
};

const STATUS_LABEL: Record<FindingStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  warning: "Warning",
  needs_review: "Review",
};

const SEV_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function severityRank(s: Severity): number {
  return SEV_RANK[s] ?? 99;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset ${SEV_STYLES[severity]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[severity]}`} />
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SeverityChip({
  severity,
  count,
  active,
  onClick,
}: {
  severity: Severity;
  count: number;
  active?: boolean;
  onClick?: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
        active
          ? `${SEV_STYLES[severity]} ring-2`
          : "bg-white text-zinc-700 ring-zinc-200 hover:ring-zinc-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[severity]}`} />
      <span className="capitalize">{severity}</span>
      <span className="tabular-nums text-zinc-500 group-hover:text-zinc-700">
        {count}
      </span>
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
