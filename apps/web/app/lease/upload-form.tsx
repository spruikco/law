"use client";

import { SimpleUploadForm } from "@/components/simple-upload-form";

export function LeaseUploadForm() {
  return (
    <SimpleUploadForm
      endpoint="/api/lease-review"
      redirectBase="/lease-review"
      fileLabel="Lease PDF(s) — LIV form + any Additional Provisions schedule"
      cta="Start lease review"
      clientNameLabel="Tenant / client name"
      clientNamePlaceholder="e.g. Acme Cafe Pty Ltd"
      sample={{ files: ["retail-lease.pdf"], clientName: "Acme Cafe Pty Ltd" }}
    />
  );
}
