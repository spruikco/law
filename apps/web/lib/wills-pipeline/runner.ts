import type { WillExecutionStatus } from "@law/schema";
import { classifyWill } from "./pass1-classify";
import { extractWill } from "./pass2-extract";
import { checkWillsValidity } from "./pass3-validity";
import { analyseFamilyProvision } from "./pass4-family-provision";
import { composeWillLetter } from "./pass5-compose";
import type { UploadedDocument } from "./types";
import {
  emitWills,
  getWillsUploads,
  releaseWillsUploads,
  setWillsStatus,
  updateWillReview,
} from "../store/wills-reviews";

export function startWillsPipeline(
  reviewId: string,
  opts: {
    clientName: string;
    clientRole?: "testator" | "executor" | "beneficiary" | "interested_party";
  },
) {
  void runAsync(reviewId, opts).catch(async (err) => {
    console.error(`[wills-pipeline ${reviewId}]`, err);
    try {
      await updateWillReview(reviewId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // best-effort
    }
    emitWills(reviewId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAsync(
  reviewId: string,
  opts: {
    clientName: string;
    clientRole?: "testator" | "executor" | "beneficiary" | "interested_party";
  },
) {
  const uploads = getWillsUploads(reviewId) as UploadedDocument[] | undefined;
  if (!uploads) throw new Error("uploads not found (cache expired?)");
  const emit = (evt: Parameters<typeof emitWills>[1]) => emitWills(reviewId, evt);

  try {
    // --- Pass 1: classify ---
    await setWillsStatus(reviewId, "classifying");
    emit({
      type: "pass_start",
      pass: 1,
      label: "Classifying — kind, attestation, home-made vs solicitor-prepared",
    });
    const classification = await classifyWill(uploads);
    emit({
      type: "progress",
      pass: 1,
      message: `${classification.kind.replace(/_/g, " ").toUpperCase()} · home-made ${classification.isHomeMade ? "YES" : "no"} · formal attestation ${classification.hasFormalAttestation ? "YES" : "no"} · confidence ${Math.round(classification.confidence * 100)}%`,
    });
    emit({ type: "pass_done", pass: 1 });

    // --- Pass 2: extract ---
    await setWillsStatus(reviewId, "extracting");
    emit({
      type: "pass_start",
      pass: 2,
      label: "Extracting testator, executors, witnesses, beneficiaries",
    });
    const extraction = await extractWill(uploads, classification);
    await updateWillReview(reviewId, { extraction });
    emit({
      type: "progress",
      pass: 2,
      message: `Testator · ${extraction.executors.length} executor${extraction.executors.length === 1 ? "" : "s"} · ${extraction.witnesses.length} witness${extraction.witnesses.length === 1 ? "" : "es"} · ${extraction.beneficiaries.length} beneficiar${extraction.beneficiaries.length === 1 ? "y" : "ies"} · residue ${extraction.hasResidueClause ? "PRESENT" : "MISSING"}`,
    });
    emit({ type: "pass_done", pass: 2 });

    // --- Pass 3: validity ---
    await setWillsStatus(reviewId, "checking_validity");
    emit({
      type: "pass_start",
      pass: 3,
      label: "Checking Wills Act 1997 (Vic) ss 5 / 7 / 8A / 9 / 13 + AP Act executor rules",
    });
    const findings = await checkWillsValidity(extraction, {
      onRuleChecked: (done, total, ruleId) =>
        emit({
          type: "progress",
          pass: 3,
          current: done,
          total,
          message: `Validity rule ${done}/${total} · ${ruleId}`,
        }),
    });

    // Determine execution status from findings
    const s7 = findings.find((f) => f.ruleId === "wills-s7-execution-formalities");
    const s9 = findings.find((f) => f.ruleId === "wills-s9-informal-execution");
    let executionStatus: WillExecutionStatus = "unknown";
    if (s7?.status === "pass") executionStatus = "valid";
    else if (s9?.status === "needs_review") executionStatus = "informal_curable_s9";
    else if (s7?.status === "fail") executionStatus = "invalid";

    await updateWillReview(reviewId, { findings, executionStatus });
    const fails = findings.filter((f) => f.status === "fail").length;
    const warns = findings.filter((f) => f.status === "warning").length;
    emit({
      type: "progress",
      pass: 3,
      message: `${findings.length} findings — ${fails} fail · ${warns} warning · execution: ${executionStatus.replace(/_/g, " ")}`,
    });
    emit({ type: "pass_done", pass: 3 });

    // --- Pass 4: family-provision exposure ---
    await setWillsStatus(reviewId, "analysing_family_provision");
    emit({
      type: "pass_start",
      pass: 4,
      label: "Analysing family-provision exposure under AP Act 1958 (Vic) Pt IV",
    });
    const fpRisks = await analyseFamilyProvision(extraction, {
      onRuleChecked: (done, total, ruleId) =>
        emit({
          type: "progress",
          pass: 4,
          current: done,
          total,
          message: `Pt IV rule ${done}/${total} · ${ruleId}`,
        }),
    });
    await updateWillReview(reviewId, { familyProvisionRisks: fpRisks });
    const critical = fpRisks.filter((r) => r.severity === "critical").length;
    emit({
      type: "progress",
      pass: 4,
      message: `${fpRisks.length} Pt IV exposure${fpRisks.length === 1 ? "" : "s"} flagged${critical ? ` · ${critical} critical` : ""}`,
    });
    emit({ type: "pass_done", pass: 4 });

    // --- Pass 5: compose letter ---
    await setWillsStatus(reviewId, "composing_letter");
    emit({ type: "pass_start", pass: 5, label: "Composing letter of advice" });
    emit({
      type: "progress",
      pass: 5,
      message: "Streaming letter from Claude Opus 4.6…",
    });
    const letter = await composeWillLetter({
      extraction,
      findings,
      fpRisks,
      clientName: opts.clientName,
      clientRole: opts.clientRole,
      onChunk: (text) => emit({ type: "letter_chunk", text }),
    });
    await updateWillReview(reviewId, { letter, status: "complete" });
    emit({ type: "pass_done", pass: 5 });
  } finally {
    releaseWillsUploads(reviewId);
  }
}
