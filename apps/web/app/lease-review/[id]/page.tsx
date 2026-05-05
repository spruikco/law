import { notFound } from "next/navigation";
import { getLeaseReview } from "@/lib/store/lease-reviews";
import { LeaseReviewViewer } from "./review-viewer";

export const dynamic = "force-dynamic";

export default async function LeaseReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getLeaseReview(id);
  if (!initial) notFound();

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-12">
        <LeaseReviewViewer initial={initial} />
      </main>
    </div>
  );
}
