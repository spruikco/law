"use client";

import { SimpleUploadForm } from "@/components/simple-upload-form";

export function UploadForm() {
  return (
    <SimpleUploadForm
      endpoint="/api/review"
      redirectBase="/review"
      fileLabel="PDFs — Contract of Sale + Section 32 (plus any supporting docs)"
      cta="Start review"
      clientNamePlaceholder="e.g. Jane Smith"
      sample={{
        files: ["contract-of-sale.pdf", "section-32.pdf"],
        clientName: "Alex Nguyen",
      }}
    />
  );
}
