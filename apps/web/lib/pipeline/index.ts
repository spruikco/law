/**
 * Pipeline orchestration.
 *
 * Five discrete passes — each persists its structured output so the lawyer
 * can audit intermediate state, and so we can replay individual passes.
 *
 * See plan: C:\Users\ryesm\.claude\plans\indexed-leaping-mochi.md
 */

export { classifyDocuments } from "./pass1-classify";
export { extractBundle } from "./pass2-extract";
export { checkCompliance } from "./pass3-compliance";
export { analyseRisk } from "./pass4-risk";
export { composeLetter } from "./pass5-compose";
export { runPipeline } from "./run";
