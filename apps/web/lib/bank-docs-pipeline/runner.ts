import { BankDocsExtractionBundleSchema } from "@law/schema";
import { classifyBankDocs } from "./pass1-classify";
import { extractBankDocsBundle } from "./pass2-extract";
import { checkBankDocsCompliance } from "./pass3-compliance";
import { checkBankDocsUnenforceability } from "./pass3b-unenforceability";
import { analyseBankProvisions } from "./pass4-clauses";
import { composeBankDocsLetter } from "./pass5-compose";
import { synthesiseBankDocsCapabilities } from "./pass6-capabilities";
import type { UploadedDocument } from "./types";
import {
  emitBankDocs,
  getBankDocsUploads,
  releaseBankDocsUploads,
  setBankDocsStatus,
  updateBankDocsReview,
} from "../store/bank-docs-reviews";

export function startBankDocsPipeline(
  reviewId: string,
  opts: { clientName: string; clientRole?: "borrower" | "guarantor" },
) {
  void runAsync(reviewId, opts).catch(async (err) => {
    console.error(`[bank-docs-pipeline ${reviewId}]`, err);
    try {
      await updateBankDocsReview(reviewId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // best-effort
    }
    emitBankDocs(reviewId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAsync(
  reviewId: string,
  opts: { clientName: string; clientRole?: "borrower" | "guarantor" },
) {
  const uploads = getBankDocsUploads(reviewId) as UploadedDocument[] | undefined;
  if (!uploads) throw new Error("uploads not found (cache expired?)");
  const emit = (evt: Parameters<typeof emitBankDocs>[1]) => emitBankDocs(reviewId, evt);

  try {
    // --- Pass 1: classify (NCC / ACL UCT / third-party guarantee) ---
    await setBankDocsStatus(reviewId, "classifying");
    emit({ type: "pass_start", pass: 1, label: "Classifying — NCC, ACL UCT, third-party guarantee" });
    emit({
      type: "progress",
      pass: 1,
      message: "Asking Claude Sonnet 4.6 to apply NCC s5 / ACL Pt 2-3 tests…",
    });
    const classification = await classifyBankDocs(uploads);
    emit({
      type: "progress",
      pass: 1,
      message: `${classification.kind.toUpperCase()} · NCC ${classification.isConsumerCredit ? "applies" : "does NOT apply"} · ACL UCT ${classification.isUnfairContractTermsRegime ? "applies" : "no"} · third-party guarantee ${classification.isThirdPartyGuarantee ? "YES" : "no"} · confidence ${Math.round(classification.confidence * 100)}%`,
    });
    emit({ type: "pass_done", pass: 1 });

    // --- Pass 2: extract facility particulars + guarantee + default + NCC + PPSA ---
    await setBankDocsStatus(reviewId, "extracting");
    emit({ type: "pass_start", pass: 2, label: "Extracting facility, guarantee, default, NCC, PPSA" });
    emit({
      type: "progress",
      pass: 2,
      message: "Parallel tool use: facility / guarantee / default / NCC / PPSA…",
    });
    const { particulars, guarantee, defaultAndEnforcement, nccChecklist, ppsa } =
      await extractBankDocsBundle(uploads);

    const extraction = BankDocsExtractionBundleSchema.parse({
      classification,
      particulars,
      provisions: [],
      guarantee,
      defaultAndEnforcement,
      nccChecklist,
      ppsa,
    });
    await updateBankDocsReview(reviewId, { extraction });
    emit({
      type: "progress",
      pass: 2,
      message: `Particulars · ${particulars.securities.length} securities · ${particulars.fees.length} fees · guarantee ${guarantee.present ? "PRESENT" : "absent"}${ppsa ? " · PPSA bundle" : ""}`,
    });
    emit({ type: "pass_done", pass: 2 });

    // --- Pass 3: compliance + 3b: unenforceability — both stage 3 in stepper ---
    await setBankDocsStatus(reviewId, "checking_compliance");
    emit({
      type: "pass_start",
      pass: 3,
      label: "Checking NCC / ACL / Banking Code / PPSA compliance and unenforceability",
    });
    emit({
      type: "progress",
      pass: 3,
      message: "Loading rule packs and embedding queries against legislation corpus…",
    });

    const compliance = await checkBankDocsCompliance(extraction, {
      onRuleChecked: (done, total, ruleId) =>
        emit({
          type: "progress",
          pass: 3,
          current: done,
          total,
          message: `Compliance rule ${done}/${total} · ${ruleId}`,
        }),
    });
    await updateBankDocsReview(reviewId, { compliance });
    emit({
      type: "progress",
      pass: 3,
      message: `${compliance.length} compliance findings (${compliance.filter((c) => c.status === "fail").length} fails)`,
    });

    emit({
      type: "progress",
      pass: 3,
      message: "Checking unenforceability rule pack — high-value findings…",
    });
    const unenforceability = await checkBankDocsUnenforceability(extraction, {
      onRuleChecked: (done, total, ruleId) =>
        emit({
          type: "progress",
          pass: 3,
          current: done,
          total,
          message: `Unenforceability rule ${done}/${total} · ${ruleId}`,
        }),
    });
    await updateBankDocsReview(reviewId, { unenforceability });
    emit({
      type: "progress",
      pass: 3,
      message: `${unenforceability.length} unenforceability finding${unenforceability.length === 1 ? "" : "s"}`,
    });
    emit({ type: "pass_done", pass: 3 });

    // --- Pass 4: clause-by-clause analysis with proposed amendments ---
    await setBankDocsStatus(reviewId, "analysing_clauses");
    emit({ type: "pass_start", pass: 4, label: "Analysing borrower-adverse clauses + proposing amendments" });
    emit({
      type: "progress",
      pass: 4,
      message: "Calling Claude Opus 4.6 — heaviest pass (~2m)…",
    });
    const provisions = await analyseBankProvisions(uploads, {
      classification,
      particulars,
      guarantee,
      defaultAndEnforcement,
    });
    const extractionWithProvisions = { ...extraction, provisions };
    await updateBankDocsReview(reviewId, { extraction: extractionWithProvisions });
    emit({
      type: "progress",
      pass: 4,
      message: `${provisions.length} provision${provisions.length === 1 ? "" : "s"} analysed · ${provisions.filter((p) => p.classification !== "standard").length} non-standard · ${provisions.filter((p) => p.uctCandidate).length} UCT candidates`,
    });
    emit({ type: "pass_done", pass: 4 });

    // --- Pass 6: capability synthesis (deterministic) — stepper stage 5 ---
    await setBankDocsStatus(reviewId, "synthesising_capabilities");
    emit({
      type: "pass_start",
      pass: 5,
      label: "Synthesising repayments, fees, covenants, cross-default, regulatory hooks",
    });
    const caps = await synthesiseBankDocsCapabilities({
      bundle: extractionWithProvisions,
      onProgress: (msg) => emit({ type: "progress", pass: 5, message: msg }),
    });
    await updateBankDocsReview(reviewId, {
      repaymentScenarios: caps.repaymentScenarios,
      feeLadder: caps.feeLadder,
      covenants: caps.covenants,
      crossDefault: caps.crossDefault,
      regulatoryHooks: caps.regulatoryHooks,
    });
    emit({ type: "pass_done", pass: 5 });

    // --- Pass 5: compose letter --- stepper stage 6
    await setBankDocsStatus(reviewId, "composing_letter");
    emit({ type: "pass_start", pass: 6, label: "Composing letter of advice" });
    emit({
      type: "progress",
      pass: 6,
      message: "Streaming letter from Claude Opus 4.6…",
    });
    const letter = await composeBankDocsLetter({
      extraction: extractionWithProvisions,
      compliance,
      unenforceability,
      capabilities: caps,
      clientName: opts.clientName,
      clientRole: opts.clientRole,
      onChunk: (text) => emit({ type: "letter_chunk", text }),
    });
    await updateBankDocsReview(reviewId, { letter, status: "complete" });
    emit({ type: "pass_done", pass: 6 });
  } finally {
    releaseBankDocsUploads(reviewId);
  }
}
