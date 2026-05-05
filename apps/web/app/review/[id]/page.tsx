import { notFound } from "next/navigation";
import { getReview } from "@/lib/store/reviews";
import { ReviewViewer } from "./review-viewer";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getReview(id);
  if (!initial) notFound();

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-12">
        <ReviewViewer initial={initial} />
      </main>
    </div>
  );
}
