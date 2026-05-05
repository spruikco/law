#!/usr/bin/env tsx
/**
 * Generate a realistic populated Victorian Section 32 Vendor Statement PDF
 * for end-to-end pipeline testing. Property details match the companion
 * contract of sale seed (42 Acacia Avenue, Northcote VIC 3070).
 *
 * Usage: npx tsx scripts/seed-section32-pdf.ts
 * Output: C:/LAW/VIC-Section-32-Vendor-Statement-POPULATED.pdf
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const seed = {
  landAddress: "42 Acacia Avenue, Northcote VIC 3070",
  titleReference: "Volume 10234 Folio 567",
  lotPlan: "Lot 1 on Plan of Subdivision PS812345K",
  municipality: "City of Darebin",
  vendors: [
    { name: "John Andrew Smith", date: "18/04/2026" },
    { name: "Margaret Louise Smith", date: "18/04/2026" },
  ],
  purchasers: [
    { name: "David Wei Chen", date: "21/04/2026" },
    { name: "Emily Jane Chen", date: "21/04/2026" },
  ],
  // 1.1 Outgoings – annual aggregate (council + fire services levy + water)
  outgoingsTotal: "$5,850.00",
  outgoingsBreakdown: [
    "Darebin City Council general rates (2025/26): $3,120.00",
    "Fire Services Property Levy (2025/26): $215.00",
    "Yarra Valley Water — service charges (annualised): $1,180.00",
    "Victorian Land Tax (2026 assessment, single holding basis): $1,335.00",
  ],
  // 1.2 Charges under statute
  chargeFrom: "",
  chargeTo: "",
  chargeOther: "Not applicable — no statutory charge registered against the land.",
  termsContract: "Not applicable.",
  saleSubjectToMortgage: "Not applicable.",
  damageAndDestruction:
    "Not applicable — the land remains at the risk of the vendor until settlement (see general condition 31 of the contract).",
  ownerBuilder:
    "Not applicable — no owner-builder works carried out on the residence within the preceding 6 years.",
  // 3.1 Easements, covenants
  easements: [
    "Drainage and sewerage easement 1.83 m wide along the rear (southern) boundary, as shown E-1 on Plan of Subdivision PS812345K, in favour of Yarra Valley Water Corporation and the City of Darebin.",
    "Restrictive covenant (single dwelling) — Instrument of Transfer No. H123456 registered 12 March 1927, restricting the erection of more than one dwelling on the land.",
  ],
  roadAccessBlocked: false,
  bushfireProneArea: false,
  // 3.4 Planning
  planning: {
    scheme: "Darebin Planning Scheme",
    zone: "General Residential Zone — Schedule 1 (GRZ1)",
    overlays: [
      "Heritage Overlay HO327 — Northcote Central Heritage Precinct",
      "Special Building Overlay (SBO) — part of rear yard, per published planning maps",
    ],
    responsibleAuthority: "City of Darebin",
  },
  // 4 Notices
  notice41: "Not applicable — no notices, orders, declarations, reports or recommendations of a public authority directly and currently affecting the land of which the vendor is aware.",
  agriculturalChemicals:
    "Not applicable — the land is residential and is not used for agricultural purposes.",
  compulsoryAcquisition:
    "Not applicable — no notice of intention to acquire has been served under section 6 of the Land Acquisition and Compensation Act 1986.",
  // 5 Building permits (last 7 years)
  buildingPermits: [
    "Building Permit BP-2022-0488 issued 14 March 2022 by Darebin City Council — Construction of detached carport (approx. 18 m²) to side of dwelling. Final inspection certificate issued 09 August 2022.",
  ],
  ownersCorporationApplicable: false,
  gaicApplicable: false,
  // 8 Services connected?
  services: {
    electricity: true,
    gas: true,
    water: true,
    sewerage: true,
    telephone: true,
  },
  // 9 Title attachments
  titleAttachments: [
    "Register Search Statement for Volume 10234 Folio 567 (dated 14 April 2026)",
    "Copy of Plan of Subdivision PS812345K (diagram location)",
    "Copy of Instrument of Transfer H123456 (restrictive covenant)",
  ],
  // Attachments
  attachments: [
    "Register Search Statement — Volume 10234 Folio 567",
    "Plan of Subdivision PS812345K",
    "Instrument of Transfer H123456 (covenant)",
    "Land Information Certificate — City of Darebin (dated 10 April 2026)",
    "Yarra Valley Water Information Statement (dated 11 April 2026)",
    "Planning Property Report — Darebin Planning Scheme (dated 11 April 2026)",
    "Due Diligence Checklist (Consumer Affairs Victoria)",
    "Building Permit BP-2022-0488 and Certificate of Final Inspection",
  ],
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );

const mark = (b: boolean) =>
  b ? '<span class="chk">[X]</span>' : '<span class="chk">[ ]</span>';

function html(): string {
  const s = seed;
  return /* html */ `<!doctype html>
<html><head><meta charset="utf-8"/><title>Vendor Statement — Section 32 — POPULATED SEED</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html, body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color:#000; line-height: 1.35; }
  h1 { font-size: 22pt; margin: 0 0 6pt 0; font-weight: normal; }
  h2 { font-size: 13pt; margin: 16pt 0 6pt; font-weight: bold; text-transform: uppercase; }
  h3 { font-size: 10.5pt; margin: 10pt 0 3pt; font-weight: bold; }
  .seed-banner { background:#fff3cd; border:1px solid #b38f00; padding:4pt 6pt; font-size:9pt; margin-bottom:8pt; }
  .brand { display:flex; justify-content:space-between; font-size: 9pt; color:#555; margin-bottom:6pt; }
  table.box { border-collapse: collapse; width:100%; margin: 3pt 0; }
  table.box td, table.box th { border:1px solid #000; padding:5pt 7pt; font-size:10pt; vertical-align: top; }
  .label { font-weight: bold; width: 130px; }
  .chk { font-family: "Courier New", monospace; font-weight:bold; }
  ul { margin: 3pt 0 3pt 18pt; padding:0; }
  ol { margin: 3pt 0 3pt 18pt; padding:0; }
  li { margin: 2pt 0; }
  .page-break { page-break-before: always; }
  .note { font-size: 9pt; color: #333; font-style: italic; }
  .info-box { border:1px solid #000; padding:6pt 8pt; margin: 4pt 0; font-size:9.5pt; }
  table.services { border-collapse: collapse; width:100%; margin-top:4pt; }
  table.services td { border:1px solid #000; padding:5pt 8pt; text-align:center; font-size:9.5pt; }
</style></head>
<body>

<div class="brand"><span>Vendor Statement · Sale of Land Act 1962 (Vic) s 32</span><span>Generated ${new Date().toISOString().slice(0, 10)}</span></div>
<h1>Vendor Statement</h1>
<div class="seed-banner"><b>SEED DATA — NOT A REAL VENDOR STATEMENT.</b> Fictional. Generated for LAW pipeline E2E testing. Companion to SAMPLE-CONTRACT-OF-SALE-POPULATED.pdf (same property).</div>

<p>The vendor makes this statement in respect of the land in accordance with section 32 of the <i>Sale of Land Act 1962</i>.</p>
<p>This statement must be signed by the vendor and given to the purchaser before the purchaser signs the contract. The vendor may sign by electronic signature.</p>
<p>The purchaser acknowledges being given this statement signed by the vendor with the attached documents before the purchaser signed any contract.</p>

<table class="box">
  <tr><td class="label">Land</td><td>${esc(s.landAddress)}<br/>${esc(s.titleReference)} — ${esc(s.lotPlan)}<br/>Municipality: ${esc(s.municipality)}</td></tr>
</table>

<h3>Signed by the Vendor</h3>
<table class="box">
  ${s.vendors
    .map(
      (v) => `
  <tr><td class="label">Vendor's name</td><td>${esc(v.name)}</td><td class="label" style="width:60px">Date</td><td style="width:100px">${esc(v.date)}</td></tr>
  <tr><td class="label">Signature</td><td colspan="3"><i>(electronic signature applied)</i></td></tr>`,
    )
    .join("")}
</table>

<h3>Acknowledged by the Purchaser</h3>
<table class="box">
  ${s.purchasers
    .map(
      (p) => `
  <tr><td class="label">Purchaser's name</td><td>${esc(p.name)}</td><td class="label" style="width:60px">Date</td><td style="width:100px">${esc(p.date)}</td></tr>
  <tr><td class="label">Signature</td><td colspan="3"><i>(electronic signature applied)</i></td></tr>`,
    )
    .join("")}
</table>

<div class="info-box"><b>Important information.</b> This is a precedent vendor statement. The parties should check for any subsequent changes in the law and ensure all particulars are current as at the date the statement is given to the purchaser.</div>

<h2>1. Financial Matters</h2>
<h3>1.1 Particulars of any Rates, Taxes, Charges or Other Similar Outgoings (and any interest on them)</h3>
<p>Total does not exceed: <b>${esc(s.outgoingsTotal)}</b></p>
<ul>${s.outgoingsBreakdown.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>

<h3>1.2 Particulars of any Charge imposed by or under any Act to secure an amount due under that Act</h3>
<p>${esc(s.chargeOther)}</p>

<h3>1.3 Terms of Contract</h3>
<p>${esc(s.termsContract)}</p>

<h3>1.4 Sale Subject to Mortgage</h3>
<p>${esc(s.saleSubjectToMortgage)}</p>

<h2>2. Insurance</h2>
<h3>2.1 Damage and Destruction</h3>
<p>${esc(s.damageAndDestruction)}</p>
<h3>2.2 Owner-Builder</h3>
<p>${esc(s.ownerBuilder)}</p>
<p class="note">Note: There may be additional legislative obligations in respect of the sale of land on which there is a building on which building work has been carried out.</p>

<h2>3. Land Use</h2>
<h3>3.1 Easements, Covenants or Other Similar Restrictions</h3>
<ul>${s.easements.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>

<h3>3.2 Road Access</h3>
<p>${mark(s.roadAccessBlocked)} There is NO access to the property by road if the box is marked with an 'X'. (Access is via Acacia Avenue, a sealed public road.)</p>

<h3>3.3 Designated Bushfire Prone Area</h3>
<p>${mark(s.bushfireProneArea)} The land is in a designated bushfire prone area under section 192A of the Building Act 1993 if the box is marked with an 'X'.</p>

<h3>3.4 Planning Scheme</h3>
<p><b>Planning scheme:</b> ${esc(s.planning.scheme)}<br/>
<b>Zone:</b> ${esc(s.planning.zone)}<br/>
<b>Overlays:</b></p>
<ul>${s.planning.overlays.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
<p><b>Responsible authority:</b> ${esc(s.planning.responsibleAuthority)}</p>

<h2>4. Notices</h2>
<h3>4.1 Notice, Order, Declaration, Report or Recommendation</h3>
<p>${esc(s.notice41)}</p>
<h3>4.2 Agricultural Chemicals</h3>
<p>${esc(s.agriculturalChemicals)}</p>
<h3>4.3 Compulsory Acquisition</h3>
<p>${esc(s.compulsoryAcquisition)}</p>

<h2>5. Building Permits</h2>
<p class="note">Particulars of any building permit issued under the Building Act 1993 in the preceding 7 years (required only where there is a residence on the land).</p>
<ul>${s.buildingPermits.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>

<h2>6. Owners Corporation</h2>
<p>${s.ownersCorporationApplicable ? "Applicable — see attached OC certificate under section 151 of the Owners Corporations Act 2006." : "6.1 Not applicable — the land is not affected by an owners corporation within the meaning of the Owners Corporations Act 2006."}</p>

<h2 class="page-break">7. Growth Areas Infrastructure Contribution ("GAIC")</h2>
<p>${mark(s.gaicApplicable)} ${s.gaicApplicable ? "Applicable." : "Not applicable — the land is not within a contribution area under Part 9B of the Planning and Environment Act 1987."}</p>

<h2>8. Services</h2>
<p>The services which are marked with an 'X' in the accompanying box are NOT connected to the land:</p>
<table class="services">
  <tr>
    <td>Electric Supply ${mark(!s.services.electricity)}</td>
    <td>Gas supply ${mark(!s.services.gas)}</td>
    <td>Water supply ${mark(!s.services.water)}</td>
    <td>Sewerage ${mark(!s.services.sewerage)}</td>
    <td>Telephone services ${mark(!s.services.telephone)}</td>
  </tr>
</table>
<p class="note">All services are connected.</p>

<h2>9. Title</h2>
<p>Attached are copies of the following documents:</p>
<p><b>9.1(a) Registered Title.</b> A Register Search Statement and the document, or part of a document, referred to as the "diagram location" in that statement which identifies the land and its location.</p>
<ul>${s.titleAttachments.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>

<h2>10. Subdivision</h2>
<h3>10.1 Unregistered Subdivision</h3>
<p>Not applicable — the plan of subdivision PS812345K is registered.</p>
<h3>10.2 Staged Subdivision</h3>
<p>Not applicable.</p>
<h3>10.3 Further Plan of Subdivision</h3>
<p>Not applicable.</p>

<h2>11. Disclosure of Energy Information</h2>
<p class="note">(Disclosure of this information is not required under section 32 of the Sale of Land Act 1962 but may be included in this vendor statement for convenience.)</p>
<p>${mark(false)} Not applicable — the land contains a single-dwelling residence; it is not a "disclosure affected building" under the Building Energy Efficiency Disclosure Act 2010 (Cth).</p>

<h2>12. Due Diligence Checklist</h2>
<p class="note">The Consumer Affairs Victoria "Due Diligence Checklist" for home-buyers is attached for the convenience of the purchaser (see Attachments).</p>

<h2>13. Attachments</h2>
<ol>${s.attachments.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>

<p style="margin-top:18pt" class="note">End of Vendor Statement.</p>

</body></html>`;
}

async function main() {
  const out = path.resolve("C:/LAW/VIC-Section-32-Vendor-Statement-POPULATED.pdf");
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
