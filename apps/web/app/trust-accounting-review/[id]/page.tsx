import { notFound } from "next/navigation";
import { getTrustAccountReview } from "@/lib/store/trust-accounting-reviews";
import { TrustAccountViewer } from "./review-viewer";

export const dynamic = "force-dynamic";

export default async function TrustAccountReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getTrustAccountReview(id);
  if (!initial) notFound();

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-12">
        <TrustAccountViewer initial={initial} />
      </main>
    </div>
  );
}
