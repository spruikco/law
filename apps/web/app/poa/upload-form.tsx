"use client";

import { SimpleUploadForm } from "@/components/simple-upload-form";

export function PoaUploadForm() {
  return (
    <SimpleUploadForm
      endpoint="/api/poa-review"
      redirectBase="/poa-review"
      fileLabel="Power of Attorney PDF(s) — instrument, acceptance, witness certificates"
      cta="Start Power of Attorney review"
      clientNamePlaceholder="e.g. Margaret Whitfield"
      sample={{ files: ["poa.pdf"], clientName: "Margaret Wilson", role: "principal" }}
      roleField={{
        name: "clientRole",
        label: "Client role",
        initial: "principal",
        options: [
          { value: "principal", label: "Principal (donor)" },
          { value: "attorney", label: "Attorney" },
          { value: "interested_party", label: "Interested party / family" },
        ],
      }}
    />
  );
}
