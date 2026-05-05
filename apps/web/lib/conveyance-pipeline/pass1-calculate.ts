import type {
  AdjustmentLine,
  Money,
  RatesAdjustmentInput,
  SettlementCalculation,
  SettlementInput,
  StampDutyCalculation,
  StampDutyInput,
} from "@law/schema";

const aud = (n: number): Money => ({
  amount: Math.round(n * 100) / 100,
  currency: "AUD",
});

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T00:00:00Z").getTime();
  const b = new Date(bIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Pro-rata an annual amount between vendor and purchaser around the
 * adjustment date. Vendor is responsible up to and INCLUDING the adjustment
 * date; purchaser is responsible from the day after.
 *
 * daysVendor = (adjustmentDate - periodStart) + 1 (inclusive of both ends)
 * daysPurchaser = totalDays - daysVendor
 *
 * If the vendor has paid the full annual, the purchaser owes the vendor
 * vendor for the purchaser's share. If the vendor has not paid, the purchaser
 * keeps that portion (vendor receives less at settlement).
 */
function proRata(args: {
  description: string;
  basis: AdjustmentLine["basis"];
  rates: RatesAdjustmentInput;
  adjustmentDate: string;
  citations: AdjustmentLine["citations"];
}): AdjustmentLine {
  const totalDays = daysBetween(args.rates.periodStart, args.rates.periodEnd) + 1;
  const daysVendor = daysBetween(args.rates.periodStart, args.adjustmentDate) + 1;
  const daysPurchaser = totalDays - daysVendor;
  const annual = args.rates.annualAmount.amount;
  const purchaserShare = (annual * daysPurchaser) / totalDays;
  const paidByVendor = args.rates.amountPaidByVendor.amount;

  // If vendor paid more than their share, purchaser owes vendor the surplus.
  // If vendor paid less than their share, vendor owes purchaser the shortfall.
  // i.e. adjustment in vendor's favour = paidByVendor - vendorShare = paidByVendor - (annual - purchaserShare)
  const vendorShare = annual - purchaserShare;
  const netToVendor = paidByVendor - vendorShare;
  // From purchaser's perspective: if netToVendor > 0, purchaser pays vendor (debit).
  // if netToVendor < 0, vendor pays purchaser (credit).
  const side: "debit" | "credit" = netToVendor >= 0 ? "debit" : "credit";

  return {
    description: args.description,
    basis: args.basis,
    side,
    amount: aud(Math.abs(netToVendor)),
    daysVendor,
    daysPurchaser,
    totalDays,
    citations: args.citations,
    note: `Annual $${annual.toFixed(2)} · vendor share $${vendorShare.toFixed(2)} · purchaser share $${purchaserShare.toFixed(2)} · vendor paid $${paidByVendor.toFixed(2)} · ${side === "debit" ? "purchaser pays vendor" : "vendor pays purchaser"} $${Math.abs(netToVendor).toFixed(2)}`,
  };
}

/**
 * Victorian transfer duty under Duties Act 2000 (Vic), 2024-2025 thresholds:
 *
 *   $0 - $25,000           : 1.4%
 *   $25,001 - $130,000     : $350 + 2.4% of excess over $25,000
 *   $130,001 - $960,000    : $2,870 + 6% of excess over $130,000
 *   $960,001 - $2,000,000  : 5.5% flat (no PPR concession beyond)
 *   $2,000,001+            : $110,000 + 6.5% of excess over $2m
 *
 * PPR concession (residence) reduces duty further if dutiable value <= $550,000.
 * FHB exemption full <= $600,000; tapered to $750,000.
 * Foreign purchaser additional duty: 8% of dutiable value (residential).
 */
function calcBaseDuty(value: number): number {
  if (value <= 0) return 0;
  if (value <= 25_000) return value * 0.014;
  if (value <= 130_000) return 350 + (value - 25_000) * 0.024;
  if (value <= 960_000) return 2870 + (value - 130_000) * 0.06;
  if (value <= 2_000_000) return value * 0.055;
  return 110_000 + (value - 2_000_000) * 0.065;
}

function calcFhbExemption(value: number, baseDuty: number): number {
  // Full exemption to $600k, taper to $750k.
  if (value <= 600_000) return baseDuty;
  if (value > 750_000) return 0;
  // Linear taper between 600k and 750k.
  const portion = (750_000 - value) / 150_000; // 1.0 at 600k, 0.0 at 750k
  return baseDuty * portion;
}

function calcPprConcession(value: number, baseDuty: number): number {
  // PPR concession applies when dutiable value <= $550k for purchaser to occupy
  // as PPR — sliding scale that takes about 50% off at lower bands. Simplified
  // approximation: 50% of base duty when <= $130k, tapering linearly to 0 at $550k.
  if (value > 550_000) return 0;
  if (value <= 130_000) return baseDuty * 0.5;
  const taper = (550_000 - value) / 420_000; // 1 at 130k, 0 at 550k
  return baseDuty * 0.5 * taper;
}

function computeStampDuty(
  contractPrice: number,
  input: StampDutyInput,
): StampDutyCalculation {
  const dutiableValue = contractPrice;
  const baseDuty = calcBaseDuty(dutiableValue);
  const notes: string[] = [
    `Base duty under Duties Act 2000 (Vic) on $${dutiableValue.toFixed(2)} = $${baseDuty.toFixed(2)}.`,
  ];

  let pprConcession = 0;
  if (input.isPpr && dutiableValue <= 550_000) {
    pprConcession = calcPprConcession(dutiableValue, baseDuty);
    notes.push(`PPR concession (s 57J) approx $${pprConcession.toFixed(2)}.`);
  }

  let fhbConcession = 0;
  if (input.isFirstHomeBuyer && dutiableValue <= 750_000) {
    // FHB sits on top of PPR — full exemption when eligible.
    fhbConcession = calcFhbExemption(dutiableValue, baseDuty - pprConcession);
    notes.push(
      `First Home Buyer (Pt 5 Div 4A) ${dutiableValue <= 600_000 ? "full exemption" : "tapered concession"} $${fhbConcession.toFixed(2)}.`,
    );
  }

  let offThePlanConcession = 0;
  if (input.isOffThePlan && input.isPpr) {
    // Off-the-plan concession (s 21) is calculated on dutiable-value AFTER
    // construction-cost deduction. We can't compute precisely without the cost
    // breakdown — flag for manual.
    notes.push(
      "Off-the-plan concession (s 21) requires construction-cost split — manual review.",
    );
  }

  let pensionerConcession = 0;
  if (input.pensionerConcession && dutiableValue <= 750_000) {
    // Up to $750k for eligible pensioners; full to $330k, taper to $750k.
    if (dutiableValue <= 330_000) pensionerConcession = baseDuty;
    else {
      pensionerConcession = baseDuty * Math.max(0, (750_000 - dutiableValue) / 420_000);
    }
    notes.push(`Pensioner concession (s 60A) $${pensionerConcession.toFixed(2)}.`);
  }

  let foreignPurchaserAdditional = 0;
  if (input.isForeignPurchaser) {
    foreignPurchaserAdditional = dutiableValue * 0.08;
    notes.push(
      `Foreign Purchaser Additional Duty (s 28A) 8% of $${dutiableValue.toFixed(2)} = $${foreignPurchaserAdditional.toFixed(2)}.`,
    );
  }

  // Concessions stack but never go below zero.
  const totalConcessions =
    pprConcession + fhbConcession + offThePlanConcession + pensionerConcession;
  const dutyAfterConcessions = Math.max(0, baseDuty - totalConcessions);
  const totalDutyPayable = dutyAfterConcessions + foreignPurchaserAdditional;

  return {
    dutiableValue: aud(dutiableValue),
    baseDuty: aud(baseDuty),
    pprConcession: pprConcession > 0 ? aud(pprConcession) : undefined,
    fhbConcession: fhbConcession > 0 ? aud(fhbConcession) : undefined,
    offThePlanConcession:
      offThePlanConcession > 0 ? aud(offThePlanConcession) : undefined,
    pensionerConcession:
      pensionerConcession > 0 ? aud(pensionerConcession) : undefined,
    foreignPurchaserAdditional:
      foreignPurchaserAdditional > 0 ? aud(foreignPurchaserAdditional) : undefined,
    totalDutyPayable: aud(totalDutyPayable),
    workingNotes: notes,
  };
}

export function calculateSettlement(input: SettlementInput): SettlementCalculation {
  const adjustments: AdjustmentLine[] = [];

  // Deposit credit (purchaser already paid):
  adjustments.push({
    description: `Deposit paid on ${input.contractDate}`,
    basis: "deposit",
    side: "credit",
    amount: input.depositPaid,
    citations: [],
    note: "Reduces balance owed at settlement.",
  });

  if (input.councilRates) {
    adjustments.push(
      proRata({
        description: `Council rates — ${input.councilRates.authority}`,
        basis: "council_rates",
        rates: input.councilRates,
        adjustmentDate: input.adjustmentDate,
        citations: [
          { act: "Local Government Act 1989 (Vic)", section: "general rating" },
        ],
      }),
    );
  }
  if (input.waterRates) {
    adjustments.push(
      proRata({
        description: `Water service charges — ${input.waterRates.authority}`,
        basis: "water_rates",
        rates: input.waterRates,
        adjustmentDate: input.adjustmentDate,
        citations: [{ act: "Water Act 1989 (Vic)", section: "general" }],
      }),
    );
  }
  if (input.waterUsage) {
    adjustments.push({
      description: "Water usage to settlement (special meter read)",
      basis: "water_usage",
      side: "debit",
      amount: input.waterUsage,
      citations: [{ act: "Water Act 1989 (Vic)", section: "usage" }],
      note: "Vendor's usage to settlement, paid by purchaser.",
    });
  }
  if (input.ownersCorpFees) {
    adjustments.push(
      proRata({
        description: `Owners corporation fees — ${input.ownersCorpFees.ownersCorpName}`,
        basis: "owners_corp_fees",
        rates: {
          authority: input.ownersCorpFees.ownersCorpName,
          annualAmount: input.ownersCorpFees.annualAmount,
          periodStart: input.ownersCorpFees.periodStart,
          periodEnd: input.ownersCorpFees.periodEnd,
          amountPaidByVendor: input.ownersCorpFees.amountPaidByVendor,
        },
        adjustmentDate: input.adjustmentDate,
        citations: [{ act: "Owners Corporations Act 2006 (Vic)", section: "23" }],
      }),
    );
    if (input.ownersCorpFees.specialLevyOutstanding) {
      adjustments.push({
        description: "Owners corp special levy (outstanding)",
        basis: "owners_corp_special_levy",
        side: "debit",
        amount: input.ownersCorpFees.specialLevyOutstanding,
        citations: [{ act: "Owners Corporations Act 2006 (Vic)", section: "23" }],
        note: "Subject to s 32 disclosure — confirm liability.",
      });
    }
  }
  if (input.landTax) {
    const lt = input.landTax;
    const totalDays = daysBetween(lt.yearStart, lt.yearEnd) + 1;
    const daysVendor = daysBetween(lt.yearStart, input.adjustmentDate) + 1;
    const daysPurchaser = totalDays - daysVendor;
    const purchaserShare = (lt.vendorAssessedAmount.amount * daysPurchaser) / totalDays;
    adjustments.push({
      description: "Land tax — apportionment to settlement",
      basis: "land_tax",
      side: "debit",
      amount: aud(purchaserShare),
      daysVendor,
      daysPurchaser,
      totalDays,
      citations: [
        { act: "Land Tax Act 2005 (Vic)", section: "96" },
        { act: "Sale of Land Act 1962 (Vic)", section: "10G" },
      ],
      note:
        "Apportionment may be prohibited under s 10G Sale of Land Act 1962 for residential contracts under $10m. Confirm contract permits.",
    });
  }
  if (input.releaseOfMortgageFee) {
    adjustments.push({
      description: "Release of mortgage fee",
      basis: "release_of_mortgage_fee",
      side: "debit",
      amount: input.releaseOfMortgageFee,
      citations: [],
    });
  }
  if (input.registrationFee) {
    adjustments.push({
      description: "Registration of transfer fee (Land Use Victoria)",
      basis: "registration_fee",
      side: "debit",
      amount: input.registrationFee,
      citations: [{ act: "Transfer of Land Act 1958 (Vic)", section: "registration" }],
    });
  }
  if (input.pexaSettlementFee) {
    adjustments.push({
      description: "PEXA settlement fee",
      basis: "pexa_fee",
      side: "debit",
      amount: input.pexaSettlementFee,
      citations: [],
    });
  }
  for (const d of input.otherDebits) {
    adjustments.push({
      description: d.description,
      basis: "other",
      side: "debit",
      amount: d.amount,
      citations: [],
    });
  }
  for (const c of input.otherCredits) {
    adjustments.push({
      description: c.description,
      basis: "other",
      side: "credit",
      amount: c.amount,
      citations: [],
    });
  }

  const balanceOfPurchasePrice =
    input.contractPrice.amount - input.depositPaid.amount;
  const debits = adjustments
    .filter((a) => a.side === "debit")
    .reduce((s, a) => s + a.amount.amount, 0);
  const credits = adjustments
    .filter((a) => a.side === "credit" && a.basis !== "deposit")
    .reduce((s, a) => s + a.amount.amount, 0);

  // Total at settlement = balance of price + debits - non-deposit credits.
  // (deposit is excluded because balanceOfPurchasePrice already nets it out.)
  const totalAtSettlement = balanceOfPurchasePrice + debits - credits;

  const stampDuty = computeStampDuty(input.contractPrice.amount, input.stampDuty);

  return {
    contractPrice: input.contractPrice,
    depositPaid: input.depositPaid,
    balanceOfPurchasePrice: aud(balanceOfPurchasePrice),
    adjustments,
    netDebits: aud(debits),
    netCredits: aud(credits),
    totalAtSettlement: aud(totalAtSettlement),
    stampDuty,
  };
}
