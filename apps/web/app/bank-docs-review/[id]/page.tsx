import { notFound } from "next/navigation";
import { getBankDocsReview } from "@/lib/store/bank-docs-reviews";
import { BankDocsReviewViewer } from "./review-viewer";

export const dynamic = "force-dynamic";

export default async function BankDocsReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getBankDocsReview(id);
  if (!initial) notFound();

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-12">
        <BankDocsReviewViewer initial={initial} />
      </main>
    </div>
  );
}
