import type { Review } from "@law/schema";
import { classifyDocuments } from "./pass1-classify";
import { extractBundle } from "./pass2-extract";
import { checkCompliance } from "./pass3-compliance";
import { analyseRisk } from "./pass4-risk";
import { composeLetter } from "./pass5-compose";
import type { PipelineContext } from "./types";

/**
 * Run the full 5-pass pipeline. Invokes onProgress after each pass
 * and streams letter chunks as they arrive.
 */
export async function runPipeline(
  ctx: PipelineContext,
  opts: { clientName: string },
): Promise<Review> {
  const emit = ctx.onProgress ?? (() => {});

  await emit({ type: "pass_start", pass: 1, label: "Classifying documents" });
  const documents = await classifyDocuments(ctx.uploads);
  await emit({ type: "pass_done", pass: 1 });

  await emit({ type: "pass_start", pass: 2, label: "Extracting structured data" });
  const extraction = await extractBundle(documents, ctx.uploads);
  await emit({ type: "pass_done", pass: 2 });

  await emit({ type: "pass_start", pass: 3, label: "Running compliance checks" });
  const compliance = await checkCompliance(extraction, {
    onRuleChecked: (done, total, ruleId) =>
      void emit({
        type: "progress",
        pass: 3,
        current: done,
        total,
        message: `Rule ${done}/${total} · ${ruleId}`,
      }),
  });
  await emit({ type: "pass_done", pass: 3 });

  await emit({ type: "pass_start", pass: 4, label: "Analysing risk" });
  const risks = await analyseRisk(extraction);
  await emit({ type: "pass_done", pass: 4 });

  await emit({ type: "pass_start", pass: 5, label: "Composing letter of advice" });
  const letter = await composeLetter({
    extraction,
    compliance,
    risks,
    clientName: opts.clientName,
    onChunk: (text) => emit({ type: "letter_chunk", text }),
  });
  await emit({ type: "pass_done", pass: 5 });

  return {
    id: ctx.reviewId,
    createdAt: new Date().toISOString(),
    status: "complete",
    jurisdiction: "VIC",
    documents,
    extraction,
    compliance,
    risks,
    letter,
  };
}
