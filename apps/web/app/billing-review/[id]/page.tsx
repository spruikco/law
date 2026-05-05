import { notFound } from "next/navigation";
import { getBillingReview } from "@/lib/store/billing-reviews";
import { BillingViewer } from "./review-viewer";

export const dynamic = "force-dynamic";

export default async function BillingReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getBillingReview(id);
  if (!initial) notFound();

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-12">
        <BillingViewer initial={initial} />
      </main>
    </div>
  );
}
