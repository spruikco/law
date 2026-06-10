"use client";

import { SimpleUploadForm } from "@/components/simple-upload-form";

export function WillsUploadForm() {
  return (
    <SimpleUploadForm
      endpoint="/api/wills-review"
      redirectBase="/wills-review"
      fileLabel="Will / codicil PDF(s)"
      cta="Start will review"
      clientNamePlaceholder="e.g. Eleanor Patterson"
      sample={{ files: ["will.pdf"], clientName: "Margaret Wilson", role: "testator" }}
      roleField={{
        name: "clientRole",
        label: "Client role",
        initial: "testator",
        options: [
          { value: "testator", label: "Testator" },
          { value: "executor", label: "Executor" },
          { value: "beneficiary", label: "Beneficiary" },
          { value: "interested_party", label: "Interested party" },
        ],
      }}
    />
  );
}
