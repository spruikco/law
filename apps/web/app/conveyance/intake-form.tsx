"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConveyanceForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Practice / client / matter
  const [side, setSide] = useState<"vendor" | "purchaser">("purchaser");
  const [practiceName, setPracticeName] = useState("");
  const [practiceAbn, setPracticeAbn] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [principalSolicitor, setPrincipalSolicitor] = useState("");
  const [practiceEmail, setPracticeEmail] = useState("");

  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  // Property
  const [addressLine, setAddressLine] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postcode, setPostcode] = useState("");
  const [titleVolume, setTitleVolume] = useState("");
  const [titleFolio, setTitleFolio] = useState("");
  const [plan, setPlan] = useState("");
  const [isOwnersCorpLot, setIsOwnersCorpLot] = useState(false);

  // Parties
  const [vendorName, setVendorName] = useState("");
  const [purchaserName, setPurchaserName] = useState("");

  // Prices + dates
  const [contractPrice, setContractPrice] = useState<number | "">(950000);
  const [depositPaid, setDepositPaid] = useState<number | "">(95000);
  const [contractDate, setContractDate] = useState("2026-03-15");
  const [settlementDate, setSettlementDate] = useState("2026-06-15");
  const [adjustmentDate, setAdjustmentDate] = useState("2026-06-15");

  // Adjustments
  const [councilEnabled, setCouncilEnabled] = useState(true);
  const [councilAuthority, setCouncilAuthority] = useState("City of Melbourne");
  const [councilAnnual, setCouncilAnnual] = useState<number | "">(2400);
  const [councilStart, setCouncilStart] = useState("2025-07-01");
  const [councilEnd, setCouncilEnd] = useState("2026-06-30");
  const [councilPaid, setCouncilPaid] = useState<number | "">(2400);

  const [waterEnabled, setWaterEnabled] = useState(true);
  const [waterAuthority, setWaterAuthority] = useState("Yarra Valley Water");
  const [waterAnnual, setWaterAnnual] = useState<number | "">(900);
  const [waterStart, setWaterStart] = useState("2025-07-01");
  const [waterEnd, setWaterEnd] = useState("2026-06-30");
  const [waterPaid, setWaterPaid] = useState<number | "">(900);
  const [waterUsage, setWaterUsage] = useState<number | "">(120);

  const [ocEnabled, setOcEnabled] = useState(false);
  const [ocName, setOcName] = useState("");
  const [ocAnnual, setOcAnnual] = useState<number | "">(0);
  const [ocStart, setOcStart] = useState("2026-01-01");
  const [ocEnd, setOcEnd] = useState("2026-12-31");
  const [ocPaid, setOcPaid] = useState<number | "">(0);
  const [ocSpecialLevy, setOcSpecialLevy] = useState<number | "">(0);

  const [landTaxEnabled, setLandTaxEnabled] = useState(false);
  const [landTaxAmount, setLandTaxAmount] = useState<number | "">(0);
  const [landTaxStart, setLandTaxStart] = useState("2026-01-01");
  const [landTaxEnd, setLandTaxEnd] = useState("2026-12-31");
  const [landTaxAbsentee, setLandTaxAbsentee] = useState(false);

  // Other fees
  const [releaseOfMortgageFee, setReleaseOfMortgageFee] = useState<number | "">(0);
  const [registrationFee, setRegistrationFee] = useState<number | "">(120);
  const [pexaSettlementFee, setPexaSettlementFee] = useState<number | "">(120);

  // Stamp duty options
  const [isPpr, setIsPpr] = useState(true);
  const [isFhb, setIsFhb] = useState(false);
  const [isOffThePlan, setIsOffThePlan] = useState(false);
  const [isForeign, setIsForeign] = useState(false);
  const [pensionerConcession, setPensionerConcession] = useState(false);

  const [pexaWorkspaceId, setPexaWorkspaceId] = useState("");
  const [finalNotes, setFinalNotes] = useState("");

  const fillSample = () => {
    setSide("purchaser");
    setPracticeName("Smith & Co Lawyers");
    setPracticeAbn("12 345 678 901");
    setPracticeAddress("Level 3, 200 Queen Street, Melbourne VIC 3000");
    setPrincipalSolicitor("Jane Smith");
    setPracticeEmail("jane@smithco.law");
    setClientName("Alex Nguyen");
    setClientAddress("12 Park Street, Brunswick VIC 3056");
    setClientEmail("alex.nguyen@example.com");
    setAddressLine("12 Park Street");
    setSuburb("Brunswick");
    setPostcode("3056");
    setTitleVolume("11234");
    setTitleFolio("567");
    setPlan("PS812345");
    setIsOwnersCorpLot(false);
    setVendorName("Margaret Wilson");
    setPurchaserName("Alex Nguyen");
    setContractPrice(950000);
    setDepositPaid(95000);
    setIsPpr(true);
    setIsFhb(true);
    setReleaseOfMortgageFee(120);
    setFinalNotes(
      "Purchaser is a first-home buyer; eligible for PPR + FHB concession. Settlement via PEXA.",
    );
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const num = (n: number | "") => (typeof n === "number" ? n : 0);
      const aud = (n: number | "") => ({ amount: num(n), currency: "AUD" as const });

      const body = {
        jurisdiction: "VIC" as const,
        side,
        practice: {
          name: practiceName,
          abn: practiceAbn || undefined,
          address: practiceAddress,
          principalSolicitor,
          contactEmail: practiceEmail || undefined,
        },
        client: {
          name: clientName,
          address: clientAddress || undefined,
          email: clientEmail || undefined,
        },
        property: {
          addressLine,
          suburb,
          postcode,
          titleVolume: titleVolume || undefined,
          titleFolio: titleFolio || undefined,
          plan: plan || undefined,
          isOwnersCorpLot,
        },
        vendor: { name: vendorName },
        purchaser: { name: purchaserName },
        contractPrice: aud(contractPrice),
        depositPaid: aud(depositPaid),
        contractDate,
        settlementDate,
        adjustmentDate,
        councilRates: councilEnabled
          ? {
              authority: councilAuthority,
              annualAmount: aud(councilAnnual),
              periodStart: councilStart,
              periodEnd: councilEnd,
              amountPaidByVendor: aud(councilPaid),
            }
          : undefined,
        waterRates: waterEnabled
          ? {
              authority: waterAuthority,
              annualAmount: aud(waterAnnual),
              periodStart: waterStart,
              periodEnd: waterEnd,
              amountPaidByVendor: aud(waterPaid),
            }
          : undefined,
        waterUsage: waterEnabled && waterUsage !== "" ? aud(waterUsage) : undefined,
        ownersCorpFees: ocEnabled
          ? {
              ownersCorpName: ocName,
              annualAmount: aud(ocAnnual),
              periodStart: ocStart,
              periodEnd: ocEnd,
              amountPaidByVendor: aud(ocPaid),
              specialLevyOutstanding:
                ocSpecialLevy && ocSpecialLevy > 0 ? aud(ocSpecialLevy) : undefined,
            }
          : undefined,
        landTax: landTaxEnabled
          ? {
              vendorAssessedAmount: aud(landTaxAmount),
              yearStart: landTaxStart,
              yearEnd: landTaxEnd,
              isVendorAbsentee: landTaxAbsentee,
            }
          : undefined,
        releaseOfMortgageFee:
          releaseOfMortgageFee && releaseOfMortgageFee > 0
            ? aud(releaseOfMortgageFee)
            : undefined,
        registrationFee:
          registrationFee && registrationFee > 0 ? aud(registrationFee) : undefined,
        pexaSettlementFee:
          pexaSettlementFee && pexaSettlementFee > 0
            ? aud(pexaSettlementFee)
            : undefined,
        otherDebits: [],
        otherCredits: [],
        stampDuty: {
          isPpr,
          isFirstHomeBuyer: isFhb,
          isOffThePlan,
          isForeignPurchaser: isForeign,
          pensionerConcession,
        },
        isGoingConcernGstFree: false,
        pexaWorkspaceId: pexaWorkspaceId || undefined,
        finalNotes: finalNotes || undefined,
      };

      const res = await fetch("/api/conveyance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { id } = (await res.json()) as { id: string };
      router.push(`/conveyance-review/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={fillSample}
          disabled={submitting}
          className="text-xs text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
        >
          Fill with sample data
        </button>
      </div>
      <Section title="Acting for">
        <Field label="Side" full>
          <div className="flex gap-3">
            {(["vendor", "purchaser"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`rounded-md border px-4 py-2 text-sm capitalize ${
                  side === s
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Practice">
        <Field label="Practice name">
          <input
            type="text"
            value={practiceName}
            onChange={(e) => setPracticeName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="ABN (optional)">
          <input
            type="text"
            value={practiceAbn}
            onChange={(e) => setPracticeAbn(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Address" full>
          <input
            type="text"
            value={practiceAddress}
            onChange={(e) => setPracticeAddress(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Principal solicitor">
          <input
            type="text"
            value={principalSolicitor}
            onChange={(e) => setPrincipalSolicitor(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            value={practiceEmail}
            onChange={(e) => setPracticeEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={`Client (${side})`}>
        <Field label="Name">
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Address" full>
          <input
            type="text"
            value={clientAddress}
            onChange={(e) => setClientAddress(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Property">
        <Field label="Address line" full>
          <input
            type="text"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            className={inputClass}
            placeholder="123 Smith Street"
          />
        </Field>
        <Field label="Suburb">
          <input
            type="text"
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Postcode">
          <input
            type="text"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Title volume">
          <input
            type="text"
            value={titleVolume}
            onChange={(e) => setTitleVolume(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Title folio">
          <input
            type="text"
            value={titleFolio}
            onChange={(e) => setTitleFolio(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Plan (PS / LP / SP)">
          <input
            type="text"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Owners corporation lot?">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={isOwnersCorpLot}
              onChange={(e) => setIsOwnersCorpLot(e.target.checked)}
            />
            <span>Yes (strata / OC lot)</span>
          </label>
        </Field>
      </Section>

      <Section title="Parties">
        <Field label="Vendor name">
          <input
            type="text"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Purchaser name">
          <input
            type="text"
            value={purchaserName}
            onChange={(e) => setPurchaserName(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Price + dates">
        <Field label="Contract price (AUD)">
          <input
            type="number"
            value={contractPrice}
            onChange={(e) =>
              setContractPrice(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Deposit paid (AUD)">
          <input
            type="number"
            value={depositPaid}
            onChange={(e) =>
              setDepositPaid(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Contract date">
          <input
            type="date"
            value={contractDate}
            onChange={(e) => setContractDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Settlement date">
          <input
            type="date"
            value={settlementDate}
            onChange={(e) => setSettlementDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Adjustment date" full>
          <input
            type="date"
            value={adjustmentDate}
            onChange={(e) => setAdjustmentDate(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Council rates">
        <Field label="Include council rates?" full>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={councilEnabled}
              onChange={(e) => setCouncilEnabled(e.target.checked)}
            />
            <span>Adjust council rates at settlement</span>
          </label>
        </Field>
        {councilEnabled && (
          <>
            <Field label="Council">
              <input
                type="text"
                value={councilAuthority}
                onChange={(e) => setCouncilAuthority(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Annual rates (AUD)">
              <input
                type="number"
                value={councilAnnual}
                onChange={(e) =>
                  setCouncilAnnual(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Period start">
              <input
                type="date"
                value={councilStart}
                onChange={(e) => setCouncilStart(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Period end">
              <input
                type="date"
                value={councilEnd}
                onChange={(e) => setCouncilEnd(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Amount vendor has paid (AUD)" full>
              <input
                type="number"
                value={councilPaid}
                onChange={(e) =>
                  setCouncilPaid(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
          </>
        )}
      </Section>

      <Section title="Water">
        <Field label="Include water?" full>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={waterEnabled}
              onChange={(e) => setWaterEnabled(e.target.checked)}
            />
            <span>Adjust water service charge + usage</span>
          </label>
        </Field>
        {waterEnabled && (
          <>
            <Field label="Water authority">
              <input
                type="text"
                value={waterAuthority}
                onChange={(e) => setWaterAuthority(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Annual service charge (AUD)">
              <input
                type="number"
                value={waterAnnual}
                onChange={(e) =>
                  setWaterAnnual(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Period start">
              <input
                type="date"
                value={waterStart}
                onChange={(e) => setWaterStart(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Period end">
              <input
                type="date"
                value={waterEnd}
                onChange={(e) => setWaterEnd(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Amount vendor has paid (AUD)">
              <input
                type="number"
                value={waterPaid}
                onChange={(e) =>
                  setWaterPaid(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Special meter read usage (AUD)">
              <input
                type="number"
                value={waterUsage}
                onChange={(e) =>
                  setWaterUsage(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
          </>
        )}
      </Section>

      <Section title="Owners corporation fees">
        <Field label="Include OC fees?" full>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={ocEnabled}
              onChange={(e) => setOcEnabled(e.target.checked)}
            />
            <span>Adjust owners corporation fees (OC Act 2006 (Vic) s 23)</span>
          </label>
        </Field>
        {ocEnabled && (
          <>
            <Field label="OC name" full>
              <input
                type="text"
                value={ocName}
                onChange={(e) => setOcName(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Annual amount (AUD)">
              <input
                type="number"
                value={ocAnnual}
                onChange={(e) =>
                  setOcAnnual(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Amount vendor has paid (AUD)">
              <input
                type="number"
                value={ocPaid}
                onChange={(e) =>
                  setOcPaid(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Period start">
              <input
                type="date"
                value={ocStart}
                onChange={(e) => setOcStart(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Period end">
              <input
                type="date"
                value={ocEnd}
                onChange={(e) => setOcEnd(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Special levy outstanding (AUD)" full>
              <input
                type="number"
                value={ocSpecialLevy}
                onChange={(e) =>
                  setOcSpecialLevy(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
          </>
        )}
      </Section>

      <Section title="Land tax">
        <Field label="Include land tax?" full>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={landTaxEnabled}
              onChange={(e) => setLandTaxEnabled(e.target.checked)}
            />
            <span>
              Apportion land tax (Land Tax Act 2005 (Vic) s 96 — note s 10G
              SLA restriction)
            </span>
          </label>
        </Field>
        {landTaxEnabled && (
          <>
            <Field label="Vendor's assessed amount (AUD)">
              <input
                type="number"
                value={landTaxAmount}
                onChange={(e) =>
                  setLandTaxAmount(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Vendor is absentee owner?">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={landTaxAbsentee}
                  onChange={(e) => setLandTaxAbsentee(e.target.checked)}
                />
                <span>Yes</span>
              </label>
            </Field>
            <Field label="Year start">
              <input
                type="date"
                value={landTaxStart}
                onChange={(e) => setLandTaxStart(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Year end">
              <input
                type="date"
                value={landTaxEnd}
                onChange={(e) => setLandTaxEnd(e.target.value)}
                className={inputClass}
              />
            </Field>
          </>
        )}
      </Section>

      <Section title="Other settlement fees">
        <Field label="Release of mortgage fee (AUD)">
          <input
            type="number"
            value={releaseOfMortgageFee}
            onChange={(e) =>
              setReleaseOfMortgageFee(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="TLA registration fee (AUD)">
          <input
            type="number"
            value={registrationFee}
            onChange={(e) =>
              setRegistrationFee(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="PEXA settlement fee (AUD)" full>
          <input
            type="number"
            value={pexaSettlementFee}
            onChange={(e) =>
              setPexaSettlementFee(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Stamp duty (Duties Act 2000 (Vic))">
        <Field label="Concessions" full>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Checkbox
              checked={isPpr}
              onChange={setIsPpr}
              label="Principal place of residence (s 57J)"
            />
            <Checkbox
              checked={isFhb}
              onChange={setIsFhb}
              label="First home buyer (Pt 5 Div 4A — up to $750k)"
            />
            <Checkbox
              checked={isOffThePlan}
              onChange={setIsOffThePlan}
              label="Off-the-plan concession (s 21)"
            />
            <Checkbox
              checked={pensionerConcession}
              onChange={setPensionerConcession}
              label="Pensioner concession"
            />
            <Checkbox
              checked={isForeign}
              onChange={setIsForeign}
              label="Foreign purchaser additional duty 8% (s 28A)"
            />
          </div>
        </Field>
      </Section>

      <Section title="PEXA + final notes">
        <Field label="PEXA workspace ID (if created)" full>
          <input
            type="text"
            value={pexaWorkspaceId}
            onChange={(e) => setPexaWorkspaceId(e.target.value)}
            className={inputClass}
            placeholder="e.g. P1234567"
          />
        </Field>
        <Field label="Notes for the supervising solicitor" full>
          <textarea
            value={finalNotes}
            onChange={(e) => setFinalNotes(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </Field>
      </Section>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={
          submitting ||
          !practiceName ||
          !principalSolicitor ||
          !clientName ||
          !addressLine ||
          !vendorName ||
          !purchaserName
        }
        className="w-full rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Computing settlement…" : "Compute and draft settlement statement"}
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <legend className="px-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {title}
      </legend>
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
