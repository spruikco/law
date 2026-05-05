import { notFound } from "next/navigation";
import { getPoaReview } from "@/lib/store/poa-reviews";
import { PoaReviewViewer } from "./review-viewer";

export const dynamic = "force-dynamic";

export default async function PoaReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getPoaReview(id);
  if (!initial) notFound();

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-12">
        <PoaReviewViewer initial={initial} />
      </main>
    </div>
  );
}
