"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { BillKind } from "@law/schema";

interface FeeRow {
  date: string;
  feeEarner: string;
  description: string;
  units: number;
  rate: number;
}
interface DisbRow {
  date: string;
  description: string;
  amount: number;
  gstApplicable: boolean;
  paidFromTrust: boolean;
}
interface PriorRow {
  number: string;
  issuedOn: string;
  total: number;
  paid: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function BillingForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Practice
  const [practiceName, setPracticeName] = useState("");
  const [practiceAbn, setPracticeAbn] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [signingSolicitorName, setSigningSolicitorName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  // Client
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  // Bill
  const [billKind, setBillKind] = useState<BillKind>("interim_progress");
  const [billNumber, setBillNumber] = useState("");
  const [matterRef, setMatterRef] = useState("");
  const [matterDescription, setMatterDescription] = useState("");
  const [periodStart, setPeriodStart] = useState(plusDays(-30));
  const [periodEnd, setPeriodEnd] = useState(today());
  const [issuedOn, setIssuedOn] = useState(today());
  const [dueOn, setDueOn] = useState(plusDays(14));

  // Costs agreement / disclosure
  const [costsAgreementOnFile, setCostsAgreementOnFile] = useState(true);
  const [costsDisclosureGivenAt, setCostsDisclosureGivenAt] = useState("");
  const [isConditional, setIsConditional] = useState(false);
  const [upliftPercent, setUpliftPercent] = useState<number | "">("");
  const [upliftAppliedToFees, setUpliftAppliedToFees] = useState(false);
  const [isSophisticatedClient, setIsSophisticatedClient] = useState(false);

  // Items
  const [feeItems, setFeeItems] = useState<FeeRow[]>([
    {
      date: today(),
      feeEarner: "Senior Associate",
      description: "Initial advice and document review",
      units: 12,
      rate: 450,
    },
  ]);
  const [disbursements, setDisbursements] = useState<DisbRow[]>([
    {
      date: today(),
      description: "Title search",
      amount: 50,
      gstApplicable: false,
      paidFromTrust: false,
    },
  ]);
  const [priorBills, setPriorBills] = useState<PriorRow[]>([]);

  // Interest / trust
  const [interestPercent, setInterestPercent] = useState<number | "">("");
  const [interestClauseInAgreement, setInterestClauseInAgreement] = useState(false);
  const [trustBalance, setTrustBalance] = useState<number | "">("");
  const [willWithdrawFromTrust, setWillWithdrawFromTrust] = useState(false);

  // Notes
  const [matterNotes, setMatterNotes] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");

  // Live totals preview
  const preview = useMemo(() => {
    const fees = feeItems.reduce((s, l) => s + (l.units / 10) * l.rate, 0);
    const upliftAmt =
      isConditional && upliftAppliedToFees && typeof upliftPercent === "number"
        ? fees * (upliftPercent / 100)
        : 0;
    const disbGstable = disbursements
      .filter((d) => d.gstApplicable)
      .reduce((s, d) => s + d.amount, 0);
    const disbNon = disbursements
      .filter((d) => !d.gstApplicable)
      .reduce((s, d) => s + d.amount, 0);
    const subtotal = fees + upliftAmt + disbGstable + disbNon;
    const gst = (fees + upliftAmt + disbGstable) * 0.1;
    const total = subtotal + gst;
    const trustOff =
      willWithdrawFromTrust && typeof trustBalance === "number"
        ? Math.min(trustBalance, total)
        : 0;
    const prior = priorBills.reduce((s, b) => s + b.paid, 0);
    const due = Math.max(0, total - trustOff - prior);
    return { fees, upliftAmt, subtotal, gst, total, trustOff, prior, due };
  }, [
    feeItems,
    isConditional,
    upliftAppliedToFees,
    upliftPercent,
    disbursements,
    willWithdrawFromTrust,
    trustBalance,
    priorBills,
  ]);

  const fillSample = () => {
    setPracticeName("Smith & Co Lawyers");
    setPracticeAbn("12 345 678 901");
    setPracticeAddress("Level 3, 200 Queen Street, Melbourne VIC 3000");
    setSigningSolicitorName("Jane Smith");
    setContactEmail("jane@smithco.law");
    setContactPhone("(03) 9000 0000");
    setBankName("ANZ");
    setBsb("013-006");
    setAccountNumber("12345678");
    setAccountName("Smith & Co Lawyers Office Account");
    setClientName("Acme Cafe Pty Ltd");
    setClientAddress("88 Lygon Street, Carlton VIC 3053");
    setClientEmail("accounts@acmecafe.com.au");
    setClientPhone("0398765432");
    setBillKind("interim_progress");
    setBillNumber("M2026-0042");
    setMatterRef("M2026-0042");
    setMatterDescription(
      "Acting for the tenant on review and negotiation of a 5-year retail lease at 88 Lygon Street, Carlton.",
    );
    setCostsAgreementOnFile(true);
    setCostsDisclosureGivenAt(plusDays(-45));
    setFeeItems([
      {
        date: plusDays(-20),
        feeEarner: "Senior Associate",
        description: "Initial review of LIV lease + Additional Provisions schedule; advice memo to client",
        units: 24,
        rate: 450,
      },
      {
        date: plusDays(-10),
        feeEarner: "Lawyer",
        description: "Drafted amendment letter; conference with client; revisions to make-good clause",
        units: 18,
        rate: 350,
      },
    ]);
    setDisbursements([
      {
        date: plusDays(-15),
        description: "ASIC company search",
        amount: 9.5,
        gstApplicable: false,
        paidFromTrust: false,
      },
      {
        date: plusDays(-5),
        description: "Title search",
        amount: 50,
        gstApplicable: false,
        paidFromTrust: false,
      },
    ]);
    setMatterNotes("Tenant negotiating make-good and outgoings carve-outs; landlord has agreed in principle.");
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        jurisdiction: "VIC" as const,
        billKind,
        billNumber,
        practice: {
          name: practiceName,
          abn: practiceAbn,
          address: practiceAddress,
          principalSolicitor: signingSolicitorName || undefined,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
          bankName: bankName || undefined,
          bsb: bsb || undefined,
          accountNumber: accountNumber || undefined,
          accountName: accountName || undefined,
        },
        client: {
          name: clientName,
          address: clientAddress || undefined,
          email: clientEmail || undefined,
          phone: clientPhone || undefined,
        },
        matterRef,
        matterDescription,
        costsAgreementOnFile,
        costsDisclosureGivenAt: costsDisclosureGivenAt || undefined,
        isConditional,
        upliftPercent:
          isConditional && typeof upliftPercent === "number" ? upliftPercent : undefined,
        upliftAppliedToFees,
        periodStart,
        periodEnd,
        issuedOn,
        dueOn,
        feeItems: feeItems.map((l) => ({
          date: l.date,
          feeEarner: l.feeEarner,
          description: l.description,
          units: l.units,
          rate: { amount: l.rate, currency: "AUD" as const },
          amount: { amount: (l.units / 10) * l.rate, currency: "AUD" as const },
          taxable: true,
        })),
        disbursements: disbursements.map((d) => ({
          date: d.date,
          description: d.description,
          amount: { amount: d.amount, currency: "AUD" as const },
          gstApplicable: d.gstApplicable,
          paidFromTrust: d.paidFromTrust,
        })),
        priorBills: priorBills.map((p) => ({
          number: p.number,
          issuedOn: p.issuedOn,
          total: { amount: p.total, currency: "AUD" as const },
          paid: { amount: p.paid, currency: "AUD" as const },
        })),
        interestPercent:
          typeof interestPercent === "number" ? interestPercent : undefined,
        interestClauseInAgreement,
        trustBalance:
          typeof trustBalance === "number"
            ? { amount: trustBalance, currency: "AUD" as const }
            : undefined,
        willWithdrawFromTrust,
        isSophisticatedClient,
        signingSolicitorName,
        matterNotes: matterNotes || undefined,
        paymentInstructions: paymentInstructions || undefined,
      };

      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { id } = (await res.json()) as { id: string };
      router.push(`/billing-review/${id}`);
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
      <Section title="Bill kind">
        <Field label="Kind">
          <select
            value={billKind}
            onChange={(e) => setBillKind(e.target.value as BillKind)}
            className={inputClass}
          >
            <option value="interim_progress">Interim progress bill</option>
            <option value="final">Final bill</option>
            <option value="itemised_on_request">Itemised bill (s 187 request)</option>
            <option value="memorandum_of_costs">Memorandum of costs</option>
          </select>
        </Field>
        <Field label="Bill number">
          <input
            type="text"
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            className={inputClass}
            placeholder="e.g. 2026-0142"
          />
        </Field>
      </Section>

      <Section title="Law practice">
        <Field label="Practice name">
          <input
            type="text"
            value={practiceName}
            onChange={(e) => setPracticeName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="ABN (11 digits)">
          <input
            type="text"
            value={practiceAbn}
            onChange={(e) => setPracticeAbn(e.target.value)}
            className={inputClass}
            placeholder="11 222 333 444"
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
        <Field label="Signing solicitor (s 186)">
          <input
            type="text"
            value={signingSolicitorName}
            onChange={(e) => setSigningSolicitorName(e.target.value)}
            className={inputClass}
            placeholder="Australian legal practitioner"
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
        <Field label="Bank name">
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="BSB">
          <input
            type="text"
            value={bsb}
            onChange={(e) => setBsb(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Account number">
          <input
            type="text"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Account name">
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
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

      <Section title="Matter and period">
        <Field label="Matter ref">
          <input
            type="text"
            value={matterRef}
            onChange={(e) => setMatterRef(e.target.value)}
            className={inputClass}
            placeholder="e.g. M2026-0042"
          />
        </Field>
        <Field label="Matter description" full>
          <textarea
            value={matterDescription}
            onChange={(e) => setMatterDescription(e.target.value)}
            rows={2}
            className={inputClass}
            placeholder="e.g. Acting for the purchaser on the conveyance of 12 Smith Street, Richmond VIC 3121."
          />
        </Field>
        <Field label="Period start">
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Period end">
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Issued on">
          <input
            type="date"
            value={issuedOn}
            onChange={(e) => setIssuedOn(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Due on">
          <input
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Costs agreement / disclosure">
        <Field label="Written costs agreement on file (s 180)?">
          <Checkbox checked={costsAgreementOnFile} onChange={setCostsAgreementOnFile} />
        </Field>
        <Field label="Costs disclosure given on (s 174)">
          <input
            type="date"
            value={costsDisclosureGivenAt}
            onChange={(e) => setCostsDisclosureGivenAt(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Conditional costs agreement (s 181)?">
          <Checkbox checked={isConditional} onChange={setIsConditional} />
        </Field>
        {isConditional && (
          <>
            <Field label="Uplift % (max 25)">
              <input
                type="number"
                min={0}
                max={25}
                value={upliftPercent}
                onChange={(e) =>
                  setUpliftPercent(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Uplift applied to fees in this bill?">
              <Checkbox
                checked={upliftAppliedToFees}
                onChange={setUpliftAppliedToFees}
              />
            </Field>
          </>
        )}
        <Field label="Sophisticated client (s 174(4))?">
          <Checkbox checked={isSophisticatedClient} onChange={setIsSophisticatedClient} />
        </Field>
      </Section>

      <Section title="Professional fees (1 unit = 6 minutes)">
        <div className="sm:col-span-2 space-y-3">
          {feeItems.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded-md border border-zinc-200 bg-white p-3">
              <input
                type="date"
                value={row.date}
                onChange={(e) => {
                  const next = [...feeItems];
                  next[i] = { ...row, date: e.target.value };
                  setFeeItems(next);
                }}
                className={`${inputClass} col-span-3`}
              />
              <input
                type="text"
                value={row.feeEarner}
                onChange={(e) => {
                  const next = [...feeItems];
                  next[i] = { ...row, feeEarner: e.target.value };
                  setFeeItems(next);
                }}
                placeholder="Fee earner"
                className={`${inputClass} col-span-3`}
              />
              <input
                type="text"
                value={row.description}
                onChange={(e) => {
                  const next = [...feeItems];
                  next[i] = { ...row, description: e.target.value };
                  setFeeItems(next);
                }}
                placeholder="Description of work"
                className={`${inputClass} col-span-12`}
              />
              <input
                type="number"
                value={row.units}
                onChange={(e) => {
                  const next = [...feeItems];
                  next[i] = { ...row, units: Number(e.target.value || 0) };
                  setFeeItems(next);
                }}
                placeholder="Units"
                className={`${inputClass} col-span-2`}
              />
              <input
                type="number"
                value={row.rate}
                onChange={(e) => {
                  const next = [...feeItems];
                  next[i] = { ...row, rate: Number(e.target.value || 0) };
                  setFeeItems(next);
                }}
                placeholder="Rate $/hr"
                className={`${inputClass} col-span-3`}
              />
              <div className="col-span-5 flex items-center text-sm font-mono text-zinc-700">
                = ${((row.units / 10) * row.rate).toFixed(2)}
              </div>
              <button
                type="button"
                onClick={() => setFeeItems(feeItems.filter((_, j) => j !== i))}
                className="col-span-2 text-sm text-red-700 hover:text-red-900"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-zinc-700 underline hover:text-zinc-900"
            onClick={() =>
              setFeeItems([
                ...feeItems,
                { date: today(), feeEarner: "", description: "", units: 0, rate: 0 },
              ])
            }
          >
            + Add fee item
          </button>
        </div>
      </Section>

      <Section title="Disbursements">
        <div className="sm:col-span-2 space-y-3">
          {disbursements.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded-md border border-zinc-200 bg-white p-3">
              <input
                type="date"
                value={row.date}
                onChange={(e) => {
                  const next = [...disbursements];
                  next[i] = { ...row, date: e.target.value };
                  setDisbursements(next);
                }}
                className={`${inputClass} col-span-3`}
              />
              <input
                type="text"
                value={row.description}
                onChange={(e) => {
                  const next = [...disbursements];
                  next[i] = { ...row, description: e.target.value };
                  setDisbursements(next);
                }}
                placeholder="Description"
                className={`${inputClass} col-span-6`}
              />
              <input
                type="number"
                value={row.amount}
                onChange={(e) => {
                  const next = [...disbursements];
                  next[i] = { ...row, amount: Number(e.target.value || 0) };
                  setDisbursements(next);
                }}
                placeholder="Amount"
                className={`${inputClass} col-span-3`}
              />
              <label className="col-span-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.gstApplicable}
                  onChange={(e) => {
                    const next = [...disbursements];
                    next[i] = { ...row, gstApplicable: e.target.checked };
                    setDisbursements(next);
                  }}
                />
                GST
              </label>
              <label className="col-span-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.paidFromTrust}
                  onChange={(e) => {
                    const next = [...disbursements];
                    next[i] = { ...row, paidFromTrust: e.target.checked };
                    setDisbursements(next);
                  }}
                />
                Paid from trust
              </label>
              <button
                type="button"
                onClick={() => setDisbursements(disbursements.filter((_, j) => j !== i))}
                className="col-span-5 text-sm text-red-700 hover:text-red-900"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-zinc-700 underline hover:text-zinc-900"
            onClick={() =>
              setDisbursements([
                ...disbursements,
                {
                  date: today(),
                  description: "",
                  amount: 0,
                  gstApplicable: true,
                  paidFromTrust: false,
                },
              ])
            }
          >
            + Add disbursement
          </button>
        </div>
      </Section>

      <Section title="Prior bills (interim reconciliation)">
        <div className="sm:col-span-2 space-y-3">
          {priorBills.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded-md border border-zinc-200 bg-white p-3">
              <input
                type="text"
                value={row.number}
                onChange={(e) => {
                  const next = [...priorBills];
                  next[i] = { ...row, number: e.target.value };
                  setPriorBills(next);
                }}
                placeholder="Bill number"
                className={`${inputClass} col-span-3`}
              />
              <input
                type="date"
                value={row.issuedOn}
                onChange={(e) => {
                  const next = [...priorBills];
                  next[i] = { ...row, issuedOn: e.target.value };
                  setPriorBills(next);
                }}
                className={`${inputClass} col-span-3`}
              />
              <input
                type="number"
                value={row.total}
                onChange={(e) => {
                  const next = [...priorBills];
                  next[i] = { ...row, total: Number(e.target.value || 0) };
                  setPriorBills(next);
                }}
                placeholder="Total"
                className={`${inputClass} col-span-2`}
              />
              <input
                type="number"
                value={row.paid}
                onChange={(e) => {
                  const next = [...priorBills];
                  next[i] = { ...row, paid: Number(e.target.value || 0) };
                  setPriorBills(next);
                }}
                placeholder="Paid"
                className={`${inputClass} col-span-2`}
              />
              <button
                type="button"
                onClick={() => setPriorBills(priorBills.filter((_, j) => j !== i))}
                className="col-span-2 text-sm text-red-700 hover:text-red-900"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-zinc-700 underline hover:text-zinc-900"
            onClick={() =>
              setPriorBills([
                ...priorBills,
                { number: "", issuedOn: today(), total: 0, paid: 0 },
              ])
            }
          >
            + Add prior bill
          </button>
        </div>
      </Section>

      <Section title="Interest and trust">
        <Field label="Overdue interest % p.a. (optional)">
          <input
            type="number"
            min={0}
            value={interestPercent}
            onChange={(e) =>
              setInterestPercent(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Costs agreement permits interest (s 193)?">
          <Checkbox
            checked={interestClauseInAgreement}
            onChange={setInterestClauseInAgreement}
          />
        </Field>
        <Field label="Trust money balance (AUD, optional)">
          <input
            type="number"
            min={0}
            value={trustBalance}
            onChange={(e) =>
              setTrustBalance(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Withdraw trust money to pay this bill (s 150 / s 152)?">
          <Checkbox
            checked={willWithdrawFromTrust}
            onChange={setWillWithdrawFromTrust}
          />
        </Field>
      </Section>

      <Section title="Notes (optional)">
        <Field label="Matter notes" full>
          <textarea
            value={matterNotes}
            onChange={(e) => setMatterNotes(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </Field>
        <Field label="Payment instructions" full>
          <textarea
            value={paymentInstructions}
            onChange={(e) => setPaymentInstructions(e.target.value)}
            rows={2}
            className={inputClass}
            placeholder="Defaults to bank details + payment reference (bill number)."
          />
        </Field>
      </Section>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Live preview
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">
          <Stat label="Fees" value={preview.fees} />
          {preview.upliftAmt > 0 && <Stat label="Uplift" value={preview.upliftAmt} />}
          <Stat label="Subtotal ex GST" value={preview.subtotal} />
          <Stat label="GST" value={preview.gst} />
          <Stat label="Total inc GST" value={preview.total} bold />
          {preview.trustOff > 0 && (
            <Stat label="Trust offset" value={-preview.trustOff} />
          )}
          {preview.prior > 0 && <Stat label="Prior paid" value={-preview.prior} />}
          <Stat label="Amount due" value={preview.due} bold />
        </div>
      </div>

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
          !practiceAbn ||
          !clientName ||
          !matterDescription ||
          !signingSolicitorName ||
          !billNumber ||
          feeItems.length === 0
        }
        className="w-full rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Drafting bill…" : "Generate bill"}
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
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{checked ? "Yes" : "No"}</span>
    </label>
  );
}

function Stat({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={bold ? "rounded bg-zinc-900 px-3 py-2 text-white" : ""}>
      <div
        className={`text-[10px] uppercase tracking-widest ${bold ? "text-zinc-300" : "text-zinc-500"}`}
      >
        {label}
      </div>
      <div className={bold ? "text-base font-semibold" : "text-sm text-zinc-800"}>
        ${value.toFixed(2)}
      </div>
    </div>
  );
}
