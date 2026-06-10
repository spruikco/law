"use client";

import { SimpleUploadForm } from "@/components/simple-upload-form";

export function BankDocsUploadForm() {
  return (
    <SimpleUploadForm
      endpoint="/api/bank-docs-review"
      redirectBase="/bank-docs-review"
      fileLabel="Bank document PDF(s) — letter of offer / mortgage / loan agreement / guarantee / GSA"
      cta="Start bank documents review"
      clientNamePlaceholder="e.g. Anna Nguyen / Acme Holdings Pty Ltd"
      sample={{
        files: ["bank-letter-of-offer.pdf"],
        clientName: "Alex Nguyen",
        role: "borrower",
      }}
      roleField={{
        name: "clientRole",
        label: "Client role",
        initial: "borrower",
        options: [
          { value: "borrower", label: "Borrower" },
          { value: "guarantor", label: "Guarantor (third party)" },
        ],
      }}
    />
  );
}
