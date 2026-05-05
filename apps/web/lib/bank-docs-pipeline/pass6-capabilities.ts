import {
  CovenantSummarySchema,
  CrossDefaultMapSchema,
  FeeLadderRowSchema,
  RegulatoryHookSchema,
  RepaymentScenarioSchema,
  type BankDocsExtractionBundle,
  type CovenantSummary,
  type CrossDefaultMap,
  type FeeLadderRow,
  type RegulatoryHook,
  type RepaymentScenario,
} from "@law/schema";

/**
 * Pass 6 — Capability synthesis for bank docs.
 *
 * Mostly deterministic computation off the extraction bundle:
 *   - repaymentScenarios: base + +1% / +3% / IO→P&I shock
 *   - feeLadder: scenario-based fee aggregation (early repay, default 30d, discharge)
 *   - covenants: extracted from defaultEvents + reviewEvents
 *   - crossDefault: derived from defaultEvents.isCrossDefault
 *   - regulatoryHooks: AFCA / NCC hardship / Banking Code 2025 availability
 */

// ====================================================================
// Repayment scenarios (deterministic amortisation)
// ====================================================================

function monthlyPayment(principal: number, annualRatePct: number, termMonths: number): number {
  if (termMonths <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

function totalInterest(principal: number, monthly: number, termMonths: number): number {
  return Math.max(0, monthly * termMonths - principal);
}

export function computeRepaymentScenarios(
  bundle: BankDocsExtractionBundle,
): RepaymentScenario[] {
  const principal = bundle.particulars.facilityAmount?.amount;
  const rate = bundle.particulars.interestRate;
  const repay = bundle.particulars.repayment;
  if (!principal || !rate?.initialRatePct || !repay?.termMonths) return [];

  const baseRate = rate.initialRatePct;
  const term = repay.termMonths;
  const ioMonths = repay.interestOnlyMonths ?? 0;

  const mkScenario = (
    label: string,
    ratePct: number,
    notes?: string,
  ): RepaymentScenario => {
    const piTerm = Math.max(1, term - ioMonths);
    const piMonthly = monthlyPayment(principal, ratePct, piTerm);
    const ioMonthly = (principal * (ratePct / 100)) / 12;
    // Effective monthly: if IO period, report PI step; otherwise straight PI.
    const monthly = ioMonths > 0 ? piMonthly : piMonthly;
    const interest =
      ioMonths > 0
        ? ioMonthly * ioMonths + totalInterest(principal, piMonthly, piTerm)
        : totalInterest(principal, piMonthly, piTerm);
    return RepaymentScenarioSchema.parse({
      label,
      monthlyRepayment: {
        amount: Math.round(monthly),
        currency: "AUD",
        raw: `~$${Math.round(monthly).toLocaleString("en-AU")} / month (P&I)`,
      },
      totalInterestOverTerm: {
        amount: Math.round(interest),
        currency: "AUD",
        raw: `~$${Math.round(interest).toLocaleString("en-AU")} interest over ${term} months`,
      },
      effectiveRatePct: ratePct,
      notes,
    });
  };

  const scenarios: RepaymentScenario[] = [
    mkScenario("Base case", baseRate, `At advertised initial rate of ${baseRate}%.`),
    mkScenario(
      "+1% rate shock",
      baseRate + 1,
      "Rate +1% — modest tightening cycle. Recommend stress-testing repayments at this level.",
    ),
    mkScenario(
      "+3% rate shock",
      baseRate + 3,
      "Rate +3% — APRA serviceability buffer. If repayments are unaffordable here, the borrower carries material rate risk.",
    ),
  ];

  if (ioMonths > 0) {
    const ioMonthly = (principal * (baseRate / 100)) / 12;
    const piMonthly = monthlyPayment(principal, baseRate, term - ioMonths);
    const stepUpPct = ((piMonthly - ioMonthly) / ioMonthly) * 100;
    scenarios.push(
      RepaymentScenarioSchema.parse({
        label: "IO → P&I switch",
        monthlyRepayment: {
          amount: Math.round(piMonthly),
          currency: "AUD",
          raw: `~$${Math.round(piMonthly).toLocaleString("en-AU")} / month after switch`,
        },
        effectiveRatePct: baseRate,
        notes: `After the ${ioMonths}-month IO period ends, repayments step up from ~$${Math.round(ioMonthly).toLocaleString("en-AU")} to ~$${Math.round(piMonthly).toLocaleString("en-AU")} (a ${Math.round(stepUpPct)}% jump). Borrower must budget for this transition.`,
      }),
    );
  }

  if (rate.defaultRatePct) {
    scenarios.push(
      RepaymentScenarioSchema.parse({
        label: "Default rate (post-event)",
        monthlyRepayment: {
          amount: Math.round((principal * (rate.defaultRatePct / 100)) / 12),
          currency: "AUD",
          raw: `~$${Math.round((principal * (rate.defaultRatePct / 100)) / 12).toLocaleString("en-AU")} / month interest at default rate`,
        },
        effectiveRatePct: rate.defaultRatePct,
        notes: `Higher-rate-on-default of ${rate.defaultRatePct}% — applies on missed payment. Compounding daily on the full balance materially increases exposure.`,
      }),
    );
  }

  return scenarios;
}

// ====================================================================
// Fee ladder (deterministic aggregation by scenario)
// ====================================================================

export function computeFeeLadder(bundle: BankDocsExtractionBundle): FeeLadderRow[] {
  const fees = bundle.particulars.fees;
  if (fees.length === 0) return [];

  const byTrigger = new Map<string, typeof fees>();
  for (const f of fees) {
    const arr = byTrigger.get(f.trigger) ?? [];
    arr.push(f);
    byTrigger.set(f.trigger, arr);
  }

  const sumAud = (list: typeof fees): number =>
    list.reduce((acc, f) => acc + (f.amount?.amount ?? 0), 0);

  const rows: FeeLadderRow[] = [];

  const establishmentFees = [
    ...(byTrigger.get("establishment") ?? []),
    ...(byTrigger.get("drawdown") ?? []),
    ...(byTrigger.get("valuation") ?? []),
  ];
  if (establishmentFees.length > 0) {
    rows.push(
      FeeLadderRowSchema.parse({
        scenario: "Drawdown / settlement",
        fees: establishmentFees
          .filter((f) => f.amount)
          .map((f) => ({
            description: f.description,
            amount: { ...f.amount!, currency: "AUD" },
          })),
        totalAud: sumAud(establishmentFees),
      }),
    );
  }

  const earlyRepayment = byTrigger.get("early_repayment") ?? [];
  if (earlyRepayment.length > 0) {
    rows.push(
      FeeLadderRowSchema.parse({
        scenario: "Early repayment / refinance",
        fees: earlyRepayment
          .filter((f) => f.amount)
          .map((f) => ({
            description: f.description,
            amount: { ...f.amount!, currency: "AUD" },
          })),
        totalAud: sumAud(earlyRepayment),
      }),
    );
  }

  const defaultFees = byTrigger.get("default") ?? [];
  if (defaultFees.length > 0) {
    rows.push(
      FeeLadderRowSchema.parse({
        scenario: "Default — 30 days unremedied",
        fees: defaultFees
          .filter((f) => f.amount)
          .map((f) => ({
            description: f.description,
            amount: { ...f.amount!, currency: "AUD" },
          })),
        totalAud: sumAud(defaultFees),
      }),
    );
  }

  const dischargeFees = byTrigger.get("discharge") ?? [];
  if (dischargeFees.length > 0) {
    rows.push(
      FeeLadderRowSchema.parse({
        scenario: "Discharge / payout",
        fees: dischargeFees
          .filter((f) => f.amount)
          .map((f) => ({
            description: f.description,
            amount: { ...f.amount!, currency: "AUD" },
          })),
        totalAud: sumAud(dischargeFees),
      }),
    );
  }

  return rows;
}

// ====================================================================
// Covenant dashboard (extracted from defaultEvents + reviewEvents)
// ====================================================================

export function computeCovenantDashboard(
  bundle: BankDocsExtractionBundle,
): CovenantSummary[] {
  const out: CovenantSummary[] = [];

  // Provisions tagged financial_covenants
  const covenantClauses = bundle.provisions.filter(
    (p) => p.focusArea === "financial_covenants",
  );
  for (const c of covenantClauses) {
    out.push(
      CovenantSummarySchema.parse({
        description: c.summary || c.heading || `Clause ${c.number}`,
        threshold: extractThreshold(c.fullText) ?? "(threshold not extracted — see clause)",
        testFrequency: extractFrequency(c.fullText),
        consequenceOfBreach:
          "Likely event of default — see default-and-enforcement section. Lender may accelerate and call up the facility.",
        cureRights: c.fullText.match(/cure|remedy|rectif/i) ? "Cure rights present in clause" : undefined,
        severity: c.severity,
      }),
    );
  }

  // Review events (annual review, etc.)
  for (const ev of bundle.particulars.reviewEvents) {
    out.push(
      CovenantSummarySchema.parse({
        description: ev,
        threshold: "Lender's discretion at review",
        testFrequency: ev.toLowerCase().includes("annual") ? "Annually" : "As specified in facility",
        consequenceOfBreach:
          "Review event may trigger demand for additional security, repricing, or non-renewal of facility.",
        severity: "medium",
      }),
    );
  }

  return out;
}

function extractThreshold(text: string): string | undefined {
  // Heuristics: ICR / LVR / DSCR / minimum revenue
  const icr = text.match(/ICR[^\n.]{0,40}([\d.]+\s*x?)/i);
  if (icr) return `ICR ≥ ${icr[1]}`;
  const lvr = text.match(/LVR[^\n.]{0,40}([\d.]+\s*%)/i);
  if (lvr) return `LVR ≤ ${lvr[1]}`;
  const dscr = text.match(/DSCR[^\n.]{0,40}([\d.]+\s*x?)/i);
  if (dscr) return `DSCR ≥ ${dscr[1]}`;
  const rev = text.match(/(minimum|net)[^\n.]{0,60}\$\s?([\d,]+)/i);
  if (rev) return `Minimum: $${rev[2]}`;
  return undefined;
}

function extractFrequency(text: string): string | undefined {
  if (/quarter/i.test(text)) return "Quarterly";
  if (/month/i.test(text)) return "Monthly";
  if (/annual|yearly/i.test(text)) return "Annually";
  if (/half[- ]year|semi[- ]annual/i.test(text)) return "Half-yearly";
  return undefined;
}

// ====================================================================
// Cross-default map
// ====================================================================

export function computeCrossDefaultMap(
  bundle: BankDocsExtractionBundle,
): CrossDefaultMap | undefined {
  const xdEvents = bundle.defaultAndEnforcement.defaultEvents.filter(
    (e) => e.isCrossDefault,
  );
  const xdProvisions = bundle.provisions.filter(
    (p) => p.focusArea === "cross_default",
  );
  if (xdEvents.length === 0 && xdProvisions.length === 0) {
    return CrossDefaultMapSchema.parse({
      hasCrossDefault: false,
      affectedFacilities: [],
      groupCompanyImpact: false,
      borrowerSurprises: [],
    });
  }

  const surprises: string[] = [];
  if (xdEvents.length > 0) {
    surprises.push(
      `${xdEvents.length} cross-default event${xdEvents.length === 1 ? "" : "s"} detected — default on any other facility with the same lender (or any related lender) will trip this loan.`,
    );
  }
  // Heuristic: scan clause text for "any other facility", "related entity", "group"
  const text = xdProvisions.map((p) => p.fullText).join(" ");
  if (/group|related entity|associated|holding company|subsidiary/i.test(text)) {
    surprises.push(
      "Cross-default extends to related entities / group companies — a default by an affiliated borrower can trigger this facility.",
    );
  }
  if (/any [\w ]+ facility|any other agreement|any indebtedness/i.test(text)) {
    surprises.push(
      "Cross-default extends to any indebtedness with this lender or any other financier — including credit cards, guarantees, leases.",
    );
  }
  const hasGroup = /group|related entity|associated|holding company|subsidiary/i.test(text);

  return CrossDefaultMapSchema.parse({
    hasCrossDefault: true,
    description:
      xdProvisions.length > 0
        ? xdProvisions.map((p) => `Cl ${p.number}`).join(", ")
        : "Cross-default event(s) listed in events of default schedule",
    affectedFacilities:
      xdProvisions.length > 0
        ? ["This facility", "Any other facility caught by the cross-default clause"]
        : ["This facility"],
    groupCompanyImpact: hasGroup,
    borrowerSurprises: surprises,
  });
}

// ====================================================================
// Regulatory hooks (deterministic — based on classification)
// ====================================================================

export function computeRegulatoryHooks(
  bundle: BankDocsExtractionBundle,
): RegulatoryHook[] {
  const out: RegulatoryHook[] = [];
  const c = bundle.classification;

  // AFCA EDR — almost always available for retail / SME borrowers
  out.push(
    RegulatoryHookSchema.parse({
      regime: "afca_external_dispute_resolution",
      description:
        "AFCA — Australian Financial Complaints Authority — external dispute resolution scheme open to consumers and small businesses. AFCA can investigate, conciliate, and make binding determinations up to monetary limits.",
      borrowerAvailable: c.isConsumerCredit || c.isUnfairContractTermsRegime,
      howToInvoke:
        "Lodge complaint at https://www.afca.org.au/. Lender must engage with AFCA process. Limitation period generally 6 years from the act / 2 years from internal complaint response.",
    }),
  );

  // NCC hardship notice
  if (c.isConsumerCredit) {
    out.push(
      RegulatoryHookSchema.parse({
        regime: "ncc_hardship_notice",
        description:
          "Hardship notice under NCC ss 72–73 — borrower can apply to vary the contract on grounds of hardship. Lender must respond within 21 days and may not commence enforcement during the hardship process.",
        borrowerAvailable: true,
        howToInvoke:
          "Provide written hardship notice citing NCC s 72. Lender must consider variation; refusal must be by notice in writing with reasons. AFCA reviewable.",
      }),
    );
  }

  // Banking Code of Practice 2025
  out.push(
    RegulatoryHookSchema.parse({
      regime: "code_of_banking_practice_2025",
      description:
        "Banking Code of Practice 2025 (administered by ABA) binds subscribing banks to additional obligations: prompt error correction, accessible terms, fair dealing with vulnerable customers, third-party guarantee protections (Pt 4).",
      borrowerAvailable: true,
      howToInvoke:
        "Cite the Code clause in correspondence. AFCA will treat Code breaches as relevant to good-industry-practice findings.",
    }),
  );

  // Small business lending code (subset of CBP)
  if (
    c.isUnfairContractTermsRegime &&
    !c.isConsumerCredit
  ) {
    out.push(
      RegulatoryHookSchema.parse({
        regime: "small_business_lending_code",
        description:
          "Small Business chapter of the Banking Code (Pt 5) — capped pricing reviews, limited financial-covenant testing, prohibition of non-monetary covenants below specified facility limits.",
        borrowerAvailable: true,
        howToInvoke:
          "Confirm bank is a Code subscriber. Cite Code Pt 5 in any covenant-trigger or repricing dispute.",
      }),
    );
  }

  // ACL UCT (already handled in unenforceability findings, but worth listing as a hook)
  if (c.isUnfairContractTermsRegime) {
    out.push(
      RegulatoryHookSchema.parse({
        regime: "asic_banking_code",
        description:
          "ACL Pt 2-3 unfair contract terms — ASIC has direct enforcement power; civil penalties available since Nov 2023 (per Treasury Laws Amendment (More Competition, Better Prices) Act 2022). Court can declare a term unfair and void it, plus impose pecuniary penalty.",
        borrowerAvailable: true,
        howToInvoke:
          "Notify ASIC; or raise UCT in defence to enforcement. The unfairness test under s 24 ACL: significant imbalance + not reasonably necessary + would cause detriment.",
      }),
    );
  }

  return out;
}

// ====================================================================
// Pass 6 entrypoint
// ====================================================================

export interface BankDocsCapabilitySynthOptions {
  bundle: BankDocsExtractionBundle;
  onProgress?: (msg: string) => void;
}

export interface BankDocsCapabilitySynthResult {
  repaymentScenarios: RepaymentScenario[];
  feeLadder: FeeLadderRow[];
  covenants: CovenantSummary[];
  crossDefault?: CrossDefaultMap;
  regulatoryHooks: RegulatoryHook[];
}

export async function synthesiseBankDocsCapabilities(
  opts: BankDocsCapabilitySynthOptions,
): Promise<BankDocsCapabilitySynthResult> {
  const { bundle, onProgress } = opts;
  onProgress?.("Computing repayment scenarios, fee ladder, covenants, cross-default map, regulatory hooks…");

  const repaymentScenarios = computeRepaymentScenarios(bundle);
  const feeLadder = computeFeeLadder(bundle);
  const covenants = computeCovenantDashboard(bundle);
  const crossDefault = computeCrossDefaultMap(bundle);
  const regulatoryHooks = computeRegulatoryHooks(bundle);

  onProgress?.(
    `Synthesis: ${repaymentScenarios.length} scenarios · ${feeLadder.length} fee scenarios · ${covenants.length} covenants · cross-default ${crossDefault?.hasCrossDefault ? "YES" : "no"} · ${regulatoryHooks.length} regulatory hooks`,
  );

  return {
    repaymentScenarios,
    feeLadder,
    covenants,
    crossDefault,
    regulatoryHooks,
  };
}
