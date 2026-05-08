import type { ReactNode } from "react";

export interface CitationLike {
  act: string;
  section: string;
  url?: string;
  quotedText?: string;
}

export interface ComplianceLike {
  ruleId?: string;
  title?: string;
  explanation?: string;
  remediation?: string;
  citations?: CitationLike[];
  sourceRefs?: string[];
}

/**
 * Standard rendered body for a compliance/finding entry. Used inside an
 * accordion, so the title is shown by the wrapper — only the body lives here.
 */
export function ComplianceBody({
  finding,
  extra,
}: {
  finding: ComplianceLike;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-3 text-sm">
      {finding.explanation && (
        <p className="leading-relaxed text-zinc-700">{finding.explanation}</p>
      )}
      {finding.remediation && (
        <div className="rounded-md bg-zinc-50 p-3 text-zinc-800 ring-1 ring-inset ring-zinc-200">
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Remediation
          </div>
          <div>{finding.remediation}</div>
        </div>
      )}
      {finding.citations && finding.citations.length > 0 && (
        <div className="border-t border-zinc-100 pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Citations
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-600">
            {finding.citations.map((c, i) => (
              <li key={i}>
                <em>{c.act}</em> s {c.section}
                {c.quotedText && (
                  <span className="text-zinc-500"> — “{c.quotedText}”</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {extra}
      {finding.ruleId && (
        <div className="font-mono text-[11px] text-zinc-400">{finding.ruleId}</div>
      )}
    </div>
  );
}

/** Compact citation-only subtitle for use in accordion summary rows. */
export function citationSubtitle(citations?: CitationLike[]): string | undefined {
  if (!citations || citations.length === 0) return undefined;
  return citations
    .slice(0, 2)
    .map((c) => `${c.act} s ${c.section}`)
    .join(" · ");
}

/**
 * Coerce a status-like string ("pass" / "fail" / "warning" / etc.) to the
 * narrowed FindingStatus type used by StatusBadge. Defaults to "needs_review"
 * if unknown.
 */
export function asFindingStatus(s: string):
  | "pass"
  | "fail"
  | "warning"
  | "needs_review" {
  if (s === "pass" || s === "fail" || s === "warning") return s;
  return "needs_review";
}
