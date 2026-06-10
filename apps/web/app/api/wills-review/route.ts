import { formEnum, formString, uploadReviewPOST } from "@/lib/api/review-routes";
import { createWillReview } from "@/lib/store/wills-reviews";
import { startWillsPipeline } from "@/lib/wills-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/wills-review
 *   multipart/form-data:
 *     files: PDF[]  (the will + any codicils)
 *     clientName: string
 *     clientRole?: "testator" | "executor" | "beneficiary" | "interested_party"
 */
export const POST = uploadReviewPOST({
  create: createWillReview,
  start: startWillsPipeline,
  parseFields: (form) => ({
    clientName: formString(form, "clientName", "Client"),
    clientRole: formEnum(
      form,
      "clientRole",
      ["testator", "executor", "beneficiary", "interested_party"] as const,
      "testator",
    ),
  }),
});
