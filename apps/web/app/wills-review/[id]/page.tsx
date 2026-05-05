import { notFound } from "next/navigation";
import { getWillReview } from "@/lib/store/wills-reviews";
import { WillsReviewViewer } from "./review-viewer";

export const dynamic = "force-dynamic";

export default async function WillsReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getWillReview(id);
  if (!initial) notFound();

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-12">
        <WillsReviewViewer initial={initial} />
      </main>
    </div>
  );
}
