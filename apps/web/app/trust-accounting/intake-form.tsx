"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SAMPLE_RECEIPTS = `[
  {
    "id": "r1",
    "kind": "general_trust",
    "matterRef": "M2026-0001",
    "ledgerName": "Smith — conveyance",
    "receivedFrom": "John Smith",
    "receivedOn": "2026-04-03",
    "amount": { "amount": 5000, "currency": "AUD" },
    "paymentMethod": "eft",
    "description": "Deposit on account of costs",
    "receiptNumber": "TR-001",
    "receiptIssuedAt": "2026-04-03T10:15:00+10:00"
  },
  {
    "id": "r2",
    "kind": "general_trust",
    "matterRef": "M2026-0002",
    "ledgerName": "Acme Pty Ltd — lease",
    "receivedFrom": "Acme Pty Ltd",
    "receivedOn": "2026-04-12",
    "amount": { "amount": 3000, "currency": "AUD" },
    "paymentMethod": "eft",
    "description": "Funds in advance",
    "receiptNumber": "TR-002",
    "receiptIssuedAt": "2026-04-12T09:00:00+10:00"
  }
]`;

const SAMPLE_PAYMENTS = `[
  {
    "id": "p1",
    "matterRef": "M2026-0001",
    "ledgerName": "Smith — conveyance",
    "paidTo": "Land Use Victoria",
    "paidOn": "2026-04-08",
    "amount": { "amount": 250, "currency": "AUD" },
    "method": "eft",
    "reference": "TP-001",
    "authority": "client_written_direction",
    "description": "Title search disbursement"
  },
  {
    "id": "p2",
    "matterRef": "M2026-0001",
    "ledgerName": "Smith — conveyance",
    "paidTo": "Smith & Co Lawyers",
    "paidOn": "2026-04-25",
    "amount": { "amount": 2000, "currency": "AUD" },
    "method": "trust_to_trust",
    "reference": "TP-002",
    "authority": "bill_given_s152",
    "description": "Costs withdrawn after bill 2026-0142",
    "billNumber": "2026-0142"
  }
]`;

const SAMPLE_TRANSFERS = `[]`;

const SAMPLE_LEDGER_OPENINGS = `[
  { "ledgerName": "Smith — conveyance", "matterRef": "M2026-0001", "openingBalance": { "amount": 0, "currency": "AUD" } },
  { "ledgerName": "Acme Pty Ltd — lease", "matterRef": "M2026-0002", "openingBalance": { "amount": 0, "currency": "AUD" } }
]`;

export function TrustAccountForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [practiceName, setPracticeName] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [practiceAbn, setPracticeAbn] = useState("");
  const [principalSolicitor, setPrincipalSolicitor] = useState("");
  const [trustAuthorisedSolicitorName, setTrustAuthorisedSolicitorName] = useState("");
  const [externalExaminerName, setExternalExaminerName] = useState("");
  const [externalExaminerLastReportDate, setExternalExaminerLastReportDate] = useState("");

  const [periodStart, setPeriodStart] = useState("2026-04-01");
  const [periodEnd, setPeriodEnd] = useState("2026-04-30");
  const [openingTrustBalance, setOpeningTrustBalance] = useState<number | "">(0);

  // Bank
  const [bankName, setBankName] = useState("");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankOpening, setBankOpening] = useState<number | "">(0);
  const [bankClosing, setBankClosing] = useState<number | "">(0);
  const [bankCredits, setBankCredits] = useState<number | "">(0);
  const [bankDebits, setBankDebits] = useState<number | "">(0);
  const [unpresentedJson, setUnpresentedJson] = useState("[]");
  const [outstandingJson, setOutstandingJson] = useState("[]");

  const [receiptsJson, setReceiptsJson] = useState(SAMPLE_RECEIPTS);
  const [paymentsJson, setPaymentsJson] = useState(SAMPLE_PAYMENTS);
  const [transfersJson, setTransfersJson] = useState(SAMPLE_TRANSFERS);
  const [ledgerOpeningsJson, setLedgerOpeningsJson] = useState(SAMPLE_LEDGER_OPENINGS);

  const fillSample = () => {
    setPracticeName("Smith & Co Lawyers");
    setPracticeAbn("12 345 678 901");
    setPracticeAddress("Level 3, 200 Queen Street, Melbourne VIC 3000");
    setPrincipalSolicitor("Jane Smith");
    setTrustAuthorisedSolicitorName("Jane Smith");
    setExternalExaminerName("Patel Audit Pty Ltd");
    setExternalExaminerLastReportDate("2025-09-30");
    setBankName("ANZ");
    setBsb("013-006");
    setAccountNumber("99887766");
    setAccountName("Smith & Co Law Practice Trust Account");
    setBankOpening(0);
    setBankClosing(5750);
    setBankCredits(8000);
    setBankDebits(2250);
    setReceiptsJson(SAMPLE_RECEIPTS);
    setPaymentsJson(SAMPLE_PAYMENTS);
    setTransfersJson(SAMPLE_TRANSFERS);
    setLedgerOpeningsJson(SAMPLE_LEDGER_OPENINGS);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let receipts, payments, transfers, ledgerOpeningBalances;
      let unpresentedCheques, outstandingDeposits;
      try {
        receipts = JSON.parse(receiptsJson);
        payments = JSON.parse(paymentsJson);
        transfers = JSON.parse(transfersJson);
        ledgerOpeningBalances = JSON.parse(ledgerOpeningsJson);
        unpresentedCheques = JSON.parse(unpresentedJson);
        outstandingDeposits = JSON.parse(outstandingJson);
      } catch (e) {
        throw new Error(
          `JSON parse error in one of the journals: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      const body = {
        jurisdiction: "VIC" as const,
        practice: {
          name: practiceName,
          abn: practiceAbn || undefined,
          address: practiceAddress,
          principalSolicitor,
          trustAuthorisedSolicitorName,
          externalExaminerName: externalExaminerName || undefined,
          externalExaminerLastReportDate: externalExaminerLastReportDate || undefined,
        },
        periodStart,
        periodEnd,
        openingTrustBalance: {
          amount: typeof openingTrustBalance === "number" ? openingTrustBalance : 0,
          currency: "AUD" as const,
        },
        bankStatement: {
          bankName,
          bsb,
          accountNumber,
          accountName,
          openingBalance: {
            amount: typeof bankOpening === "number" ? bankOpening : 0,
            currency: "AUD" as const,
          },
          closingBalance: {
            amount: typeof bankClosing === "number" ? bankClosing : 0,
            currency: "AUD" as const,
          },
          totalCredits: {
            amount: typeof bankCredits === "number" ? bankCredits : 0,
            currency: "AUD" as const,
          },
          totalDebits: {
            amount: typeof bankDebits === "number" ? bankDebits : 0,
            currency: "AUD" as const,
          },
          unpresentedCheques,
          outstandingDeposits,
        },
        receipts,
        payments,
        transfers,
        ledgerOpeningBalances,
      };

      const res = await fetch("/api/trust-accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { id } = (await res.json()) as { id: string };
      router.push(`/trust-accounting-review/${id}`);
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
        <Field label="Trust authorised solicitor (s 144(2))">
          <input
            type="text"
            value={trustAuthorisedSolicitorName}
            onChange={(e) => setTrustAuthorisedSolicitorName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="External examiner (optional)">
          <input
            type="text"
            value={externalExaminerName}
            onChange={(e) => setExternalExaminerName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Last external examiner report date">
          <input
            type="date"
            value={externalExaminerLastReportDate}
            onChange={(e) => setExternalExaminerLastReportDate(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Period">
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
        <Field label="Opening trust balance (cashbook)" full>
          <input
            type="number"
            value={openingTrustBalance}
            onChange={(e) =>
              setOpeningTrustBalance(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Bank statement">
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
            placeholder="123-456"
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
            placeholder="e.g. Smith & Co Law Practice Trust Account"
          />
        </Field>
        <Field label="Opening balance">
          <input
            type="number"
            value={bankOpening}
            onChange={(e) =>
              setBankOpening(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Closing balance">
          <input
            type="number"
            value={bankClosing}
            onChange={(e) =>
              setBankClosing(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Total credits">
          <input
            type="number"
            value={bankCredits}
            onChange={(e) =>
              setBankCredits(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Total debits">
          <input
            type="number"
            value={bankDebits}
            onChange={(e) =>
              setBankDebits(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Unpresented cheques (JSON array)" full>
          <textarea
            value={unpresentedJson}
            onChange={(e) => setUnpresentedJson(e.target.value)}
            rows={3}
            className={`${inputClass} font-mono text-xs`}
            placeholder='[{ "ref": "100123", "amount": { "amount": 300, "currency": "AUD" } }]'
          />
        </Field>
        <Field label="Outstanding deposits (JSON array)" full>
          <textarea
            value={outstandingJson}
            onChange={(e) => setOutstandingJson(e.target.value)}
            rows={3}
            className={`${inputClass} font-mono text-xs`}
            placeholder='[{ "ref": "DEP-22", "amount": { "amount": 500, "currency": "AUD" } }]'
          />
        </Field>
      </Section>

      <Section title="Ledger opening balances">
        <Field label="Per-matter opening balances (JSON array)" full>
          <textarea
            value={ledgerOpeningsJson}
            onChange={(e) => setLedgerOpeningsJson(e.target.value)}
            rows={6}
            className={`${inputClass} font-mono text-xs`}
          />
        </Field>
      </Section>

      <Section title="Journals">
        <Field label="Receipts (JSON array, LPUGR r 35-36)" full>
          <textarea
            value={receiptsJson}
            onChange={(e) => setReceiptsJson(e.target.value)}
            rows={10}
            className={`${inputClass} font-mono text-xs`}
          />
        </Field>
        <Field label="Payments (JSON array, LPUGR r 38)" full>
          <textarea
            value={paymentsJson}
            onChange={(e) => setPaymentsJson(e.target.value)}
            rows={10}
            className={`${inputClass} font-mono text-xs`}
          />
        </Field>
        <Field label="Transfers (JSON array)" full>
          <textarea
            value={transfersJson}
            onChange={(e) => setTransfersJson(e.target.value)}
            rows={4}
            className={`${inputClass} font-mono text-xs`}
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
          !trustAuthorisedSolicitorName ||
          !bankName ||
          !accountName
        }
        className="w-full rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Reconciling…" : "Reconcile and draft compliance pack"}
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
