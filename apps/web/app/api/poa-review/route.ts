import { formEnum, formString, uploadReviewPOST } from "@/lib/api/review-routes";
import { createPoaReview } from "@/lib/store/poa-reviews";
import { startPoaPipeline } from "@/lib/poa-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/poa-review
 *   multipart/form-data:
 *     files: PDF[]  (Power of Attorney instrument + any acceptance / witness certificates)
 *     clientName: string
 *     clientRole?: "principal" | "attorney" | "interested_party"
 */
export const POST = uploadReviewPOST({
  create: createPoaReview,
  start: startPoaPipeline,
  parseFields: (form) => ({
    clientName: formString(form, "clientName", "Client"),
    clientRole: formEnum(
      form,
      "clientRole",
      ["principal", "attorney", "interested_party"] as const,
      "principal",
    ),
  }),
});
