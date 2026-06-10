"use client";

import Link from "next/link";
import type {
  PoaAttorney,
  PoaComplianceFinding,
  PoaExtraction,
  PoaRedFlag,
  PoaReview,
  PoaReviewStatus,
  PoaWitness,
} from "@law/schema";
import {
  ReviewShell,
  type DeliverableConfig,
} from "../../../components/review/review-shell";
import type { FindingsGroup } from "../../../components/review/findings-accordion";
import {
  StatusBadge,
  type Severity,
} from "../../../components/review/severity-badge";
import { useReviewStream } from "../../../components/review/use-review-stream";
import type { PipelineStage } from "../../../components/review/pipeline-progress";
import {
  ComplianceBody,
  asFindingStatus,
} from "../../../components/review/finding-bodies";

const STAGES: PipelineStage[] = [
  {
    status: "classifying",
    label: "Classify the instrument",
    sub: "Kind / scope / prescribed-form / appointment mode",
    model: "Claude Sonnet 4.6",
    typical: "~10s",
  },
  {
    status: "extracting",
    label: "Extract parties, witnesses, scope",
    sub: "Principal · attorneys · witnesses · gift / conflict authorisations",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "checking_validity",
    label: "Check validity",
    sub: "PoA Act 2014 (Vic) ss 22 / 31 / 33 / 35 / 41 / 44 / 64 / 65",
    model: "Claude Sonnet 4.6",
    typical: "~1m",
  },
  {
    status: "detecting_red_flags",
    label: "Detect red flags",
    sub: "Capacity · undue influence · self-dealing · elder abuse · deadlock",
    model: "Claude Sonnet 4.6",
    typical: "~1m",
  },
  {
    status: "composing_letter",
    label: "Compose letter of advice",
    sub: "Stream a solicitor-reviewable letter with VCAT review options",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
];

const STATUS_ORDER: Record<PoaReviewStatus, number> = {
  pending: 0,
  classifying: 1,
  extracting: 2,
  checking_validity: 3,
  detecting_red_flags: 4,
  composing_letter: 5,
  complete: 6,
  failed: -1,
};

export function PoaReviewViewer({ initial }: { initial: PoaReview }) {
  const stream = useReviewStream<PoaReview>(
    initial,
    `/api/poa-review/${initial.id}/events`,
  );
  const {
    review,
    letterStream,
    stageStart,
    progressByPass,
    eventCount,
    lastEventAt,
    now,
    totalElapsedSec,
    connection,
  } = stream;

  const stageIdx = STATUS_ORDER[review.status] ?? 0;
  const extraction = review.extraction;
  const validity = review.compliance ?? [];
  const redFlags = review.redFlags ?? [];

  const deliverable: DeliverableConfig = {
    label: "Letter of advice",
    sections: review.letter?.sections,
    streamMarkdown: letterStream,
    streaming: !review.letter && !!letterStream,
    streamingHint: "drafting from Claude Opus 4.6…",
    emptyHint: "Letter pending.",
  };

  const findingsGroups: FindingsGroup[] = [
    {
      id: "validity",
      label: "Validity findings (PoA Act 2014 (Vic))",
      items: validity.map((f) => ({
        id: f.ruleId,
        title: f.title,
        severity: f.severity as Severity,
        trailing: <StatusBadge status={asFindingStatus(f.status)} />,
        body: <ComplianceBody finding={f as PoaComplianceFinding} />,
      })),
    },
    {
      id: "red-flags",
      label: "Red flags · equity / fiduciary / abuse overlay",
      items: redFlags.map((rf) => ({
        id: rf.id,
        title: rf.title,
        severity: rf.severity as Severity,
        subtitle: rf.category.replace(/_/g, " "),
        body: <RedFlagBody rf={rf} />,
      })),
    },
  ];

  return (
    <div>
      <Link
        href="/poa"
        className="mb-3 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← PoA module
      </Link>
      <ReviewShell
        eyebrow={`PoA review · ${review.id.slice(0, 8)}`}
        title={extraction?.principal.name ?? "(principal pending)"}
        subtitle={
          extraction ? (
            <ClassificationTags extraction={extraction} />
          ) : undefined
        }
        status={review.status}
        errorText={review.error}
        stages={STAGES}
        stageIdx={stageIdx}
        stageStart={stageStart}
        now={now}
        progressByPass={progressByPass}
        eventCount={eventCount}
        lastEventAt={lastEventAt}
        totalElapsedSec={totalElapsedSec}
      connection={connection}
        deliverable={deliverable}
        findingsGroups={findingsGroups}
        particulars={
          extraction ? (
            <ExtractionPanel extraction={extraction} />
          ) : (
            <div className="text-sm italic text-zinc-400">
              Extraction pending.
            </div>
          )
        }
        overview={
          extraction ? (
            <Headline
              extraction={extraction}
              validity={validity}
              redFlags={redFlags}
            />
          ) : undefined
        }
      />
    </div>
  );
}

function ClassificationTags({ extraction }: { extraction: PoaExtraction }) {
  const c = extraction.classification;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <Tag>{c.kind.replace(/_/g, " ")}</Tag>
      {c.isEnduring && <Tag tone="indigo">enduring</Tag>}
      {c.scopeFinancial && <Tag tone="emerald">financial</Tag>}
      {c.scopePersonal && <Tag tone="emerald">personal</Tag>}
      {c.scopeMedical && <Tag tone="emerald">medical</Tag>}
      {c.formIsStatutoryPrescribed ? (
        <Tag>prescribed form</Tag>
      ) : (
        <Tag tone="amber">non-prescribed form</Tag>
      )}
      {c.multipleAttorneys && (
        <Tag>{c.appointmentMode.replace(/_/g, " ")} attorneys</Tag>
      )}
    </div>
  );
}

function Headline({
  extraction,
  validity,
  redFlags,
}: {
  extraction: PoaExtraction;
  validity: PoaComplianceFinding[];
  redFlags: PoaRedFlag[];
}) {
  const fails = validity.filter((v) => v.status === "fail").length;
  const warnings = validity.filter((v) => v.status === "warning").length;
  const critical = redFlags.filter(
    (r) => r.severity === "critical" || r.severity === "high",
  );
  const acceptanceMissing = extraction.attorneys.filter(
    (a) => !a.acceptanceSigned,
  ).length;

  let tone: string;
  let label: string;
  if (fails > 0 || critical.length > 0) {
    tone = "border-red-200 bg-red-50";
    label = "Likely invalid — formal defects or critical red flags";
  } else if (warnings > 0 || redFlags.length > 0 || acceptanceMissing > 0) {
    tone = "border-amber-200 bg-amber-50";
    label = "Partially valid — remediation required";
  } else {
    tone = "border-emerald-200 bg-emerald-50";
    label = "Likely valid — solicitor confirmation required";
  }

  return (
    <div className={`rounded-xl border p-6 ${tone}`}>
      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-600">
        Headline assessment
      </div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{label}</div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Validity fails"
          value={String(fails)}
          tone={fails > 0 ? "text-red-900" : "text-zinc-900"}
        />
        <Stat
          label="Validity warnings"
          value={String(warnings)}
          tone={warnings > 0 ? "text-amber-900" : "text-zinc-900"}
        />
        <Stat
          label="Red flags"
          value={String(redFlags.length)}
          tone={critical.length > 0 ? "text-red-900" : "text-zinc-900"}
        />
        <Stat
          label="Acceptance missing"
          value={String(acceptanceMissing)}
          tone={acceptanceMissing > 0 ? "text-amber-900" : "text-zinc-900"}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "text-zinc-900",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function RedFlagBody({ rf }: { rf: PoaRedFlag }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="leading-relaxed text-zinc-700">{rf.explanation}</p>
      {rf.signals.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Signals
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-zinc-800">
            {rf.signals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {rf.evidence.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Evidence
          </div>
          <ul className="list-disc space-y-0.5 pl-5 italic text-zinc-700">
            {rf.evidence.map((s, i) => (
              <li key={i}>“{s}”</li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-md bg-zinc-50 p-3 text-zinc-800 ring-1 ring-inset ring-zinc-200">
        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Recommended action
        </div>
        <div>{rf.recommendedAction}</div>
      </div>
      {rf.citations.length > 0 && (
        <div className="border-t border-zinc-100 pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Citations
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-600">
            {rf.citations.map((c, i) => (
              <li key={i}>
                <em>{c.act}</em> s {c.section}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ExtractionPanel({ extraction }: { extraction: PoaExtraction }) {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Box title="Principal">
          <Row label="Name" value={extraction.principal.name} />
          {extraction.principal.address && (
            <Row label="Address" value={extraction.principal.address} />
          )}
          {extraction.principal.dateOfBirth && (
            <Row label="DOB" value={extraction.principal.dateOfBirth} />
          )}
          {extraction.principal.capacityNote && (
            <Row label="Capacity note" value={extraction.principal.capacityNote} />
          )}
        </Box>
        <Box title="Execution">
          <Row label="Date" value={extraction.executionDate ?? "—"} />
          <Row
            label="Effective trigger"
            value={extraction.effectiveTrigger.replace(/_/g, " ")}
          />
        </Box>
      </section>

      <Box title={`Attorneys (${extraction.attorneys.length})`}>
        {extraction.attorneys.length === 0 ? (
          <div className="text-sm text-zinc-500">No attorneys extracted.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {extraction.attorneys.map((a, i) => (
              <AttorneyRow key={i} attorney={a} />
            ))}
          </ul>
        )}
      </Box>

      <Box title={`Witnesses (${extraction.witnesses.length})`}>
        {extraction.witnesses.length === 0 ? (
          <div className="text-sm text-zinc-500">No witnesses extracted.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {extraction.witnesses.map((w, i) => (
              <WitnessRow key={i} witness={w} />
            ))}
          </ul>
        )}
      </Box>

      {extraction.scopeDescription && (
        <Box title="Scope clause">
          <blockquote className="text-sm italic text-zinc-700">
            {extraction.scopeDescription}
          </blockquote>
        </Box>
      )}

      {extraction.conditionsAndLimitations.length > 0 && (
        <DetailList
          title="Conditions / limitations"
          items={extraction.conditionsAndLimitations}
        />
      )}
      {extraction.giftAuthorisations.length > 0 && (
        <DetailList
          title={`Gift authorisations · ${extraction.giftAuthorisations.length} (s 65)`}
          items={extraction.giftAuthorisations}
          tone="amber"
        />
      )}
      {extraction.conflictTransactionAuthorisations.length > 0 && (
        <DetailList
          title={`Conflict-transaction authorisations · ${extraction.conflictTransactionAuthorisations.length} (s 64)`}
          items={extraction.conflictTransactionAuthorisations}
          tone="amber"
        />
      )}
      {extraction.remunerationProvisions.length > 0 && (
        <DetailList
          title={`Attorney remuneration (s 70) · ${extraction.remunerationProvisions.length}`}
          items={extraction.remunerationProvisions}
        />
      )}
      {extraction.revocationClauses.length > 0 && (
        <DetailList
          title="Revocation clauses"
          items={extraction.revocationClauses}
        />
      )}
      {extraction.observations.length > 0 && (
        <DetailList title="Other observations" items={extraction.observations} />
      )}
    </div>
  );
}

function Box({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {title}
        </h3>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-sm">
      <div className="text-zinc-500">{label}</div>
      <div className="col-span-2 text-zinc-900">{value}</div>
    </div>
  );
}

function AttorneyRow({ attorney: a }: { attorney: PoaAttorney }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-zinc-900">{a.name}</div>
        <div className="flex flex-wrap gap-1.5">
          <Tag>{a.role}</Tag>
          {a.acceptanceSigned ? (
            <Tag tone="emerald">acceptance signed</Tag>
          ) : (
            <Tag tone="red">acceptance MISSING (s 41)</Tag>
          )}
          {a.conflictOfInterestDisclosed && (
            <Tag tone="amber">conflict disclosed</Tag>
          )}
        </div>
      </div>
      {(a.relationshipToPrincipal || a.acceptanceDate) && (
        <div className="mt-1 text-xs text-zinc-500">
          {a.relationshipToPrincipal && <>relationship: {a.relationshipToPrincipal}</>}
          {a.relationshipToPrincipal && a.acceptanceDate && " · "}
          {a.acceptanceDate && <>signed: {a.acceptanceDate}</>}
        </div>
      )}
      {a.conflictOfInterestDescription && (
        <div className="mt-1 text-xs italic text-zinc-700">
          “{a.conflictOfInterestDescription}”
        </div>
      )}
    </li>
  );
}

function WitnessRow({ witness: w }: { witness: PoaWitness }) {
  const irregular = w.qualification === "other" || w.qualification === "unknown";
  return (
    <li className="flex items-baseline justify-between gap-3 py-2.5">
      <div>
        <div className="text-sm font-medium text-zinc-900">{w.name}</div>
        {w.signatureDate && (
          <div className="text-xs text-zinc-500">signed {w.signatureDate}</div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        <Tag tone={irregular ? "amber" : "zinc"}>
          {w.qualification.replace(/_/g, " ")}
        </Tag>
        {w.certificateOfWitnessIncluded ? (
          <Tag tone="emerald">certificate ✓</Tag>
        ) : (
          <Tag tone="amber">no certificate</Tag>
        )}
      </div>
    </li>
  );
}

function Tag({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "zinc" | "amber" | "red" | "emerald" | "indigo";
}) {
  const styles = {
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    red: "bg-red-50 text-red-900 ring-red-200",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    indigo: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
    >
      {children}
    </span>
  );
}

function DetailList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: "amber";
}) {
  const wrapper =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : "border-zinc-200 bg-white";
  return (
    <section
      className={`overflow-hidden rounded-xl border ${wrapper}`}
    >
      <header className="border-b border-zinc-100 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {title}
        </h3>
      </header>
      <ul className="space-y-1.5 px-4 py-3 text-sm text-zinc-800">
        {items.map((it, i) => (
          <li key={i} className="list-disc list-inside">
            {it}
          </li>
        ))}
      </ul>
    </section>
  );
}
