"use client";

import Link from "next/link";
import type {
  TrustAccountReview,
  TrustAccountReviewStatus,
  TrustComplianceFinding,
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
    status: "reconciling",
    label: "Reconcile cashbook + trust trial balance",
    sub: "Deterministic — cashbook ↔ bank ↔ ledger trial balance, overdrawn detection",
    model: "Pure JS",
    typical: "~1s",
  },
  {
    status: "checking_compliance",
    label: "Check LPUL Pt 4.2 + LPUGR rules",
    sub: "12 rules across s 142 / s 144 / s 145 / s 152 + LPUGR rr 35 / 36 / 38 / 47-53 / 65",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "drafting_pack",
    label: "Draft monthly compliance pack",
    sub: "Trial balance + bank reconciliation + journals + breach register + principal certification",
    model: "Claude Opus 4.6",
    typical: "~90s",
  },
];

const STATUS_ORDER: Record<TrustAccountReviewStatus, number> = {
  pending: 0,
  reconciling: 1,
  checking_compliance: 2,
  drafting_pack: 3,
  complete: 4,
  signed_off: 4,
  failed: -1,
};

const fmt = (n: number) =>
  n.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function TrustAccountViewer({ initial }: { initial: TrustAccountReview }) {
  const stream = useReviewStream<TrustAccountReview>(
    initial,
    `/api/trust-accounting/${initial.id}/events`,
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
  const isTerminal =
    review.status === "complete" || review.status === "signed_off";

  const findings = review.findings ?? [];

  const deliverable: DeliverableConfig = {
    label: "Compliance pack",
    sections: review.pack?.sections,
    streamMarkdown: letterStream,
    streaming: !review.pack && !!letterStream,
    streamingHint: "drafting from Claude Opus 4.6…",
    emptyHint: "Compliance pack pending.",
  };

  const findingsGroups: FindingsGroup[] = [
    {
      id: "compliance",
      label: "LPUL Pt 4.2 + LPUGR compliance",
      items: findings.map((f) => ({
        id: f.ruleId,
        title: f.title,
        severity: f.severity as Severity,
        trailing: <StatusBadge status={asFindingStatus(f.status)} />,
        body: <ComplianceBody finding={f as TrustComplianceFinding} />,
      })),
    },
  ];

  return (
    <div>
      <Link
        href="/trust-accounting"
        className="mb-3 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← Trust accounting module
      </Link>
      <ReviewShell
        eyebrow={`Trust pack · ${review.id.slice(0, 8)} · ${review.input.periodStart} → ${review.input.periodEnd}`}
        title={review.input.practice.name}
        subtitle={
          <>
            {review.input.bankStatement.bankName} · BSB{" "}
            {review.input.bankStatement.bsb} ·{" "}
            {review.input.bankStatement.accountName}
          </>
        }
        status={isTerminal ? "complete" : review.status}
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
        particulars={<Particulars review={review} />}
        overview={<Overview review={review} />}
      />
    </div>
  );
}

function Overview({ review }: { review: TrustAccountReview }) {
  const recon = review.reconciliation;
  if (!recon) {
    return (
      <div className="text-sm italic text-zinc-400">
        Reconciliation pending.
      </div>
    );
  }
  const ok = recon.reconciles && recon.overdrawnLedgers.length === 0;
  return (
    <div className="space-y-6">
      <section
        className={`rounded-xl border p-6 ${
          ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
        }`}
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Reconciliation outcome
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Reconciles?"
            text={recon.reconciles ? "Yes" : "NO"}
            tone={recon.reconciles ? "good" : "bad"}
          />
          <Stat
            label="Overdrawn ledgers"
            text={recon.overdrawnLedgers.length.toString()}
            tone={recon.overdrawnLedgers.length === 0 ? "good" : "bad"}
          />
          <Stat
            label="Cashbook closing"
            text={`$${fmt(recon.cashbookClosingBalance.amount)}`}
          />
          <Stat
            label="Trial balance total"
            text={`$${fmt(recon.trialBalanceTotal.amount)}`}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-3">
          <div>
            cashbook − reconciled bank: $
            {fmt(recon.reconciliationDifference.amount)}
          </div>
          <div>
            trial − cashbook: ${fmt(recon.trialVsCashbookDifference.amount)}
          </div>
          <div>{recon.ledgerBalances.length} ledgers</div>
        </div>
      </section>

      {recon.ledgerBalances.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Trust trial balance
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Ledger</th>
                  <th className="px-4 py-2">Matter</th>
                  <th className="px-4 py-2 text-right">Opening</th>
                  <th className="px-4 py-2 text-right">Receipts</th>
                  <th className="px-4 py-2 text-right">Payments</th>
                  <th className="px-4 py-2 text-right">Tr in</th>
                  <th className="px-4 py-2 text-right">Tr out</th>
                  <th className="px-4 py-2 text-right">Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono text-zinc-800">
                {recon.ledgerBalances.map((l) => (
                  <tr
                    key={l.ledgerName}
                    className={l.isOverdrawn ? "bg-red-50 text-red-900" : ""}
                  >
                    <td className="px-4 py-2 font-sans">{l.ledgerName}</td>
                    <td className="px-4 py-2 text-xs">{l.matterRef}</td>
                    <td className="px-4 py-2 text-right">
                      ${fmt(l.openingBalance.amount)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      ${fmt(l.receipts.amount)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      ${fmt(l.payments.amount)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      ${fmt(l.transfersIn.amount)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      ${fmt(l.transfersOut.amount)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      ${fmt(l.closingBalance.amount)}
                      {l.isOverdrawn && (
                        <span className="ml-2 rounded bg-red-200 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-red-900">
                          overdrawn
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-zinc-300 font-semibold">
                  <td colSpan={7} className="px-4 pt-2 pb-3 text-right font-sans">
                    Trial balance total
                  </td>
                  <td className="px-4 pt-2 pb-3 text-right">
                    ${fmt(recon.trialBalanceTotal.amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone?: "good" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-900"
      : tone === "bad"
        ? "text-red-900"
        : "text-zinc-900";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className={`text-base font-semibold ${toneClass}`}>{text}</div>
    </div>
  );
}

function Particulars({ review }: { review: TrustAccountReview }) {
  const i = review.input;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <Row label="Practice" value={i.practice.name} />
      <Row label="Period" value={`${i.periodStart} → ${i.periodEnd}`} />
      <Row label="Bank" value={i.bankStatement.bankName} />
      <Row label="BSB" value={i.bankStatement.bsb} />
      <Row label="Account" value={i.bankStatement.accountName} />
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <>
      <dt className="text-zinc-500 capitalize">{label}</dt>
      <dd className="text-zinc-900">{value ?? "—"}</dd>
    </>
  );
}
