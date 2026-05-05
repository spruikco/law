import type Anthropic from "@anthropic-ai/sdk";
import {
  ExtractionBundleSchema,
  OwnersCorpSchema,
  ParticularsSchema,
  ServicesDisclosureSchema,
  TitleSearchSchema,
  type ClassifiedDocument,
  type ExtractionBundle,
  type GeneralConditionsRef,
  type LandTaxCert,
  type OwnersCorp,
  type Particulars,
  type ServicesDisclosure,
  type SpecialCondition,
  type TitleSearch,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import { extractionTools } from "../anthropic/tools";
import type { UploadedDocument } from "./types";

const EXTRACT_PROMPT = `You are assisting a Victorian property lawyer review a Contract of Sale and Section 32 Vendor's Statement.

You have been given the uploaded PDF(s). Your job: call EVERY extraction tool below exactly once with the most complete, accurate data you can derive from the documents.

Extraction tools to call:
1. record_particulars — details from the Contract of Sale particulars
2. record_special_conditions — every special condition, verbatim text + plain-English summary
3. record_services_disclosure — the s32 services X-box grid (X means NOT connected)
4. record_owners_corporation — OC details from s32 (+ OC certificate if attached)
5. record_title_search — encumbrances, easements, covenants, mortgages, caveats
6. record_land_tax_certificate — if a land tax certificate is attached; otherwise applicable=false

Rules:
- Call every tool, even if data is missing — use sensible defaults (empty arrays, applicable=false) rather than omitting.
- Quote amounts verbatim in 'raw' fields, in addition to numeric 'amount'.
- For special conditions, capture FULL text — do not paraphrase or truncate. Lawyers need the verbatim clause.
- If a service box is marked with X, that service is NOT connected. Set disclosureMarked=true, connected=false.
- If an Owners Corporation applies, set applies=true and fill every OC field you can see. certificateAttached = true only if an OC certificate is physically part of the s32 bundle.`;

export async function extractBundle(
  classified: ClassifiedDocument[],
  uploads: UploadedDocument[],
): Promise<ExtractionBundle> {
  const content: Anthropic.ContentBlockParam[] = [];
  // Add classification summary for model context
  content.push({
    type: "text",
    text:
      "Uploaded documents:\n" +
      classified
        .map(
          (d) => `- ${d.sourceFilename}: ${d.kind} (confidence ${d.confidence})`,
        )
        .join("\n"),
  });
  for (const u of uploads) {
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({ type: "text", text: EXTRACT_PROMPT });

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 16000,
    tools: extractionTools as unknown as Anthropic.Tool[],
    // `any` forces tool use but allows parallel calls
    tool_choice: { type: "any", disable_parallel_tool_use: false },
    messages: [{ role: "user", content }],
  });

  // Collect every tool_use block by name
  const byTool = new Map<string, unknown>();
  for (const block of res.content) {
    if (block.type === "tool_use") {
      byTool.set(block.name, block.input);
    }
  }

  const getTool = <T>(name: string): T => {
    const input = byTool.get(name);
    if (!input) {
      throw new Error(`pass2-extract: tool '${name}' was not called by the model`);
    }
    return input as T;
  };

  const particularsRaw = getTool<{
    propertyAddress: string;
    titleReference?: string;
    price: { amount: number; raw: string };
    deposit: { amount: number; raw: string };
    settlementDate: string;
    parties: Particulars["parties"];
    gstTreatment?: string;
  }>("record_particulars");

  const particulars: Particulars = ParticularsSchema.parse({
    propertyAddress: particularsRaw.propertyAddress,
    titleReference: particularsRaw.titleReference,
    price: { ...particularsRaw.price, currency: "AUD" },
    deposit: { ...particularsRaw.deposit, currency: "AUD" },
    settlementDate: particularsRaw.settlementDate,
    parties: particularsRaw.parties,
    gstTreatment: particularsRaw.gstTreatment,
  });

  const specialConditionsRaw = getTool<{
    generalConditions?: GeneralConditionsRef;
    specialConditions: SpecialCondition[];
  }>("record_special_conditions");

  const servicesRaw = getTool<ServicesDisclosure>("record_services_disclosure");
  const ocRaw = getTool<
    Omit<OwnersCorp, "specialLevies" | "flaggedFutureObligations" | "damageToProperty"> & {
      specialLevies?: OwnersCorp["specialLevies"];
      flaggedFutureObligations?: string[];
      damageToProperty?: string[];
      annualFees?: { amount: number; raw: string };
    }
  >("record_owners_corporation");

  const titleRaw = getTool<Partial<TitleSearch>>("record_title_search");

  const landTaxRaw = getTool<{
    applicable: boolean;
    assessmentYear?: string;
    amountOwing?: { amount: number; raw: string };
    commercialIndicators?: string[];
    notes?: string;
  }>("record_land_tax_certificate");

  const bundle: ExtractionBundle = ExtractionBundleSchema.parse({
    particulars,
    specialConditions: specialConditionsRaw.specialConditions,
    generalConditions: specialConditionsRaw.generalConditions,
    servicesDisclosure: ServicesDisclosureSchema.parse(servicesRaw),
    ownersCorp: OwnersCorpSchema.parse({
      applies: ocRaw.applies,
      planNumber: ocRaw.planNumber,
      ocManager: ocRaw.ocManager,
      annualFees: ocRaw.annualFees
        ? { ...ocRaw.annualFees, currency: "AUD" }
        : undefined,
      specialLevies: (ocRaw.specialLevies ?? []).map((l) => ({
        ...l,
        amount: l.amount ? { ...l.amount, currency: "AUD" } : undefined,
      })),
      flaggedFutureObligations: ocRaw.flaggedFutureObligations ?? [],
      damageToProperty: ocRaw.damageToProperty ?? [],
      recentMeetingsSummary: ocRaw.recentMeetingsSummary,
      certificateAttached: ocRaw.certificateAttached,
    }),
    titleSearch: TitleSearchSchema.parse({
      volumeFolio: titleRaw.volumeFolio,
      registeredProprietors: titleRaw.registeredProprietors ?? [],
      encumbrances: titleRaw.encumbrances ?? [],
      easements: titleRaw.easements ?? [],
      covenants: titleRaw.covenants ?? [],
      mortgages: titleRaw.mortgages ?? [],
      caveats: titleRaw.caveats ?? [],
    }),
    landTaxCert: {
      applicable: landTaxRaw.applicable,
      assessmentYear: landTaxRaw.assessmentYear,
      amountOwing: landTaxRaw.amountOwing
        ? { ...landTaxRaw.amountOwing, currency: "AUD" }
        : undefined,
      commercialIndicators: landTaxRaw.commercialIndicators ?? [],
      notes: landTaxRaw.notes,
    } satisfies LandTaxCert,
  });

  return bundle;
}
