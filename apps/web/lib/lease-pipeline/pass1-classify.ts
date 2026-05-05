import type Anthropic from "@anthropic-ai/sdk";
import { LeaseClassificationSchema, type LeaseClassification } from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import { retrieve } from "../rag";
import type { UploadedDocument } from "./types";

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_lease",
  description:
    "Record whether this is a retail premises lease under s4 Retail Leases Act 2003 (Vic). Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["retail", "non_retail", "unknown"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string" },
      rlaApplies: { type: "boolean" },
      excludedReason: {
        type: "string",
        description:
          "If non-retail, which exclusion under s4 applies (e.g. 'premises used wholly for non-retail purposes', 'tenant is a listed corporation', 'occupancy > 1000 sqm, non-retail').",
      },
    },
    required: ["kind", "confidence", "reasoning", "rlaApplies"],
  },
};

export async function classifyLease(
  uploads: UploadedDocument[],
): Promise<LeaseClassification> {
  // Pull RLA s4 context for grounding
  let rlaContext = "";
  try {
    const chunks = await retrieve(
      "retail premises lease definition s4 application Retail Leases Act 2003",
      { limit: 4 },
    );
    if (chunks.length > 0) {
      rlaContext =
        "\n\nRelevant RLA 2003 excerpts for grounding:\n" +
        chunks
          .map(
            (c) =>
              `[${c.act} s ${c.section}${c.subsection ? " " + c.subsection : ""}]\n${c.text}`,
          )
          .join("\n\n");
    }
  } catch {
    // corpus not ready
  }

  const prompt = `You are classifying a Victorian commercial lease as RETAIL or NON-RETAIL under s4 of the Retail Leases Act 2003 (Vic) (the "RLA").

This matters because RLA protections (disclosure statement, rent review controls, restrictions on outgoings recoverable, restrictions on make-good, etc.) apply ONLY to retail premises leases. If not retail, the tenant is on common-law + Property Law Act 1958 (Vic) footing.

Retail indicators:
- Premises used wholly or predominantly for the sale or hire of goods by retail OR the retail provision of services
- Shops, cafes, restaurants, hairdressers, gyms, clinics open to the public
- The Minister has also declared certain premises retail by ministerial determination

Non-retail indicators / exclusions (s4):
- Office premises used for professional/administrative purposes with no walk-in customer trade
- Industrial / warehouse use without retail component
- Tenant is a listed corporation (or subsidiary), or premises occupancy exceeds 1000 sqm for non-retail use
- Premises above the first 3 storeys (with exceptions)
- Use is predominantly wholesale

Call classify_lease with:
- kind: retail / non_retail / unknown
- confidence: 0..1
- reasoning: 2-4 sentences referencing specific indicators from the lease (permitted use, premises description, tenant identity) and the relevant RLA s4 test
- rlaApplies: true iff kind === "retail"
- excludedReason: only if non-retail, which exclusion you rely on${rlaContext}`;

  const content: Anthropic.ContentBlockParam[] = [];
  for (const u of uploads) {
    content.push({ type: "text", text: `Uploaded file: ${u.filename}` });
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({ type: "text", text: prompt });

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 2048,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_lease" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("lease pass1: model did not call classify_lease");
  }
  return LeaseClassificationSchema.parse(toolUse.input);
}
