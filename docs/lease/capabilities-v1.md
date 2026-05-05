# Leasing AI — v1 Analytical Capabilities

**Linear:** PRJ-693
**Status:** v1 capability scope (refinement expected)
**Source:** Josh, iMessage 30 Apr 2026
**Jurisdiction:** Victoria
**Tenant-protective lens** — output flags risks, quantifies exposures, surfaces landlord non-compliance that may render tenant payment obligations unenforceable.

This spec maps each capability to:
- **Definition** — what the AI must do
- **Inputs** — extraction fields it depends on
- **Sources** — legislation / external data
- **Output** — schema (existing or new in `@law/schema`)
- **Pipeline pass** — where it runs in the 5-pass flow
- **v1 scope** — included / partial / deferred
- **Open questions**

The 5-pass pipeline (from `stack_decision.md`):
1. **Classify** → 2. **Extract** → 3. **Compliance** → 4. **Risk** → 5. **Compose letter**

---

## 1. Retail Leases Act coverage analysis

**Definition.** Determine whether the lease is a "retail premises lease" under RLA 2003 (Vic) s4 and whether the Act's protections apply (s11). If excluded, identify the specific section/ministerial order driving the carve-out.

**Inputs.** `LeaseItems.permittedUse`, `LeaseItems.parties` (tenant entity type), `LeaseItems.commencingRent` + outgoings (occupancy cost test under s4(2)(a) + reg), tenancy structure.

**Sources.** RLA 2003 (Vic) ss3, 4, 5, 11; Retail Leases Regulations 2023; ministerial determinations under s5 (e.g. 1 May 2003 determination, 2013 wholesale exclusion). Corpus: `retail-leases-act-2003.md`.

**Output.** `LeaseClassificationSchema` — `kind`, `rlaApplies`, `excludedReason`. **Already implemented.**

**Pipeline pass.** Pass 1 (classify) — drives whether Pass 3 (RLA compliance) runs.

**v1 scope.** ✅ Included — already in schema. Need: ministerial-determination lookup table.

**Open questions.**
- Occupancy-cost threshold (currently $1M) — drive from regulation, not hard-coded.
- Listed-corporation exclusion (s4(2)(c)) — confirm extraction of tenant ASX/foreign-listed status.

---

## 2. Make-good cost estimation

**Definition.** Estimate end-of-lease make-good cost based on fit-out and premises type. Provide links/contacts to quantity surveyors who can produce formal estimates.

**Inputs.** `MakeGoodAssessment.quotedText`, `MakeGoodAssessment.severityRating` (light / moderate / heavy / bare_shell), `LeaseItems.premisesDescription`, term length, outgoing fit-out.

**Sources.** Internal cost-band table (per m² × severity × premises type). External: PRD-pluggable QS contact list.

**Output.** Extend `MakeGoodAssessmentSchema` with `costEstimateLow`, `costEstimateHigh`, `basis`, `qsReferrals`. **Schema gap — see `lease.ts` extension below.**

**Pipeline pass.** Pass 4 (risk) — after fit-out and premises extraction.

**v1 scope.** 🟡 Partial — emit a banded estimate ("light: $5–15k, moderate: $20–60k, heavy: $80k+, bare-shell: brief a QS"). Defer precise per-m² model until we have real QS data.

**Open questions.**
- QS referral partners — Josh to provide contact list.
- Whether to differentiate retail vs office vs warehouse fit-out classes (likely yes).

---

## 3. Permitted use & planning compliance

**Definition.** Confirm whether council permits are required and whether the permitted use is allowed under the planning scheme. Source: free Planning Property Report (planning.vic.gov.au) and underlying overlays.

**Inputs.** `LeaseItems.premisesAddress`, `LeaseItems.permittedUse`, `LeaseItems.liquorLicenceRequired`.

**Sources.**
- VicPlan Planning Property Report (free, address-keyed) — `https://mapshare.vic.gov.au/vicplan/`
- Victoria Planning Provisions (zone tables — Use Tables for Sec 1/2/3)
- Liquor Control Reform Act 1998 (Vic) for licence trigger.

**Output.** New `PlanningComplianceSchema` (see `lease.ts` extension):
```ts
{
  zone: string,                  // e.g. "Commercial 1 Zone (C1Z)"
  overlays: string[],            // e.g. ["HO123", "DDO5"]
  permittedUseAllowed: "as_of_right" | "permit_required" | "prohibited" | "unknown",
  permitTriggers: string[],      // e.g. ["liquor licence", "extended trading hours", "signage"]
  reportUrl: string,             // link to generated VicPlan report
  concerns: string[],
}
```

**Pipeline pass.** Pass 4 (risk) — after items extracted; needs network call to VicPlan.

**v1 scope.** 🟡 Partial — fetch zone + overlays from VicPlan; flag known permit triggers via keyword rules. Defer full Sec 1/2/3 use-table cross-reference (large data set; v2).

**Open questions.**
- VicPlan PDF report scraping vs API — confirm a stable endpoint.
- Caching strategy (planning reports change with amendments; cache 30 days).

---

## 4. Market rent review projections

**Definition.** Project likely market-review rent at the commencement of each further term.

**Inputs.** `LeaseItems.commencingRent`, `RentReview` (method, frequency, ratchet), `LeaseItems.optionTerms`, `LeaseItems.termYears`.

**Sources.** RLA 2003 s37 (market-rent determination by specialist retail valuer). Externally: comparable-rent benchmarks (defer to v2 — needs data feed).

**Output.** New `MarketReviewProjectionSchema`:
```ts
{
  optionTermLabel: string,       // e.g. "First further term — yr 6"
  projectedDate: string,
  baselineRent: Money,
  projectedRangeLow: Money,
  projectedRangeHigh: Money,
  basis: "cpi_extrapolation" | "fixed_uplift_compounded" | "market_band" | "insufficient_data",
  notes: string,
}
```

**Pipeline pass.** Pass 4 (risk).

**v1 scope.** 🟡 Partial — for fixed-percent / CPI / fixed-amount reviews, deterministic projection. For *market* reviews, surface the s37 process and flag risk band only ("expect 5–25% step at market review; recommend valuation budget"). Real comparables → v2.

**Open questions.**
- Whether to integrate any rent-data API in v1 (probably not — too noisy, cost).
- CPI series choice — Melbourne All-Groups quarterly is the common contractual reference.

---

## 5. Landlord non-compliance → unenforceability ⭐ DIFFERENTIATOR

**Definition.** Identify breaches by the landlord of the RLA 2003 (Vic) that render specific tenant payment obligations void or unenforceable. Output: per-payment-obligation analysis with the *exact* clause(s) of the lease that are void or unenforceable, the legislative section that voids them, and the dollar amount the tenant may be entitled to recover or withhold.

This is the highest-value capability per Josh ("very very gold"). Should be scoped first.

### What "unenforceability" means here

The RLA 2003 contains a dense set of provisions that **void specific lease terms** or **remove the tenant's liability** to pay where the landlord has not complied. The AI must enumerate every such provision, map it to detection signals in the lease and surrounding facts, and output a finding per match.

### Statutory unenforceability triggers (v1 corpus)

| # | Trigger (RLA 2003 s) | Landlord failure | Effect on tenant payment |
|---|----|---|---|
| 5.1 | s17(3) | No disclosure statement given ≥14 days before lease entered | Tenant may withhold rent until disclosure given; not liable for rent in that period; right of termination |
| 5.2 | s17(5)–(6) | Disclosure misleading / false / materially incomplete OR no proposed lease provided | Right of termination within 28 days |
| 5.3 | s23(2) | Landlord sought / accepted key-money or goodwill payment | Lease provision void; tenant may recover the payment as a debt |
| 5.4 | s35(3), (6) | Rent-review provision purports to prevent rent reduction (where method is market/index), OR review provision does not specify how the review is to be made | Provision void; rent determined by SBC-appointed valuer (s35(7)) |
| 5.5 | s39(1) | Lease does not specify outgoings recoverable / how determined / how recovered | Tenant not liable for outgoings except per a compliant clause |
| 5.6 | s40(1) | Outgoing in shopping centre does not benefit tenant's premises | Not liable to contribute |
| 5.7 | s41(1) | Lease requires tenant to pay capital costs of the building / centre / plant | Provision void |
| 5.8 | s46(4) | No written estimate of outgoings given before lease + ≥1 month before each accounting period | **Tenant not liable to contribute to outgoings until estimate given** — high-value finding |
| 5.9 | s47 (statement of outgoings) | No annual statement of outgoings within 3 months of accounting period end (audit requirements per s48) | Tenant may withhold contributions until statement provided |
| 5.10 | s50(1) | Lease makes tenant liable for landlord's land tax or C&I property tax | Provision void |
| 5.11 | s51(1) | Lease requires tenant to pay landlord's lease-prep / negotiation / mortgagee-consent / RLA-compliance legal costs | Not recoverable from tenant |
| 5.12 | s52(5) | Tenant carried out urgent repairs landlord was responsible for after notice; landlord not reimbursing | Landlord liable to reimburse; cost not recoverable as outgoing |
| 5.13 | s56 | Demolition termination without 6 months' notice + genuine proposal | Termination ineffective; compensation payable |
| 5.14 | s94 | Any lease provision contrary to / inconsistent with the Act, OR purporting to exclude application of the Act | Void to that extent |

### Output schema

New `UnenforceabilityFindingSchema` (added to `lease.ts`):
```ts
{
  ruleId: string,                  // "RLA-s46-no-outgoings-estimate"
  trigger: { act: "Retail Leases Act 2003 (Vic)", section: string },
  landlordFailure: string,         // one-line description of the breach
  detectionSignals: string[],      // facts in extraction that matched
  affectedClauses: string[],       // lease clause numbers rendered void / unenforceable
  effect: "void" | "not_liable_until_remedied" | "right_to_recover" | "right_to_terminate" | "right_to_withhold",
  estimatedExposureAud: number | null,  // dollar amount tenant may recover/withhold (best-effort)
  evidence: string[],              // verbatim quotes
  remedyForTenant: string,         // plain-English next step
  citations: Citation[],           // act + section + url
  severity: Severity,
  confidence: number,              // 0..1
  needsLawyerConfirm: boolean,     // true for novel / ambiguous findings
}
```

### Detection approach

Implement as **YAML rules** under `apps/web/rules/lease/rla-unenforceability/*.yaml`, one rule per row in the table above. Each rule expresses:
- pre-conditions (e.g. `classification.rlaApplies == true`)
- detection logic (combination of extracted-fact predicates and clause-text patterns)
- evidence requirements
- output template

Pass 3 (compliance) loads the rule pack, evaluates each rule against the extraction bundle + raw lease text, and emits `UnenforceabilityFinding[]`.

For ambiguous cases (e.g. s39(1) "specifies in a manner consistent with regulations") rules emit `status: needs_review` with `needsLawyerConfirm: true`.

### v1 scope

✅ **Included — first-pass priority.**

Phase 1 (this ticket-cycle): rules 5.3, 5.7, 5.10, 5.11 — these are *bright-line voids* with pure-text detection (key-money clause, capital-costs clause, land-tax pass-through clause, landlord-cost-recovery clause). High signal, low ambiguity.

Phase 2: rules 5.1, 5.2, 5.5, 5.8, 5.9 — require *external facts* (was disclosure given? was estimate given?) which means the AI must surface them as **questions for the tenant client** in the letter, then evaluate when answers come in.

Phase 3 (defer): rules 5.4, 5.6, 5.12, 5.13, 5.14 — more interpretive.

### Open questions

- For Phase 2 rules, do we collect tenant-supplied facts inline (chat) or via a structured intake form? Recommend intake form: ESM, disclosure, prior estimates, repair history.
- Dollar exposure modelling — what assumptions do we expose to the lawyer? Recommend: show the calc, never hide it.
- Confidence threshold below which we suppress a finding entirely vs surface as "needs_review"? Default: 0.4.

---

## 6. Hidden / unquantified payment obligations

**Definition.** Surface every clause creating a tenant payment obligation with unspecified or unbounded cost. Most often buried in additional provisions (e.g. ESM obligations, landlord-discretion fees, "tenant to bear all costs of…").

**Inputs.** `AdditionalProvision[].fullText`, `LeaseItems.outgoingsDescription`, full lease text.

**Sources.** Pattern library — phrases that signal unquantified obligations ("at the tenant's cost", "as determined by the landlord", "all reasonable costs incurred"), plus ESM-specific patterns (Building Regulations 2018 ESM definition, RLA s52(8)).

**Output.** Refine `OngoingFinancialObligationsSchema` items with `quantified: boolean`, `triggerCondition: string`, `costCeilingAud: number | null`. **Schema extension below.**

**Pipeline pass.** Pass 2 (extract) emits raw provisions; Pass 4 (risk) flags unquantified ones with severity weighting.

**v1 scope.** ✅ Included — pattern library + LLM judgement; covered by existing `OngoingFinancialObligationsSchema` with the proposed refinement.

**Open questions.**
- ESM obligations — recommend always emit a *separate* finding, not just a generic unquantified flag, given the case law exposure.

---

## 7. Landlord notification obligations

**Definition.** Map every notification obligation the landlord owes the tenant across the lease term (statutory + contractual), with timing.

**Inputs.** Full lease text + `RentReview` + `optionTerms`.

**Sources (statutory).**
- s17 — disclosure statement (≥14 days pre-lease)
- s28(1A) — option-to-renew letter (≥3 months before option expiry; rent + cooling-off + disclosure changes)
- s35(5) — rent review timing
- s46(3)(b) — outgoings estimate (≥1 month before each accounting period)
- s47 — outgoings statement (annual)
- s56(2)(b) — demolition (≥6 months)
- s64 — relocation (≥3 months)
- Land Tax Act 2005 / C&I Property Tax Reform Act 2024 — land tax notices (s121 RLA)

**Sources (contractual).** Extracted notification clauses in the lease.

**Output.** New `LandlordNotificationObligationSchema`:
```ts
{
  source: "statutory" | "contractual",
  description: string,
  citation?: Citation,
  timing: string,                  // e.g. "≥3 months before option expiry"
  earliestDate?: string,
  latestDate?: string,
  consequenceOfFailure: string,    // pulled from statute / clause
  status: "upcoming" | "overdue" | "complete" | "unknown",
}
```

**Pipeline pass.** Pass 4 (risk).

**v1 scope.** ✅ Included for the statutory list above. Contractual extraction is best-effort.

**Open questions.**
- Do we generate calendar reminders for the tenant? Out of scope for v1 (LAW is review tool, not lifecycle tool) — note the obligations in the letter only.

---

## 8. Option exercise risk & timeline analysis

**Definition.** Identify risks and timelines for exercising options for further terms, from both tenant and landlord perspectives.

**Inputs.** `LeaseItems.optionTerms`, `LeaseItems.commencementDate`, `LeaseItems.termYears`, the option clause verbatim.

**Sources.** RLA s28 (option notice obligation), s28A (early rent review), s28B (cooling-off), s27 (option-not-to-be-onerous principle in case law).

**Output.** New `OptionExerciseAnalysisSchema`:
```ts
{
  optionLabel: string,
  exerciseWindowOpens: string,     // ISO date
  exerciseWindowCloses: string,    // ISO date
  exerciseMethod: string,          // verbatim from clause
  conditionsToExercise: string[],  // e.g. ["no breach", "tenant has paid all rent"]
  tenantRisks: string[],           // e.g. ["onerous notice form", "no break right post-exercise"]
  landlordRisks: string[],         // e.g. ["s28(1A) notice not given → window extends 3 months from notice"]
  s28EarlyReviewAvailable: boolean,
  s28BCoolingOffAvailable: boolean,
}
```

**Pipeline pass.** Pass 4 (risk).

**v1 scope.** ✅ Included.

**Open questions.**
- Treat "options to renew" vs "rights of first refusal" separately — the AI must not confuse them.

---

## 9. LIV lease version identification & version-delta risk analysis

**Definition.** Detect whether the lease is a Law Institute of Victoria standard form. Identify the version. Diff against the current version (and adjacent prior version) and surface the risks introduced/removed for tenant and landlord by the version under review.

**Inputs.** Full lease text — header markers, clause-numbering style, characteristic LIV phrasing.

**Sources.** LIV Standard Commercial Lease forms — versions 2009, 2013, 2017, 2023. Stored as reference texts under `packages/legislation/corpus/liv-leases/<version>.md` (v1 minimum: 2017 + 2023, since 2023 is current per memory `prj663_lease_module.md`).

**Output.** New `LivVersionAnalysisSchema`:
```ts
{
  isLiv: boolean,
  detectedVersion?: "2009" | "2013" | "2017" | "2023" | "unknown",
  confidence: number,
  comparisonAgainst: "2023",
  deltas: Array<{
    clauseRef: string,
    delta: "added" | "removed" | "modified",
    summary: string,
    tenantImpact: "favourable" | "adverse" | "neutral",
    landlordImpact: "favourable" | "adverse" | "neutral",
  }>,
}
```

**Pipeline pass.** Pass 1 (classify) — sets `detectedVersion`; Pass 4 (risk) — produces deltas.

**v1 scope.** 🟡 Partial — version *detection* in v1; full delta analysis requires the corpus to be populated. Mark detection as v1, deltas as v1.5.

**Open questions.**
- Sourcing prior LIV forms — Josh has a set; need to confirm distribution is permitted (LIV-licensed).
- Bespoke leases that *adapt* a LIV form — should we still attempt deltas? Yes, on a clause-by-clause best-effort basis.

---

## 10. Sam Hopper barrister article cross-reference

**Definition.** Index Sam Hopper's articles (samhopper.com.au and any other public archive). For each, extract the risk(s) raised. At review time, match the lease's facts against Sam Hopper's catalogued risks and surface the biggest landlord-side and tenant-side exposure for each match.

**Inputs.** Whole-lease facts.

**Sources.**
- `https://samhopper.com.au/articles/` and `/cases/` archives
- Articles ingested into the RAG corpus under `packages/legislation/corpus/commentary/sam-hopper/<slug>.md` with structured front-matter:
  ```yaml
  ---
  source: Sam Hopper Barrister
  url: ...
  date: ...
  topics: [outgoings, options, rent_review, ...]
  riskSummary: One-paragraph risk summary
  ---
  ```

**Output.** New `CommentaryRiskFindingSchema`:
```ts
{
  source: "Sam Hopper" | "other",
  articleTitle: string,
  articleUrl: string,
  riskSummary: string,
  matchReason: string,
  biggestRiskTenant: string,
  biggestRiskLandlord: string,
  citations: Citation[],
}
```

**Pipeline pass.** Pass 4 (risk).

**v1 scope.** 🟡 Partial — ingest the top 20 most-cited articles by topic in v1. Full archive coverage v1.5.

**Open questions.**
- Robots / TOS check on samhopper.com.au — confirm reuse permitted (cite + link, don't reproduce). Likely fine for short quotations + link.
- Other commentators worth indexing? Recommend: Robert Hay KC, Croxon Ramsay updates — out of scope for v1.

---

## 11. Transfer of lease — chain document review

**Definition.** When the matter is a *transfer* (assignment) of lease, identify all documents needed to review the entire lease chain. Number them in order. Flag any inconsistencies between documents in the chain.

**Inputs.** Document set uploaded by user; `Pass 1 classify` should grow `lease_assignment` and `lease_variation` document kinds.

**Sources.** RLA 2003 ss60–66 (assignment process — disclosure to assignee, landlord consent, release of assignor).

**Output.** New `LeaseChainAnalysisSchema`:
```ts
{
  chainComplete: boolean,
  documents: Array<{
    order: number,
    kind: "head_lease" | "variation" | "renewal" | "deed_of_assignment" | "deed_of_consent" | "assignor_disclosure" | "other",
    date: string,
    parties: string[],
    sourceFilename: string,
    summary: string,
  }>,
  missingDocuments: string[],      // e.g. ["assignor disclosure statement under s61"]
  inconsistencies: Array<{
    description: string,
    documentRefs: string[],        // filenames involved
    severity: Severity,
  }>,
}
```

**Pipeline pass.** New optional Pass 1.5 (chain) — runs only when ≥2 lease-related documents detected and `matterType: "transfer"`.

**v1 scope.** 🟡 Partial — detect chain, list documents in order, flag missing assignor-disclosure under s61. Inconsistency detection is best-effort using LLM diff.

**Open questions.**
- UX for matter type — is this user-supplied at upload, or inferred? Recommend: user picks "new lease / renewal / transfer / variation" at upload, with inference fallback.

---

## Cross-cutting requirements

### Tone of proposed amendments
**Polite but firm** (per `prj663_lease_module.md`). Apply to every amendment string emitted by capabilities 5–11.

### Top-3 tenant-burn focus areas (per memory)
1. Ongoing financial obligations (capability 6 + parts of 5)
2. Excessive make-good (capability 2 + 5)
3. Excessive outgoings (capability 5.5–5.8 + 6)

These remain the v1 weighting targets.

### Output discipline
- Every finding must cite the exact section.
- For unenforceability findings, every finding must show the calc / detection signal (auditable).
- Confidence must be exposed; lawyer-confirm flag for anything below 0.6.

### Build sequence (ticket-cycle priority)
1. Capability 5 Phase 1 rules (5.3, 5.7, 5.10, 5.11) — bright-line voids, biggest immediate value.
2. Capability 6 — pattern library for hidden obligations.
3. Capability 7 — landlord notification calendar.
4. Capability 1 — already done; extend with ministerial-determination lookup.
5. Everything else queues after.
