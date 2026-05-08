"use client";

import Link from "next/link";
import type {
  FamilyProvisionRisk,
  WillBeneficiary,
  WillExecutor,
  WillExtraction,
  WillFinding,
  WillReview,
  WillReviewStatus,
  WillWitness,
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
    label: "Classify the document",
    sub: "Formal will / codicil / informal s 9 / mutual / international",
    model: "Claude Sonnet 4.6",
    typical: "~10s",
  },
  {
    status: "extracting",
    label: "Extract testator, executors, witnesses, beneficiaries",
    sub: "Including gift type, residue, BDBNs, attestation clause",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "checking_validity",
    label: "Check validity",
    sub: "Wills Act 1997 (Vic) ss 5 / 7 / 8A / 9 / 13",
    model: "Claude Sonnet 4.6",
    typical: "~1m",
  },
  {
    status: "analysing_family_provision",
    label: "Analyse family-provision exposure",
    sub: "AP Act 1958 (Vic) Pt IV — eligible-person classes",
    model: "Claude Sonnet 4.6",
    typical: "~1m",
  },
  {
    status: "composing_letter",
    label: "Compose letter of advice",
    sub: "Stream a solicitor-reviewable letter",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
];

const STATUS_ORDER: Record<WillReviewStatus, number> = {
  pending: 0,
  classifying: 1,
  extracting: 2,
  checking_validity: 3,
  analysing_family_provision: 4,
  composing_letter: 5,
  complete: 6,
  failed: -1,
};

function executionToneText(s: string): string {
  if (s === "valid") return "Likely valid";
  if (s === "informal_curable_s9") return "Informal — curable under s 9";
  if (s === "invalid") return "Invalid";
  return s.replace(/_/g, " ");
}

export function WillsReviewViewer({ initial }: { initial: WillReview }) {
  const stream = useReviewStream<WillReview>(
    initial,
    `/api/wills-review/${initial.id}/events`,
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
  } = stream;

  const stageIdx = STATUS_ORDER[review.status] ?? 0;
  const extraction = review.extraction;
  const findings = review.findings ?? [];
  const fpRisks = review.familyProvisionRisks ?? [];

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
      label: "Validity findings (Wills Act 1997 (Vic))",
      items: findings.map((f) => ({
        id: f.ruleId,
        title: f.title,
        severity: f.severity as Severity,
        trailing: <StatusBadge status={asFindingStatus(f.status)} />,
        subtitle: f.category.replace(/_/g, " "),
        body: <ComplianceBody finding={f as WillFinding} />,
      })),
    },
    {
      id: "family-provision",
      label: "Family-provision exposure · AP Act 1958 (Vic) Pt IV",
      items: fpRisks.map((r, i) => ({
        id: `fp-${i}`,
        title: r.eligiblePerson,
        severity: r.severity as Severity,
        subtitle: r.eligibilityCategory.replace(/_/g, " "),
        body: <FamilyProvisionBody risk={r} />,
      })),
    },
  ];

  return (
    <div>
      <Link
        href="/wills"
        className="mb-3 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← Wills module
      </Link>
      <ReviewShell
        eyebrow={`Will review · ${review.id.slice(0, 8)}`}
        title={extraction?.testator.name ?? "(testator pending)"}
        subtitle={
          <span className="text-zinc-600">
            Execution: {executionToneText(review.executionStatus)}
            {extraction?.classification.kind && (
              <> · {extraction.classification.kind.replace(/_/g, " ")}</>
            )}
          </span>
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
              findings={findings}
              fpRisks={fpRisks}
              executionStatus={review.executionStatus}
            />
          ) : undefined
        }
      />
    </div>
  );
}

function Headline({
  extraction,
  findings,
  fpRisks,
  executionStatus,
}: {
  extraction: WillExtraction;
  findings: WillFinding[];
  fpRisks: FamilyProvisionRisk[];
  executionStatus: string;
}) {
  const fails = findings.filter((f) => f.status === "fail").length;
  const warnings = findings.filter((f) => f.status === "warning").length;
  const fpCritical = fpRisks.filter(
    (r) => r.severity === "critical" || r.severity === "high",
  );

  let tone: string;
  let label: string;
  if (executionStatus === "invalid" || fails > 0 || fpCritical.length > 0) {
    tone = "border-red-200 bg-red-50 text-red-900";
    label = "Invalid or high-exposure — remediation required";
  } else if (
    executionStatus === "informal_curable_s9" ||
    warnings > 0 ||
    fpRisks.length > 0
  ) {
    tone = "border-amber-200 bg-amber-50 text-amber-900";
    label = "Valid with reservations — review required";
  } else {
    tone = "border-emerald-200 bg-emerald-50 text-emerald-900";
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
          label="Pt IV exposures"
          value={String(fpRisks.length)}
          tone={fpCritical.length > 0 ? "text-red-900" : "text-zinc-900"}
        />
        <Stat
          label="Beneficiaries"
          value={String(extraction.beneficiaries.length)}
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

function FamilyProvisionBody({ risk }: { risk: FamilyProvisionRisk }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="leading-relaxed text-zinc-700">{risk.reasoning}</p>
      {risk.estimatedExposure && (
        <p className="text-zinc-900">
          <span className="font-medium">Estimated exposure:</span>{" "}
          {risk.estimatedExposure}
        </p>
      )}
      {risk.mitigations.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Mitigations
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-zinc-800">
            {risk.mitigations.map((m, j) => (
              <li key={j}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ExtractionPanel({ extraction }: { extraction: WillExtraction }) {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Box title="Testator">
          <Row label="Name" value={extraction.testator.name} />
          {extraction.testator.address && (
            <Row label="Address" value={extraction.testator.address} />
          )}
          {extraction.testator.dateOfBirth && (
            <Row label="DOB" value={extraction.testator.dateOfBirth} />
          )}
          {extraction.testator.occupation && (
            <Row label="Occupation" value={extraction.testator.occupation} />
          )}
          {extraction.testator.capacityNote && (
            <Row label="Capacity note" value={extraction.testator.capacityNote} />
          )}
        </Box>
        <Box title="Execution">
          <Row label="Date" value={extraction.executionDate ?? "—"} />
          <Row label="Place" value={extraction.placeOfExecution ?? "—"} />
          <Row
            label="Attestation clause"
            value={extraction.hasAttestationClause ? "present" : "MISSING"}
          />
        </Box>
      </section>

      <Box title={`Executors (${extraction.executors.length})`}>
        {extraction.executors.length === 0 ? (
          <div className="text-sm text-red-900">No executor appointed.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {extraction.executors.map((e, i) => (
              <ExecutorRow key={i} ex={e} />
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
              <WitnessRow key={i} w={w} />
            ))}
          </ul>
        )}
      </Box>

      <Box title={`Beneficiaries (${extraction.beneficiaries.length})`}>
        {extraction.beneficiaries.length === 0 ? (
          <div className="text-sm text-zinc-500">No beneficiaries extracted.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {extraction.beneficiaries.map((b, i) => (
              <BeneficiaryRow key={i} b={b} />
            ))}
          </ul>
        )}
      </Box>

      {extraction.hasResidueClause && extraction.residueDescription && (
        <Box title="Residue">
          <blockquote className="text-sm italic text-zinc-700">
            {extraction.residueDescription}
          </blockquote>
        </Box>
      )}

      {extraction.attestationClauseText && (
        <Box title="Attestation clause (verbatim)">
          <blockquote className="text-sm italic text-zinc-700">
            {extraction.attestationClauseText}
          </blockquote>
        </Box>
      )}

      {extraction.bindingDeathBenefitNominations.length > 0 && (
        <DetailList
          title="Binding death-benefit nominations"
          items={extraction.bindingDeathBenefitNominations}
        />
      )}
      {extraction.superFundsReferenced.length > 0 && (
        <DetailList
          title="Superannuation funds referenced"
          items={extraction.superFundsReferenced}
        />
      )}
      {extraction.testamentaryTrustsReferenced.length > 0 && (
        <DetailList
          title="Testamentary trusts"
          items={extraction.testamentaryTrustsReferenced}
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

function ExecutorRow({ ex }: { ex: WillExecutor }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2.5">
      <div>
        <div className="text-sm font-medium text-zinc-900">{ex.name}</div>
        {ex.relationshipToTestator && (
          <div className="text-xs text-zinc-500">{ex.relationshipToTestator}</div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        <Tag>{ex.role}</Tag>
        {ex.isBeneficiary && <Tag tone="amber">also beneficiary</Tag>}
        {ex.remunerationProvided && <Tag>remuneration</Tag>}
      </div>
    </li>
  );
}

function WitnessRow({ w }: { w: WillWitness }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2.5">
      <div>
        <div className="text-sm font-medium text-zinc-900">{w.name}</div>
        {w.occupation && <div className="text-xs text-zinc-500">{w.occupation}</div>}
      </div>
      {w.isBeneficiaryOrSpouseOfBeneficiary && (
        <Tag tone="red">interested witness (s 13)</Tag>
      )}
    </li>
  );
}

function BeneficiaryRow({ b }: { b: WillBeneficiary }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-zinc-900">{b.name}</div>
        <div className="flex flex-wrap gap-1.5">
          <Tag>{b.giftType}</Tag>
          {b.isContingent && <Tag>contingent</Tag>}
          {b.ademptionRisk && <Tag tone="amber">ademption risk</Tag>}
          {b.isEligibleAPActPt4 && <Tag tone="sky">Pt IV eligible</Tag>}
        </div>
      </div>
      <div className="mt-1 text-xs italic text-zinc-700">
        “{b.description}”
      </div>
      {b.relationshipToTestator && (
        <div className="mt-1 text-xs text-zinc-500">
          relationship: {b.relationshipToTestator}
        </div>
      )}
      {b.isContingent && b.contingencyDescription && (
        <div className="mt-1 text-xs text-zinc-500">
          contingency: {b.contingencyDescription}
        </div>
      )}
    </li>
  );
}

function Tag({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "zinc" | "amber" | "red" | "sky";
}) {
  const styles = {
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    red: "bg-red-50 text-red-900 ring-red-200",
    sky: "bg-sky-50 text-sky-900 ring-sky-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
    >
      {children}
    </span>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
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
