"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  CostDisclosureFeeBasis,
  CostDisclosureMatterType,
} from "@law/schema";

interface RateRow {
  role: string;
  rate: number;
}

export function CostDisclosureForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Practice
  const [practiceName, setPracticeName] = useState("");
  const [practiceAbn, setPracticeAbn] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [principalSolicitor, setPrincipalSolicitor] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Client
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  // Matter
  const [matterType, setMatterType] = useState<CostDisclosureMatterType>("conveyance");
  const [matterDescription, setMatterDescription] = useState("");
  const [feeBasis, setFeeBasis] = useState<CostDisclosureFeeBasis>("fixed");

  // Estimate
  const [fixedFee, setFixedFee] = useState<number | "">("");
  const [estimateLow, setEstimateLow] = useState<number | "">("");
  const [estimateHigh, setEstimateHigh] = useState<number | "">("");
  const [estimatedTotal, setEstimatedTotal] = useState<number | "">("");

  // Rates / disbursements
  const [rates, setRates] = useState<RateRow[]>([
    { role: "Principal", rate: 550 },
    { role: "Senior Associate", rate: 450 },
    { role: "Lawyer", rate: 350 },
    { role: "Paralegal", rate: 180 },
  ]);
  const [disbursements, setDisbursements] = useState<string>(
    "Title search\nPEXA settlement fee\nCourier",
  );

  // Billing
  const [billingFrequency, setBillingFrequency] = useState("On completion");
  const [paymentTerms, setPaymentTerms] = useState("14 days");

  // Conditional / sophisticated / risks
  const [isConditional, setIsConditional] = useState(false);
  const [upliftPercent, setUpliftPercent] = useState<number | "">("");
  const [isSophisticatedClient, setIsSophisticatedClient] = useState(false);
  const [assumptions, setAssumptions] = useState("");
  const [risks, setRisks] = useState("");
  const [noteToClient, setNoteToClient] = useState("");

  const fillSample = () => {
    setPracticeName("Smith & Co Lawyers");
    setPracticeAbn("12 345 678 901");
    setPracticeAddress("Level 3, 200 Queen Street, Melbourne VIC 3000");
    setPrincipalSolicitor("Jane Smith");
    setContactEmail("jane@smithco.law");
    setContactPhone("(03) 9000 0000");
    setClientName("Alex Nguyen");
    setClientAddress("12 Park Street, Brunswick VIC 3056");
    setClientEmail("alex.nguyen@example.com");
    setClientPhone("0412 345 678");
    setMatterType("conveyance");
    setMatterDescription(
      "Acting for the purchaser on the conveyance of 12 Smith Street, Brunswick VIC 3056 ($950,000 PPR purchase, settlement 60 days).",
    );
    setFeeBasis("fixed");
    setFixedFee(2200);
    setEstimatedTotal(2200);
    setEstimateLow(2000);
    setEstimateHigh(2500);
    setDisbursements("Title search\nPEXA settlement fee\nCouncil and water certificates\nLand tax certificate");
    setBillingFrequency("On settlement");
    setPaymentTerms("On settlement");
    setIsConditional(false);
    setIsSophisticatedClient(false);
    setAssumptions("No requisitions on title\nNo finance extension required");
    setRisks("Vendor caveat may delay settlement\nFinance approval not yet unconditional");
    setNoteToClient("First-home buyer; eligible for PPR concession.");
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const lines = (s: string) =>
        s
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

      const body = {
        jurisdiction: "VIC" as const,
        practice: {
          name: practiceName,
          abn: practiceAbn || undefined,
          address: practiceAddress,
          principalSolicitor: principalSolicitor || undefined,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
        },
        client: {
          name: clientName,
          address: clientAddress || undefined,
          email: clientEmail || undefined,
          phone: clientPhone || undefined,
        },
        matterType,
        matterDescription,
        feeBasis,
        fixedFeeAmount:
          feeBasis === "fixed" && typeof fixedFee === "number"
            ? { amount: fixedFee, currency: "AUD" as const }
            : undefined,
        estimatedTotal:
          typeof estimatedTotal === "number"
            ? { amount: estimatedTotal, currency: "AUD" as const }
            : undefined,
        estimateRange:
          typeof estimateLow === "number" && typeof estimateHigh === "number"
            ? {
                low: { amount: estimateLow, currency: "AUD" as const },
                high: { amount: estimateHigh, currency: "AUD" as const },
              }
            : undefined,
        hourlyRates:
          feeBasis === "hourly" || feeBasis === "blended"
            ? rates.map((r) => ({
                role: r.role,
                rate: { amount: r.rate, currency: "AUD" as const },
              }))
            : [],
        disbursementsAnticipated: lines(disbursements),
        billingFrequency,
        paymentTerms,
        isConditional,
        upliftPercent:
          isConditional && typeof upliftPercent === "number" ? upliftPercent : undefined,
        hasContingencyExposure: false,
        isSophisticatedClient,
        matterAssumptions: lines(assumptions),
        matterRisks: lines(risks),
        noteToClient: noteToClient || undefined,
      };

      const res = await fetch("/api/cost-disclosure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { id } = (await res.json()) as { id: string };
      router.push(`/cost-disclosure-review/${id}`);
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
      <Section title="Law practice">
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
        <Field label="Practice address" full>
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
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Contact phone">
          <input
            type="text"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Client">
        <Field label="Client name" full>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Client address" full>
          <input
            type="text"
            value={clientAddress}
            onChange={(e) => setClientAddress(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Client email">
          <input
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Client phone">
          <input
            type="text"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="The matter">
        <Field label="Matter type">
          <select
            value={matterType}
            onChange={(e) => setMatterType(e.target.value as CostDisclosureMatterType)}
            className={inputClass}
          >
            <option value="conveyance">Conveyance</option>
            <option value="lease_review">Lease review</option>
            <option value="litigation">Litigation</option>
            <option value="estate">Estate / probate</option>
            <option value="wills_and_estate_planning">Wills + estate planning</option>
            <option value="commercial_advice">Commercial advice</option>
            <option value="family_law">Family law</option>
            <option value="criminal">Criminal</option>
            <option value="advice_only">Advice only</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Fee basis">
          <select
            value={feeBasis}
            onChange={(e) => setFeeBasis(e.target.value as CostDisclosureFeeBasis)}
            className={inputClass}
          >
            <option value="fixed">Fixed</option>
            <option value="hourly">Hourly</option>
            <option value="milestone">Milestone</option>
            <option value="conditional">Conditional</option>
            <option value="blended">Blended</option>
          </select>
        </Field>
        <Field label="Matter description" full>
          <textarea
            value={matterDescription}
            onChange={(e) => setMatterDescription(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="e.g. Acting for the purchaser on the conveyance of 12 Smith Street, Richmond VIC 3121."
          />
        </Field>
      </Section>

      <Section title="Estimate">
        {feeBasis === "fixed" && (
          <Field label="Fixed fee (AUD)">
            <input
              type="number"
              value={fixedFee}
              onChange={(e) =>
                setFixedFee(e.target.value === "" ? "" : Number(e.target.value))
              }
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Estimated total (AUD, optional)">
          <input
            type="number"
            value={estimatedTotal}
            onChange={(e) =>
              setEstimatedTotal(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Estimate low (AUD)">
          <input
            type="number"
            value={estimateLow}
            onChange={(e) =>
              setEstimateLow(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Estimate high (AUD)">
          <input
            type="number"
            value={estimateHigh}
            onChange={(e) =>
              setEstimateHigh(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
      </Section>

      {(feeBasis === "hourly" || feeBasis === "blended") && (
        <Section title="Hourly rates">
          <div className="sm:col-span-2 space-y-2">
            {rates.map((r, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={r.role}
                  onChange={(e) => {
                    const next = [...rates];
                    next[i] = { ...next[i], role: e.target.value };
                    setRates(next);
                  }}
                  className={inputClass}
                  placeholder="Role"
                />
                <input
                  type="number"
                  value={r.rate}
                  onChange={(e) => {
                    const next = [...rates];
                    next[i] = { ...next[i], rate: Number(e.target.value || 0) };
                    setRates(next);
                  }}
                  className={inputClass}
                  placeholder="Rate (AUD/hr)"
                />
              </div>
            ))}
            <button
              type="button"
              className="text-sm text-zinc-700 underline hover:text-zinc-900"
              onClick={() => setRates([...rates, { role: "", rate: 0 }])}
            >
              + Add row
            </button>
          </div>
        </Section>
      )}

      <Section title="Billing and payment">
        <Field label="Billing frequency">
          <input
            type="text"
            value={billingFrequency}
            onChange={(e) => setBillingFrequency(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Payment terms">
          <input
            type="text"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Anticipated disbursements (one per line)" full>
          <textarea
            value={disbursements}
            onChange={(e) => setDisbursements(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Conditional costs / sophisticated client">
        <Field label="Conditional costs agreement?">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isConditional}
              onChange={(e) => setIsConditional(e.target.checked)}
            />
            <span>Yes — apply s 181 + s 182</span>
          </label>
        </Field>
        {isConditional && (
          <Field label="Uplift % (max 25)">
            <input
              type="number"
              max={25}
              min={0}
              value={upliftPercent}
              onChange={(e) =>
                setUpliftPercent(e.target.value === "" ? "" : Number(e.target.value))
              }
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Sophisticated client (s 174(4))?">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSophisticatedClient}
              onChange={(e) => setIsSophisticatedClient(e.target.checked)}
            />
            <span>Yes — modified disclosure</span>
          </label>
        </Field>
      </Section>

      <Section title="Assumptions and risks">
        <Field label="Matter assumptions (one per line)" full>
          <textarea
            value={assumptions}
            onChange={(e) => setAssumptions(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder={"e.g. No requisitions on title\nNo finance condition extension"}
          />
        </Field>
        <Field label="Matter risks (one per line)" full>
          <textarea
            value={risks}
            onChange={(e) => setRisks(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder={"e.g. Risk of delayed settlement\nVendor caveat may delay"}
          />
        </Field>
        <Field label="Note to client (optional)" full>
          <textarea
            value={noteToClient}
            onChange={(e) => setNoteToClient(e.target.value)}
            rows={2}
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
        disabled={submitting || !practiceName || !clientName || !matterDescription}
        className="w-full rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Drafting cost disclosure…" : "Generate cost disclosure"}
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";

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
