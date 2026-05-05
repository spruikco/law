import { notFound } from "next/navigation";
import { getConveyanceReview } from "@/lib/store/conveyance-reviews";
import { ConveyanceViewer } from "./review-viewer";

export const dynamic = "force-dynamic";

export default async function ConveyanceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getConveyanceReview(id);
  if (!initial) notFound();

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-12">
        <ConveyanceViewer initial={initial} />
      </main>
    </div>
  );
}
