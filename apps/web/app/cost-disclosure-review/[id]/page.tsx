import { notFound } from "next/navigation";
import { getCostDisclosureReview } from "@/lib/store/cost-disclosure-reviews";
import { CostDisclosureViewer } from "./review-viewer";

export const dynamic = "force-dynamic";

export default async function CostDisclosureReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getCostDisclosureReview(id);
  if (!initial) notFound();

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-12">
        <CostDisclosureViewer initial={initial} />
      </main>
    </div>
  );
}
