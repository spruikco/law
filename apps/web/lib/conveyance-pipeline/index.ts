/**
 * Conveyance pipeline — VIC settlement statement generator.
 *
 * 3-pass pipeline:
 *   Pass 1 — deterministic pro-rata adjustments + VIC stamp duty calculation
 *   Pass 2 — LPUL/SLA/Duties Act compliance rule pack (Sonnet, concurrency 4)
 *   Pass 3 — Markdown settlement statement + post-settlement checklist (Opus stream)
 */
export { calculateSettlement } from "./pass1-calculate";
export { checkConveyanceCompliance } from "./pass2-checklist";
export { composeSettlementDocument } from "./pass3-compose";
export { startConveyancePipeline } from "./runner";
export type { ConveyancePass, ConveyancePipelineProgress } from "./types";

export const __MODULE__ = "conveyance" as const;
