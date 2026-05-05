#!/usr/bin/env tsx
/**
 * Generate a realistic populated Victorian Retail Commercial Lease PDF
 * (LIV standard form, 2023 baseline) for PRJ-663 lease-review pipeline
 * testing. Deliberately includes clauses that the reviewer should flag:
 *   - broad tenant indemnity surviving termination (ongoing financial)
 *   - "bare shell" make-good (excessive make-good)
 *   - management fee + land tax pass-through (excessive outgoings; land tax
 *     pass-through is prohibited under RLA 2003 s 50 for retail premises)
 *
 * Usage: npx tsx scripts/seed-retail-lease-pdf.ts
 * Output: C:/LAW/SAMPLE-RETAIL-LEASE-POPULATED.pdf
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const seed = {
  dateOfLease: "15/06/2026",
  landlord: {
    name: "Acme Property Holdings Pty Ltd",
    acn: "612 884 001",
    address: "Level 14, 101 Collins Street, Melbourne VIC 3000",
    contact: "leasing@acmeholdings.com.au",
  },
  landlordAgent: {
    name: "Fitzroy Commercial Real Estate",
    address: "58 Johnston Street, Fitzroy VIC 3065",
    contact: "(03) 9417 2200",
  },
  tenant: {
    name: "Little Bird Café Pty Ltd",
    acn: "665 210 338",
    address: "12A Peel Street, Collingwood VIC 3066",
    contact: "jess@littlebirdcafe.com.au",
  },
  guarantors: [
    { name: "Jessica Anne Taylor", address: "12A Peel Street, Collingwood VIC 3066" },
    { name: "Michael James O'Brien", address: "4 Regent Street, Richmond VIC 3121" },
  ],
  premises: {
    address: "Shop 4, 215 Brunswick Street, Fitzroy VIC 3065",
    titleReference: "Volume 09876 Folio 432",
    approxArea: "84 square metres (lettable)",
    carSpaces: "Nil",
  },
  permittedUse: "Licensed café and eatery (dine-in and takeaway), ancillary retail sale of coffee beans, tea and branded merchandise",
  retailPremises: true, // Retail Leases Act 2003 (Vic) applies
  term: "5 years",
  commencementDate: "01/07/2026",
  expiryDate: "30/06/2031",
  options: [
    { term: "5 years", noticeNotLessThan: "6 months", noticeNotMoreThan: "12 months" },
  ],
  baseRent: {
    annual: "$82,500.00 plus GST",
    monthly: "$6,875.00 plus GST",
    firstPaymentDue: "01/07/2026",
  },
  rentReview: {
    annual: "CPI (All Groups, Melbourne) on each anniversary of the Commencement Date, other than the first anniversary of any Market Review.",
    market: "Market review at the commencement of each option term, in accordance with Part 10 of the Retail Leases Act 2003 (Vic).",
  },
  securityDeposit: {
    type: "Unconditional bank guarantee",
    amount: "$24,750.00 (equivalent to 3 months' base rent inclusive of GST)",
    deliveredBy: "01/07/2026",
  },
  outgoings: {
    proportion: "14.2% (Tenant's pro-rata share, being Premises lettable area ÷ total lettable area of the Building)",
    included: [
      "Council rates and charges",
      "Water rates and charges (excluding usage metered separately to the Premises)",
      "Building insurance premiums (fire, public liability, loss of rent)",
      "Common area cleaning, lighting and security",
      "Repairs and maintenance of common areas and plant",
      "Fire services and essential safety measures compliance",
      "Land tax assessed on the Building on a single-holding basis",
      "Landlord's management fee: 5% of total annual outgoings",
      "Landlord's capital works amortised over 10 years (including replacement of plant and HVAC)",
    ],
  },
  insurance: {
    publicLiability: "$20,000,000 per occurrence",
    plateGlass: "Required — full replacement value",
    tenantFixtures: "Required — full replacement value",
    workCover: "As required by law",
  },
  permittedHours: "Monday to Friday 06:30 – 18:00; Saturday and Sunday 07:00 – 17:00. Extended hours permitted with Landlord's prior written consent, such consent not to be unreasonably withheld.",
  assignment: "Assignment or sub-letting permitted only with the prior written consent of the Landlord, such consent not to be unreasonably withheld, in accordance with Part 7 of the Retail Leases Act 2003 (Vic).",
  specialConditions: [
    {
      num: "SC1",
      title: "Fit-out contribution",
      body: "The Landlord will contribute $25,000 (plus GST) towards the Tenant's initial fit-out of the Premises, payable upon receipt of tax invoices substantiating the same amount of Tenant expenditure and upon the Tenant providing evidence that all fit-out works have been completed in accordance with plans approved by the Landlord (acting reasonably).",
    },
    {
      num: "SC2",
      title: "Rent-free period",
      body: "The Tenant is entitled to a rent-free period of two (2) calendar months commencing on the Commencement Date, during which no base rent is payable. Outgoings remain payable throughout the rent-free period.",
    },
    {
      num: "SC3",
      title: "Permitted works",
      body: "The Tenant may install a commercial kitchen exhaust, grease trap, and shopfront signage at the Tenant's cost, subject to the Landlord's prior written approval of plans and specifications (such approval not to be unreasonably withheld or delayed).",
    },
    {
      num: "SC4",
      title: "Liquor licence",
      body: "The Tenant is responsible for obtaining and maintaining all licences necessary for the Permitted Use, including any on-premises liquor licence under the Liquor Control Reform Act 1998 (Vic).",
    },
    {
      num: "SC5",
      title: "Indemnity",
      body: "The Tenant indemnifies and must keep indemnified the Landlord from and against all actions, claims, demands, losses, damages, costs and expenses of whatever nature arising out of or in connection with the Premises, the Tenant's use of the Premises, or any act or omission of the Tenant, its employees, contractors, invitees or customers. This indemnity is unlimited and survives the expiry or earlier termination of the Lease.",
    },
    {
      num: "SC6",
      title: "Make good",
      body: "On expiry or earlier termination of the Lease the Tenant must, at the Tenant's cost, return the Premises to the Landlord in a bare-shell condition to the Landlord's reasonable satisfaction. Without limitation, the Tenant must: (a) remove all fixtures, fittings, partitions, floor coverings, signage, wiring, cabling and shopfront installed by or on behalf of the Tenant (whether installed before or during the Term); (b) reinstate all walls, floors and ceilings to a freshly painted, smooth finish; (c) remove the commercial kitchen, exhaust, grease trap and any services installed by the Tenant; and (d) make good any damage caused by such removal.",
    },
    {
      num: "SC7",
      title: "Holding over",
      body: "If the Tenant remains in possession after the expiry of the Term without a new lease being entered into, the Tenant holds over as a monthly tenant at 125% of the base rent payable in the month immediately preceding expiry, otherwise on the terms of this Lease.",
    },
  ],
  executed: {
    landlordSigned: "15/06/2026",
    landlordSignatory: "Robert Andrew Callahan, Director",
    tenantSigned: "15/06/2026",
    tenantSignatory: "Jessica Anne Taylor, Director",
    guarantor1Signed: "15/06/2026",
    guarantor2Signed: "15/06/2026",
  },
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );

function html(): string {
  const s = seed;
  return /* html */ `<!doctype html>
<html><head><meta charset="utf-8"/><title>Retail Commercial Lease — POPULATED SEED</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html, body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color:#000; line-height:1.4; }
  h1 { font-size: 22pt; margin: 0 0 6pt 0; font-weight: normal; }
  h2 { font-size: 13pt; margin: 16pt 0 6pt; font-weight: bold; text-transform: uppercase; border-bottom:1.5px solid #000; padding-bottom:2pt; }
  h3 { font-size: 10.5pt; margin: 10pt 0 3pt; font-weight: bold; }
  .brand { display:flex; justify-content:space-between; font-size:9pt; color:#555; margin-bottom:6pt; }
  .seed-banner { background:#fff3cd; border:1px solid #b38f00; padding:4pt 6pt; font-size:9pt; margin-bottom:8pt; }
  table.sched { border-collapse: collapse; width:100%; margin:4pt 0; }
  table.sched th, table.sched td { border:1px solid #000; padding:5pt 7pt; vertical-align:top; font-size:10pt; }
  table.sched th { background:#eee; text-align:left; width:36%; }
  ol.lease { padding-left:20pt; }
  ol.lease > li { margin: 6pt 0; }
  ol.sub { padding-left:18pt; list-style: lower-alpha; }
  ol.sub > li { margin:3pt 0; }
  .page-break { page-break-before: always; }
  .note { font-size:9pt; color:#333; font-style: italic; }
  .sig-box { border:1px solid #000; padding:8pt 10pt; margin:6pt 0; }
  .sig-line { border-bottom:1px solid #000; padding:2pt 4pt; min-height:14pt; margin-top:4pt; }
  .two-col { display:flex; gap:14pt; }
  .two-col > div { flex:1; }
  ul { margin: 3pt 0 3pt 18pt; padding:0; }
  li { margin: 2pt 0; }
</style></head>
<body>

<div class="brand"><span>Retail Commercial Lease (LIV Standard Form · 2023 baseline)</span><span>Retail Leases Act 2003 (Vic) applies</span></div>
<h1>Retail Commercial Lease</h1>
<div class="seed-banner"><b>SEED DATA — NOT A REAL LEASE.</b> Fictional. Generated ${new Date().toISOString().slice(0, 10)} for PRJ-663 lease-review pipeline testing. Contains deliberately flaggable clauses (broad indemnity, bare-shell make-good, land-tax pass-through).</div>

<p><b>Date of lease:</b> ${esc(s.dateOfLease)}</p>

<h2>Parties</h2>
<table class="sched">
  <tr><th>Landlord</th><td>${esc(s.landlord.name)} (ACN ${esc(s.landlord.acn)})<br/>${esc(s.landlord.address)}<br/>${esc(s.landlord.contact)}</td></tr>
  <tr><th>Landlord's managing agent</th><td>${esc(s.landlordAgent.name)}, ${esc(s.landlordAgent.address)}, ${esc(s.landlordAgent.contact)}</td></tr>
  <tr><th>Tenant</th><td>${esc(s.tenant.name)} (ACN ${esc(s.tenant.acn)})<br/>${esc(s.tenant.address)}<br/>${esc(s.tenant.contact)}</td></tr>
  <tr><th>Guarantors</th><td>${s.guarantors.map((g) => `${esc(g.name)} of ${esc(g.address)}`).join("<br/>")}</td></tr>
</table>

<h2>Item 1 — Reference Schedule</h2>
<table class="sched">
  <tr><th>Premises</th><td>${esc(s.premises.address)}<br/>Title: ${esc(s.premises.titleReference)}<br/>Approx. area: ${esc(s.premises.approxArea)}<br/>Car spaces: ${esc(s.premises.carSpaces)}</td></tr>
  <tr><th>Permitted use</th><td>${esc(s.permittedUse)}</td></tr>
  <tr><th>Retail premises?</th><td>${s.retailPremises ? "Yes — the Retail Leases Act 2003 (Vic) applies to this Lease." : "No"}</td></tr>
  <tr><th>Term</th><td>${esc(s.term)}</td></tr>
  <tr><th>Commencement date</th><td>${esc(s.commencementDate)}</td></tr>
  <tr><th>Expiry date</th><td>${esc(s.expiryDate)}</td></tr>
  <tr><th>Option(s) to renew</th><td>${s.options
    .map(
      (o) =>
        `One further term of ${esc(o.term)}. Notice to exercise not less than ${esc(o.noticeNotLessThan)} and not more than ${esc(o.noticeNotMoreThan)} before expiry.`,
    )
    .join("<br/>")}</td></tr>
  <tr><th>Base rent</th><td>${esc(s.baseRent.annual)} per annum (${esc(s.baseRent.monthly)} per month), payable monthly in advance. First payment due ${esc(s.baseRent.firstPaymentDue)}.</td></tr>
  <tr><th>Rent review — annual</th><td>${esc(s.rentReview.annual)}</td></tr>
  <tr><th>Rent review — market</th><td>${esc(s.rentReview.market)}</td></tr>
  <tr><th>Security (bank guarantee)</th><td>${esc(s.securityDeposit.type)}<br/>Amount: ${esc(s.securityDeposit.amount)}<br/>To be delivered by: ${esc(s.securityDeposit.deliveredBy)}</td></tr>
  <tr><th>Tenant's share of outgoings</th><td>${esc(s.outgoings.proportion)}</td></tr>
  <tr><th>Recoverable outgoings</th><td><ul>${s.outgoings.included.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></td></tr>
  <tr><th>Public liability insurance</th><td>${esc(s.insurance.publicLiability)}</td></tr>
  <tr><th>Plate glass insurance</th><td>${esc(s.insurance.plateGlass)}</td></tr>
  <tr><th>Tenant fixtures insurance</th><td>${esc(s.insurance.tenantFixtures)}</td></tr>
  <tr><th>WorkCover</th><td>${esc(s.insurance.workCover)}</td></tr>
  <tr><th>Permitted hours of trade</th><td>${esc(s.permittedHours)}</td></tr>
  <tr><th>Assignment / sub-letting</th><td>${esc(s.assignment)}</td></tr>
</table>

<h2 class="page-break">Item 2 — Standard Terms of Lease</h2>

<ol class="lease">
  <li><b>Grant of Lease.</b> The Landlord leases the Premises to the Tenant for the Term commencing on the Commencement Date and expiring on the Expiry Date, on the terms and conditions set out in this Lease.</li>

  <li><b>Rent.</b>
    <ol class="sub">
      <li>The Tenant must pay the Base Rent to the Landlord by equal monthly instalments in advance, without deduction, set-off or demand.</li>
      <li>Payment is to be made by electronic funds transfer to the account nominated by the Landlord from time to time.</li>
      <li>If any payment is overdue, the Tenant must pay interest at 2% above the Penalty Interest Rate (Vic) on the overdue amount, calculated daily from the due date until payment.</li>
    </ol>
  </li>

  <li><b>Rent Review.</b> The Base Rent is reviewed in accordance with the mechanism specified in the Reference Schedule. Market reviews are to be conducted in accordance with Part 10 of the <i>Retail Leases Act 2003</i> (Vic), including the Tenant's right to request an early market review before exercising any option.</li>

  <li><b>GST.</b> Unless expressly stated otherwise, all amounts payable under this Lease are exclusive of GST. The Tenant must pay GST to the Landlord on receipt of a valid tax invoice.</li>

  <li><b>Outgoings.</b>
    <ol class="sub">
      <li>The Tenant must pay the Tenant's Share of the Recoverable Outgoings listed in the Reference Schedule.</li>
      <li>The Landlord must provide an annual estimate of outgoings in accordance with section 46 of the <i>Retail Leases Act 2003</i> (Vic), and must reconcile the estimate against actual outgoings within 3 months of the end of each accounting period in accordance with section 47.</li>
      <li>The Tenant is not required to pay any outgoing not specified in the Reference Schedule or disclosed in the most recent disclosure statement.</li>
    </ol>
  </li>

  <li><b>Use of Premises.</b> The Tenant must use the Premises only for the Permitted Use and must comply with all laws affecting the Premises, including obtaining and maintaining all licences required.</li>

  <li><b>Repairs and Maintenance.</b>
    <ol class="sub">
      <li>The Tenant must keep the interior of the Premises, and all Tenant's fixtures and fittings, in good repair and condition (fair wear and tear excepted).</li>
      <li>The Landlord is responsible for structural repairs and for the capital items identified in section 251 of the <i>Building Act 1993</i>.</li>
    </ol>
  </li>

  <li><b>Insurance.</b> The Tenant must, throughout the Term, maintain the insurances specified in the Reference Schedule with a reputable insurer and must provide evidence of currency on request.</li>

  <li><b>Alterations.</b> The Tenant must not make any alterations to the Premises without the Landlord's prior written consent, such consent not to be unreasonably withheld in respect of non-structural alterations.</li>

  <li><b>Damage and Destruction.</b> If the Premises are damaged or destroyed and rendered wholly or substantially unfit for the Permitted Use, the rent abates proportionately, and either party may terminate this Lease in accordance with section 57 of the <i>Retail Leases Act 2003</i> (Vic).</li>

  <li><b>Default.</b> The Landlord may re-enter the Premises and terminate this Lease if the Tenant:
    <ol class="sub">
      <li>fails to pay rent or outgoings for 14 days after they become due;</li>
      <li>commits a material breach of this Lease and does not remedy the breach within 14 days of written notice (or such longer period as is reasonable in the circumstances); or</li>
      <li>becomes insolvent.</li>
    </ol>
  </li>

  <li><b>Assignment and Sub-letting.</b> The Tenant may assign this Lease or sub-let the Premises only with the prior written consent of the Landlord, such consent not to be unreasonably withheld. The procedure in Part 7 of the <i>Retail Leases Act 2003</i> (Vic) applies.</li>

  <li><b>Option to Renew.</b> The Tenant may exercise the option specified in the Reference Schedule by written notice given within the notice period, provided the Tenant is not in material breach and has not been given two or more notices to remedy during the Term.</li>

  <li><b>Disclosure Statement.</b> The Landlord has given the Tenant a Disclosure Statement in accordance with section 17 of the <i>Retail Leases Act 2003</i> (Vic) at least 14 days before the Tenant signed this Lease. The Tenant has been given a copy of the Small Business Commissioner's Information Brochure.</li>

  <li><b>Guarantee and Indemnity.</b> The Guarantors named in the Reference Schedule guarantee the performance of the Tenant's obligations under this Lease. This guarantee is continuing and is not affected by any indulgence granted to the Tenant.</li>

  <li><b>Dispute Resolution.</b> Any dispute under this Lease must be referred to the Victorian Small Business Commissioner under Part 10 of the <i>Retail Leases Act 2003</i> (Vic) before either party commences proceedings, other than in respect of urgent injunctive relief.</li>

  <li><b>Notices.</b> Any notice under this Lease must be in writing and may be served personally, by post, or by email to the address specified in the Parties section or as notified from time to time.</li>

  <li><b>Governing Law.</b> This Lease is governed by the laws of Victoria.</li>
</ol>

<h2 class="page-break">Item 3 — Special Conditions</h2>
<p class="note">These Special Conditions prevail over any inconsistent provision in the Standard Terms.</p>

${s.specialConditions
  .map(
    (sc) => `
<h3>${esc(sc.num)} — ${esc(sc.title)}</h3>
<p>${esc(sc.body)}</p>`,
  )
  .join("")}

<h2 class="page-break">Execution</h2>

<div class="sig-box">
  <h3>Signed for and on behalf of the Landlord</h3>
  <p>${esc(s.landlord.name)} (ACN ${esc(s.landlord.acn)})</p>
  <div class="two-col">
    <div><div class="sig-line"><i>(electronic signature applied)</i></div><p>Signatory: ${esc(s.executed.landlordSignatory)}</p></div>
    <div><div class="sig-line">${esc(s.executed.landlordSigned)}</div><p>Date</p></div>
  </div>
</div>

<div class="sig-box">
  <h3>Signed for and on behalf of the Tenant</h3>
  <p>${esc(s.tenant.name)} (ACN ${esc(s.tenant.acn)})</p>
  <div class="two-col">
    <div><div class="sig-line"><i>(electronic signature applied)</i></div><p>Signatory: ${esc(s.executed.tenantSignatory)}</p></div>
    <div><div class="sig-line">${esc(s.executed.tenantSigned)}</div><p>Date</p></div>
  </div>
</div>

${s.guarantors
  .map(
    (g, i) => `
<div class="sig-box">
  <h3>Signed by the Guarantor</h3>
  <p>${esc(g.name)} of ${esc(g.address)}</p>
  <div class="two-col">
    <div><div class="sig-line"><i>(electronic signature applied)</i></div><p>Guarantor signature</p></div>
    <div><div class="sig-line">${esc(i === 0 ? s.executed.guarantor1Signed : s.executed.guarantor2Signed)}</div><p>Date</p></div>
  </div>
  <p class="note">The Guarantor confirms receipt of independent legal advice before signing this Lease.</p>
</div>`,
  )
  .join("")}

<p class="note" style="margin-top:18pt">End of Retail Commercial Lease.</p>

</body></html>`;
}

async function main() {
  const out = path.resolve("C:/LAW/SAMPLE-RETAIL-LEASE-POPULATED.pdf");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html(), { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    await writeFile(out, pdf);
    console.log(`Wrote ${pdf.byteLength} bytes -> ${out}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
