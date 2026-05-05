# LAW — Module roadmap (v1 scoping)

Companion to `docs/lease/capabilities-v1.md` (PRJ-693). Each module follows the
same pattern: classify → extract → check rules → propose amendments / produce
form → compose advisory letter.

The default jurisdiction is **Victoria**. Where Aus-wide is feasible, we note it.
Recommended sequence is at the end.

---

## Module A — Cost disclosure automation (LPUL s 174 / Costs Agreements)

### Scope
Generate compliant cost disclosure statements + costs agreements under the
Legal Profession Uniform Law (LPUL), targeting the disclosure required at the
start of any matter where total legal costs are likely to exceed $750.

### Why this is the right v1 module
- **Deterministic.** Rules are bright-line: matter type, fee mode, total cost
  threshold, refresh triggers. LLM only needed for free-text fields (scope of
  work, confidentiality, etc.).
- **Low liability.** It's a form, not advice — failure mode is "missing field"
  not "wrong opinion".
- **High pain.** Every solicitor must do this for every matter; many do it
  badly. Defective disclosure = costs unrecoverable, costs agreement void
  (LPUL s 178).
- **Aus-wide.** LPUL applies in VIC, NSW, WA. Other states are coming.
- **No PC required** to ship — it's document automation.

### Inputs
- Matter type / area of law (lease, conveyance, will, etc.)
- Fee mode (fixed / hourly / capped / no-win-no-fee / contingent)
- Estimated total cost (range)
- Hourly rates of the practitioners
- Likely scope of work (free text)
- Existing client (refresh) vs new client
- Substantial-changes flag (triggers re-disclosure)

### Outputs
- Cost disclosure statement (DOCX + PDF)
- Costs agreement draft (DOCX + PDF)
- LPUL compliance checklist showing each statutory limb satisfied
- Refresh schedule — when re-disclosure is required (s 174(5))

### Capabilities (matching PRJ-693 pattern)
1. Matter classification — what disclosure level applies (none / s174(2) / full)
2. Fee model handling — fixed/hourly/capped/conditional
3. Threshold calculation — $750 trigger, $3,000 contingent line
4. Variation triggers — what counts as substantial change requiring re-disclosure
5. Conditional cost agreement compliance — s 181, cooling-off, uplift cap
6. Trust money disclosure linkage — flag if matter will involve trust money
7. ABA test reminder — "would another lawyer have given this disclosure?"
8. Multi-client matters — joint vs several disclosure
9. Plain-language statement summary
10. Letter of engagement composer

### Key statutes
- LPUL s 174 (disclosure) — content + timing
- LPUL s 178 (consequences of non-disclosure)
- LPUL s 180 (costs agreements)
- LPUL s 181 (conditional costs agreements)
- LPUL Sch 4 cl 16 (uplift fees)
- LSB Vic Practice Notes 1/2024, 2/2024

### Phase plan
- **Phase 1 (Q1)**: deterministic form generation for VIC fixed-fee + hourly
- **Phase 2 (Q2)**: conditional / no-win-no-fee + class-action carve-outs
- **Phase 3 (Q3)**: extend to NSW + WA

### Risks
- Re-disclosure timing — when is "substantial change" → over-conservative may
  spam clients, under-conservative breaches.
- Uplift fee caps in personal-injury work — different rules.
- Tax inclusivity / GST presentation — small but trips lawyers.

---

## Module B — Bank documents (mortgages, guarantees, security agreements)

### Scope
Tenant/guarantor-side review of bank-issued security documents: mortgages over
real property, guarantees and indemnities, general security agreements (PPSA),
account / overdraft terms.

### Why
- Reuses the lease pipeline architecture almost wholesale (extract → check
  rules → compose letter)
- Banking Code of Practice 2021 + ASIC RG 209 + NCCP give us a meaty rule pack
- Personal-guarantee scrutiny is the obvious tenant-protection differentiator —
  same risk surface as lease personal guarantees but at higher dollar values

### Inputs
- Mortgage / guarantee / GSA PDF
- Borrower / guarantor characteristics (individual, company, director-guarantor,
  third-party-guarantor)
- Loan purpose (consumer / business / investment) → drives NCCP coverage
- Security being granted (real property + PPSA register + cross-collateral)

### Outputs
- Risk register: cross-default, all-monies, after-acquired property, exclusion
  clauses, set-off, indemnity scope
- Banking Code compliance check (Part 7 — guarantees; Part 8 — vulnerable
  customers)
- NCCP applicability + UCT (unfair contract terms) screen
- Schedule of proposed amendments
- Plain-language explainer for the guarantor (what you're actually signing)

### Capabilities
1. Document classification (mortgage / guarantee / GSA / facility agreement)
2. Borrower vs guarantor extraction
3. All-monies / specific-debt clause detection
4. Cross-collateralisation mapping
5. Banking Code Part 7 compliance — guarantor protections
6. Independent-advice requirement check (Yerkey v Jones / Garcia)
7. Vulnerable-customer flags (Banking Code Part 4)
8. UCT screen (ASIC Act s 12BG; ACL s 24)
9. Default & enforcement powers analysis
10. Cost / interest / fee calculation surface
11. PPSA registration analysis (collateral classes, secured-party detail)
12. Letter of advice

### Key statutes
- Banking Code of Practice 2021 (esp. Parts 4, 7, 8)
- NCCP Act 2009 + Regulations
- ASIC Act 2001 (UCT — s 12BG)
- ACL — UCT (s 24)
- PPSA 2009 (Cth)
- Property Law Act 1958 (Vic) — mortgage provisions
- Yerkey v Jones (1939) 63 CLR 649 / Garcia v NAB (1998) 194 CLR 395

### Phase plan
- **Phase 1**: residential mortgages + director guarantees (highest volume)
- **Phase 2**: GSA / PPSA + business loans
- **Phase 3**: complex syndicated facilities

### Risks
- Yerkey/Garcia is interpretive case law — needs lawyer-confirm flag
- Bank documents are heavily templated → risk of false positives if rule pack
  flags every all-monies clause without context

---

## Module C — Powers of Attorney (POA) review + drafting

### Scope
VIC: review existing POAs and draft new ones under the Powers of Attorney Act
2014 (Vic). General POA, Enduring POA (financial), Enduring POA (medical
treatment under Medical Treatment Planning and Decisions Act 2016).

### Why
- Aging population → high volume need
- Witnessing rules are deterministic and frequently violated
- Solicitors do these on autopilot → quality varies

### Inputs (review mode)
- Existing POA PDF
- Donor characteristics
- Type sought (general / enduring financial / supportive / medical)

### Inputs (draft mode)
- Donor + attorneys (incl. successive / multiple appointment configuration)
- Powers granted (broad / restricted / specific)
- Conditions, limitations, commencement events
- Witnessing arrangement

### Outputs
- Compliance check against POA Act 2014 ss 22–35 (form requirements,
  witnessing, capacity certificate)
- Risk register: conflict-transaction authorisation, gifts to attorney, joint
  vs joint-and-several, successive attorney triggers
- Drafted document (DOCX) following the POA Act prescribed form

### Capabilities
1. Form classification (which POA Act provision)
2. Witness eligibility check (s 35 — including the "authorised witness" test)
3. Capacity statement compliance (Form 2)
4. Conflict-transaction authorisation extraction
5. Multiple-attorney appointment analysis (joint / several / successive)
6. Commencement-event extraction (immediate / on incapacity / specified event)
7. Power scope analysis (financial only / medical / both)
8. Revocation chain (does it expressly revoke prior POAs?)
9. Interaction with VCAT supervision powers
10. Letter of advice / explainer for the donor

### Key statutes
- Powers of Attorney Act 2014 (Vic)
- Medical Treatment Planning and Decisions Act 2016 (Vic)
- Guardianship and Administration Act 2019 (Vic)

### Phase plan
- **Phase 1**: review existing POAs against statutory form
- **Phase 2**: draft new POAs (template-driven, LLM for free-text)
- **Phase 3**: integrate with capacity assessment workflow

### Risks
- Capacity is medical fact — system cannot opine. Output must direct to
  clinician for capacity assessment.
- Medical treatment POAs interact with Voluntary Assisted Dying — needs
  scope-out.

---

## Module D — Wills review (NOT will drafting)

### Scope
**Review-only** — read an existing will and produce a risk register. No
drafting in v1.

### Why
- Drafting wills is high liability → requires PC + insurance.
- Reviewing for execution defects, ambiguity, intestacy gaps, and tax
  efficiency is value-add to existing executor / solicitor workflows.

### Inputs
- Will PDF (signed / unsigned)
- Optional: family tree, asset list, intended beneficiaries

### Outputs
- Execution-formality compliance: Wills Act 1997 (Vic) s 7 — signed by
  testator, two witnesses, testator + witnesses present etc.
- Capacity / undue-influence red flags (textual only)
- Ambiguity / construction problems
- Asset-coverage gaps (intestacy on unidentified assets)
- Family Provision Claim exposure (Part IV)
- Tax flags (super death benefits, CGT main-residence, testamentary trust
  thresholds)

### Capabilities
1. Execution formality check
2. Beneficiary extraction + percentage allocation
3. Specific gift vs residue mapping
4. Intestacy-gap detection
5. Executor appointment (sole / joint / substitute) analysis
6. Testamentary trust detection + tax-treatment flags
7. Survivorship clause analysis
8. Family Provision exposure (Part IV) — eligibility list of likely claimants
9. Super death benefit treatment flag
10. CGT main-residence / pre-CGT asset flag
11. Letter to executor / solicitor

### Key statutes
- Wills Act 1997 (Vic)
- Administration and Probate Act 1958 (Vic) Part IV
- Income Tax Assessment Act 1997 (Cth) — Div 102, Div 152, s 102AG
- Superannuation Industry (Supervision) Act 1993 (Cth) — death benefit rules

### Phase plan
- **Phase 1**: execution-formality + beneficiary extraction
- **Phase 2**: tax flag rule pack
- **Phase 3**: probate-readiness checklist

### Risks
- Drafting wills is **not in v1 scope**. Marketing must be clear: this is a
  review tool, not a will-maker. Will-makers are a regulated category in some
  states.

---

## Module E — Conveyance automation (post-contract)

### Scope
Automation of the *post-contract* conveyance workflow: PEXA workspace setup,
caveat clearance, settlement adjustment calculations, statutory notice tracking
(s 27, FIRB, GST withholding, foreign-resident CGT clearance).

### Why
- Section 32 review is already in scope (s32 module exists)
- Natural extension: take the matter through to settlement
- Differentiator: integrate Section 32 review findings into matter task list

### Reality check
- Crowded market (PEXA, Triconvey, GlobalX/InfoTrack, LEAP).
- Many tasks require integration credentials (PEXA, VOI providers, lodgement
  case manager).
- Where we win: AI-driven task generation from the contract + s32 + lease findings.

### Capabilities (v1, AI-driven)
1. Task list generation from contract + s32 + lease review outputs
2. Critical-date tracker (deposit due, cooling-off, settlement, finance,
   building/pest)
3. Special-condition obligation extractor (deliverables both sides must perform)
4. s 27 deposit-release readiness check
5. FIRB / foreign-resident CGT clearance triggers
6. GST withholding (TR 2018/D2 + GSTR 2009/2) trigger detection
7. State stamp duty calculator (DUTYACT s 32 etc.)
8. Settlement adjustment calculator (rates, water, OC fees, rent)
9. Trust-money requisition log
10. Pre-settlement / post-settlement checklist

### Key statutes
- Sale of Land Act 1962 (Vic)
- Property Law Act 1958 (Vic)
- Duties Act 2000 (Vic)
- Foreign Acquisitions and Takeovers Act 1975 (Cth)
- Foreign Investment Reform Act 2020 (Cth)
- TAA Sch 1 Div 14 (foreign-resident CGT withholding)
- A New Tax System (GST) Act 1999 — GST withholding s 14-250

### Phase plan
- **Phase 1**: task list + critical date tracker (read-only)
- **Phase 2**: stamp duty + adjustment calculator
- **Phase 3**: PEXA / lodgement integration (requires partner deals)

### Risks
- Going past pure information into transactional execution = regulated activity
- PEXA integration requires PEXA Membership + ELN compliance — months of work

---

## Module F — Trust accounting / notification compliance

### Scope
Trust money receipts/disbursements record-keeping, statutory deposits, monthly
trust account reconciliation, external examination preparation, compliance
reports to the Legal Services Board.

### Why this needs caution
- LPUL Part 4.2 + Legal Profession Uniform General Rules 2015 Part 4.2 are
  **the** highest-regulatory-risk area for solicitors. Get it wrong → lose your
  PC.
- This is **not** the area to ship a v1 in 2 weeks.

### What we should do
- **Don't** rebuild trust accounting (LEAP, Smokeball, Actionstep, Xero +
  trust-add-ons all do this).
- **Do** ship narrow tools that bolt onto existing trust software:
  - **F1**: Trust statement compliance verifier — read a generated trust
    statement, check it against r 50 / Sch 1.
  - **F2**: Cost disclosure → trust money flag — trigger when a matter implies
    trust money.
  - **F3**: External examination workpaper builder — assemble the file an
    external examiner expects.
  - **F4**: Statutory deposit calculator (LPUL s 154 / r 47).

### Phase plan
- **Phase 1**: F1 + F2 (read-only, low risk)
- **Phase 2**: F3 + F4
- **Phase 3+**: NOT in this product. Trust accounting itself stays with LEAP/
  Smokeball/Actionstep.

### Key statutes / rules
- LPUL ss 138–162 (trust money)
- Legal Profession Uniform General Rules 2015 r 36–73
- LSB Vic Practice Note 4/2024 (trust accounting)

### Risks
- Bugs here can cause solicitors to lose PCs. Every output needs lawyer
  confirmation. Mark module as "audit-assistant" not "compliance-tool".

---

## Module G — Billing automation

### Scope
LPUL-compliant invoices: itemised bills (s 187), short-form bills, costs
agreements alignment, GST handling, trust-money applied-to-account
reconciliation.

### Reality check
- LEAP, Actionstep, Smokeball, Clio all handle billing.
- Differentiator: **AI-generated itemisation from time-entry narratives** with
  consistent professional language and LPUL-compliant formatting.

### Capabilities
1. Time-entry narrative cleanup (rewrite for clarity, group related entries)
2. LPUL s 187 itemised-bill format compliance
3. Costs agreement vs bill reconciliation (over-disclosure flag)
4. Trust money applied-to-account compliance (s 153 + r 53)
5. Tax invoice GST format check
6. Notice of client's rights (LPUL s 192)
7. Multi-matter billing aggregation
8. Cost-recovery vs cost-disclosure variance reporting

### Phase plan
- **Phase 1**: invoice format + s 187 compliance + s 192 notice
- **Phase 2**: AI narrative cleanup
- **Phase 3**: cost-disclosure variance + trust integration

### Key statutes
- LPUL ss 187, 192, 198–199 (assessment/review of bills)
- A New Tax System (GST) Act 1999 — Div 29

---

## Recommended sequence

| Order | Module | Why now |
|---|---|---|
| 1 | **A — Cost disclosure** | Lowest risk · widest applicability · ships fastest · enables F2 + G3 dependencies |
| 2 | **B — Bank docs (residential mortgage + director guarantee)** | Reuses lease pipeline · clear differentiator (guarantor protection) |
| 3 | **G1 — Billing format compliance** | Connects to A · uses same rule-pack pattern |
| 4 | **C — POA review (not draft)** | Self-contained · clear v1 scope |
| 5 | **D — Wills review (not draft)** | Higher liability, lower volume — wait until A/B are paying |
| 6 | **F1/F2 — Trust statement verifier** | High risk, low MVP scope — careful |
| 7 | **E — Conveyance task generator** | Crowded market — only ship if customer pull |

### Why not all at once
Each module is a 2–6 week build at the quality bar PRJ-693 set. Building all
seven in parallel gets seven half-finished modules. Building them sequentially
gets one shipped + tested + learned-from before the next starts.

## Open questions
- **Customer.** Are these for solo solicitors? Mid-tier firms? Tenant-rights
  organisations? Different customers want different things.
- **Practising certificate dependency.** Some modules need a PC holder in the
  loop on every output (wills, trust). Others don't (cost disclosure form).
  Architecture should let us mark workflows as "PC-required" and gate them.
- **Output ownership.** Who signs the disclosure / advice? White-label per
  firm? Or LAW co-branded?
- **Pricing model.** Per-matter, per-seat, or per-document?

---

*Doc owner: this scoping precedes any Linear epics. Each module above should
become its own Linear project with capability list before any code lands.*
