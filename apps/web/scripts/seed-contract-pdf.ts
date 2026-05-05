#!/usr/bin/env tsx
/**
 * Generate a realistic populated Victorian Contract of Sale PDF for
 * end-to-end pipeline testing. Leaves the original VOID template untouched.
 *
 * Usage: npx tsx scripts/seed-contract-pdf.ts
 * Output: C:/LAW/SAMPLE-CONTRACT-OF-SALE-POPULATED.pdf
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// ---- Seed data (Victorian residential sale) ----------------------------
const seed = {
  vendorAgent: {
    name: "Nelson Alexander Pty Ltd (Northcote)",
    address: "382 High Street, Northcote VIC 3070",
    email: "northcote@nelsonalexander.com.au",
    ref: "NA-NTH-2026-0418",
    tel: "(03) 9480 4000",
    mob: "0412 884 221",
    fax: "(03) 9480 4099",
  },
  vendor: {
    name: "John Andrew Smith and Margaret Louise Smith",
    address: "42 Acacia Avenue, Northcote VIC 3070",
    abn: "",
    email: "jm.smith@example.com.au",
  },
  vendorLawyer: {
    name: "Coulter Legal",
    address: "Level 3, 200 Malop Street, Geelong VIC 3220",
    email: "conveyancing@coulterlegal.com.au",
    ref: "CL-26-0418-SM",
    tel: "(03) 5273 5273",
    mob: "0431 552 110",
    fax: "(03) 5273 5274",
  },
  purchaserAgent: {
    name: "",
    address: "",
    email: "",
    ref: "",
    tel: "",
    mob: "",
    fax: "",
  },
  purchaser: {
    name: "David Wei Chen and Emily Jane Chen",
    address: "7/14 Station Street, Fairfield VIC 3078",
    abn: "",
    email: "chenfamily2026@example.com",
  },
  purchaserLawyer: {
    name: "Maddocks",
    address: "Level 27, 140 William Street, Melbourne VIC 3000",
    email: "property@maddocks.com.au",
    ref: "MAD-2026-CHEN-042",
    tel: "(03) 9258 3555",
    fax: "(03) 9258 3666",
    dx: "DX 259 Melbourne",
  },
  titles: [
    { volume: "10234", folio: "567", lot: "1", plan: "PS812345K" },
    { volume: "", folio: "", lot: "", plan: "" },
    { volume: "", folio: "", lot: "", plan: "" },
  ],
  propertyAddress: "42 Acacia Avenue, Northcote VIC 3070",
  goods:
    "Fixed floor coverings, window furnishings and light fittings as inspected; " +
    "Bosch dishwasher; Westinghouse oven and cooktop; Daikin split-system air " +
    "conditioners (×3); garden shed; clothes line; TV wall mount in lounge.",
  price: "$1,285,000.00",
  deposit: "$128,500.00",
  depositBy: "05/05/2026",
  depositAlreadyPaid: "$5,000.00",
  balance: "$1,156,500.00",
  depositBondChecked: false,
  bankGuaranteeChecked: false,
  gstAddedChecked: false,
  gstFarmingChecked: false,
  gstGoingConcernChecked: false,
  gstMarginSchemeChecked: false,
  settlementDate: "30/06/2026",
  leaseChecked: false,
  leaseEnd: "",
  leaseOptions: "",
  leaseOptionYears: "",
  residentialTenancyChecked: false,
  residentialTenancyEnd: "",
  periodicTenancyChecked: false,
  termsContractChecked: false,
  loanChecked: true,
  loanLender: "Commonwealth Bank of Australia",
  loanAmount: "$900,000.00",
  loanApprovalDate: "26/05/2026",
  buildingReportChecked: true,
  pestReportChecked: true,
  purchaserSigned: "David Wei Chen; Emily Jane Chen",
  purchaserSignedDate: "21/04/2026",
  purchaserAuthority: "",
  offerLapseDays: "3",
  vendorSigned: "John Andrew Smith; Margaret Louise Smith",
  vendorSignedDate: "22/04/2026",
  vendorAuthority: "",
};

const cb = (checked: boolean) =>
  checked ? '<span class="cb">[X]</span>' : '<span class="cb">[ ]</span>';

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );

function html(): string {
  const s = seed;
  return /* html */ `<!doctype html>
<html><head><meta charset="utf-8"/><title>Contract of Sale of Land — POPULATED SEED</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html, body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; }
  h1 { font-size: 22pt; margin: 0 0 6pt 0; font-weight: normal; }
  h2 { font-size: 14pt; margin: 14pt 0 6pt; font-weight: bold; }
  h3 { font-size: 11pt; margin: 10pt 0 4pt; font-weight: bold; }
  .brand { display:flex; justify-content:space-between; font-size: 9pt; color:#555; margin-bottom:6pt; }
  .seed-banner { background:#fff3cd; border:1px solid #b38f00; padding:4pt 6pt; font-size:9pt; margin-bottom:8pt; }
  .field { display:flex; gap:6pt; margin:2pt 0; align-items:baseline; }
  .field .label { width: 130px; font-weight:bold; font-size: 9.5pt; }
  .field .value { border-bottom: 1px solid #000; flex:1; padding:1pt 2pt; min-height: 13pt; }
  .two-col { display:flex; gap:10pt; }
  .two-col > div { flex: 1; }
  table.titles { border-collapse: collapse; width:100%; margin-top:4pt; }
  table.titles th, table.titles td { border:1px solid #000; padding:4pt 6pt; font-size:9.5pt; text-align:left; }
  table.titles th { background:#eee; font-weight:bold; }
  .cb { font-family: "Courier New", monospace; font-weight:bold; }
  .row { margin: 4pt 0; }
  .indent { margin-left: 18pt; }
  .note { font-size: 8.5pt; color:#333; font-style: italic; }
  .sig-line { border-bottom: 1px solid #000; padding: 2pt 4pt; min-height: 14pt; margin: 3pt 0; }
  .page-break { page-break-before: always; }
  .small { font-size: 9pt; }
  .price { font-weight: bold; }
</style></head>
<body>

<div class="brand"><span>REIV · LAW INSTITUTE VICTORIA</span><span>© Copyright August 2019 — ELIV100A</span></div>
<h1>Contract of Sale of Land</h1>
<div class="seed-banner"><b>SEED DATA — NOT A REAL CONTRACT.</b> Generated ${new Date().toISOString().slice(0, 10)} for LAW pipeline E2E testing. Property, parties and all identifiers are fictional.</div>

<h2>Particulars of Sale</h2>

<h3>Vendor's estate agent</h3>
<div class="field"><div class="label">Name</div><div class="value">${esc(s.vendorAgent.name)}</div></div>
<div class="field"><div class="label">Address</div><div class="value">${esc(s.vendorAgent.address)}</div></div>
<div class="field"><div class="label">Email</div><div class="value">${esc(s.vendorAgent.email)}</div><div class="label" style="width:40px">Ref</div><div class="value">${esc(s.vendorAgent.ref)}</div></div>
<div class="field"><div class="label">Tel</div><div class="value">${esc(s.vendorAgent.tel)}</div><div class="label" style="width:40px">Mob</div><div class="value">${esc(s.vendorAgent.mob)}</div><div class="label" style="width:40px">Fax</div><div class="value">${esc(s.vendorAgent.fax)}</div></div>

<h3>Vendor</h3>
<div class="field"><div class="label">Name</div><div class="value">${esc(s.vendor.name)}</div></div>
<div class="field"><div class="label">Address</div><div class="value">${esc(s.vendor.address)}</div></div>
<div class="field"><div class="label">ABN/ACN</div><div class="value">${esc(s.vendor.abn) || "&nbsp;"}</div></div>
<div class="field"><div class="label">Email</div><div class="value">${esc(s.vendor.email)}</div></div>

<h3>Vendor's legal practitioner or conveyancer</h3>
<div class="field"><div class="label">Name</div><div class="value">${esc(s.vendorLawyer.name)}</div></div>
<div class="field"><div class="label">Address</div><div class="value">${esc(s.vendorLawyer.address)}</div></div>
<div class="field"><div class="label">Email</div><div class="value">${esc(s.vendorLawyer.email)}</div><div class="label" style="width:40px">Ref</div><div class="value">${esc(s.vendorLawyer.ref)}</div></div>
<div class="field"><div class="label">Tel</div><div class="value">${esc(s.vendorLawyer.tel)}</div><div class="label" style="width:40px">Mob</div><div class="value">${esc(s.vendorLawyer.mob)}</div><div class="label" style="width:40px">Fax</div><div class="value">${esc(s.vendorLawyer.fax)}</div></div>

<h3>Purchaser's estate agent</h3>
<div class="note">(not applicable — purchaser unrepresented by an agent)</div>

<h3>Purchaser</h3>
<div class="field"><div class="label">Name</div><div class="value">${esc(s.purchaser.name)}</div></div>
<div class="field"><div class="label">Address</div><div class="value">${esc(s.purchaser.address)}</div></div>
<div class="field"><div class="label">ABN/ACN</div><div class="value">${esc(s.purchaser.abn) || "&nbsp;"}</div></div>
<div class="field"><div class="label">Email</div><div class="value">${esc(s.purchaser.email)}</div></div>

<h3>Purchaser's legal practitioner or conveyancer</h3>
<div class="field"><div class="label">Name</div><div class="value">${esc(s.purchaserLawyer.name)}</div></div>
<div class="field"><div class="label">Address</div><div class="value">${esc(s.purchaserLawyer.address)}</div></div>
<div class="field"><div class="label">Email</div><div class="value">${esc(s.purchaserLawyer.email)}</div><div class="label" style="width:40px">Ref</div><div class="value">${esc(s.purchaserLawyer.ref)}</div></div>
<div class="field"><div class="label">Tel</div><div class="value">${esc(s.purchaserLawyer.tel)}</div><div class="label" style="width:40px">Fax</div><div class="value">${esc(s.purchaserLawyer.fax)}</div><div class="label" style="width:40px">DX</div><div class="value">${esc(s.purchaserLawyer.dx)}</div></div>

<h3>Land (general conditions 7 and 13)</h3>
<div class="small">The land is described in the table below –</div>
<table class="titles">
  <tr><th style="width:40%">Certificate of Title reference</th><th style="width:20%">being lot</th><th>on plan</th></tr>
  ${s.titles
    .map(
      (t) => `
  <tr><td>${t.volume ? `Volume ${esc(t.volume)} &nbsp; Folio ${esc(t.folio)}` : "Volume &nbsp;&nbsp;&nbsp; Folio"}</td><td>${esc(t.lot)}</td><td>${esc(t.plan)}</td></tr>`,
    )
    .join("")}
</table>
<div class="small" style="margin-top:4pt">The land includes all improvements and fixtures.</div>

<h3>Property address</h3>
<div class="field"><div class="value">${esc(s.propertyAddress)}</div></div>

<h3>Goods sold with the land (general condition 6.3(f))</h3>
<div class="field"><div class="value" style="min-height:28pt">${esc(s.goods)}</div></div>

<h3>Payment</h3>
<div class="field"><div class="label">Price</div><div class="value price">${esc(s.price)}</div></div>
<div class="field"><div class="label">Deposit</div><div class="value">${esc(s.deposit)}</div><div class="label" style="width:30px">by</div><div class="value">${esc(s.depositBy)}</div><div class="label" style="width:70px">of which</div><div class="value">${esc(s.depositAlreadyPaid)}</div><div class="small">has been paid</div></div>
<div class="field"><div class="label">Balance</div><div class="value price">${esc(s.balance)}</div><div class="small" style="margin-left:6pt">payable at settlement</div></div>

<h3>Deposit bond</h3>
<div class="row">${cb(s.depositBondChecked)} General condition 15 applies only if the box is checked.</div>

<h3>Bank guarantee</h3>
<div class="row">${cb(s.bankGuaranteeChecked)} General condition 16 applies only if the box is checked.</div>

<h3>GST (general condition 19)</h3>
<div class="row small">Subject to general condition 19.2, the price includes GST (if any), unless the next box is checked.</div>
<div class="row">${cb(s.gstAddedChecked)} GST (if any) must be paid in addition to the price if the box is checked.</div>
<div class="row indent">${cb(s.gstFarmingChecked)} Sale of land on which a 'farming business' is carried on (s 38-480 GST Act).</div>
<div class="row indent">${cb(s.gstGoingConcernChecked)} Sale of a 'going concern'.</div>
<div class="row indent">${cb(s.gstMarginSchemeChecked)} Margin scheme will be used to calculate GST.</div>

<h3>Settlement (general conditions 17 &amp; 26.2)</h3>
<div class="field"><div class="label">is due on</div><div class="value">${esc(s.settlementDate)}</div></div>

<h3>Lease (general condition 5.1)</h3>
<div class="row">${cb(s.leaseChecked)} At settlement the purchaser is entitled to vacant possession of the property unless the box is checked, in which case the property is sold subject to:</div>
<div class="row indent">${cb(false)} a lease for a term ending on _____ with _____ options to renew, each of _____ years</div>
<div class="row indent">${cb(s.residentialTenancyChecked)} a residential tenancy for a fixed term ending on _____</div>
<div class="row indent">${cb(s.periodicTenancyChecked)} a periodic tenancy determinable by notice</div>

<h3>Terms contract (general condition 30)</h3>
<div class="row">${cb(s.termsContractChecked)} This contract is intended to be a terms contract within the meaning of the Sale of Land Act 1962.</div>

<h3>Loan (general condition 20)</h3>
<div class="row">${cb(s.loanChecked)} This contract is subject to a loan being approved and the following details apply if the box is checked:</div>
<div class="field indent"><div class="label">Lender</div><div class="value">${esc(s.loanLender)}</div></div>
<div class="small indent">(or another lender chosen by the purchaser)</div>
<div class="field indent"><div class="label">Loan amount: no more than</div><div class="value">${esc(s.loanAmount)}</div><div class="label" style="width:100px">Approval date</div><div class="value">${esc(s.loanApprovalDate)}</div></div>

<h3>Building report</h3>
<div class="row">${cb(s.buildingReportChecked)} General condition 21 applies only if the box is checked.</div>

<h3>Pest report</h3>
<div class="row">${cb(s.pestReportChecked)} General condition 22 applies only if the box is checked.</div>

<div class="page-break"></div>
<h2>Signing of this Contract</h2>
<div class="small"><b>WARNING:</b> THIS IS A LEGALLY BINDING CONTRACT. YOU SHOULD READ THIS CONTRACT BEFORE SIGNING IT.</div>

<h3 style="margin-top:14pt">Signed by the Purchaser</h3>
<div class="sig-line"><i>(electronic signature — D. Chen / E. Chen)</i></div>
<div class="field"><div class="label">Dated</div><div class="value">${esc(s.purchaserSignedDate)}</div></div>
<div class="field"><div class="label">Print name(s)</div><div class="value">${esc(s.purchaserSigned)}</div></div>
<div class="field"><div class="label">Authority</div><div class="value">${esc(s.purchaserAuthority) || "&nbsp;"}</div></div>
<div class="row">This offer will lapse unless accepted within [ <b>${esc(s.offerLapseDays)}</b> ] clear business days (3 clear business days if none specified).</div>

<h3 style="margin-top:14pt">Signed by the Vendor</h3>
<div class="sig-line"><i>(electronic signature — J. Smith / M. Smith)</i></div>
<div class="field"><div class="label">Dated</div><div class="value">${esc(s.vendorSignedDate)}</div></div>
<div class="field"><div class="label">Print name(s)</div><div class="value">${esc(s.vendorSigned)}</div></div>
<div class="field"><div class="label">Authority</div><div class="value">${esc(s.vendorAuthority) || "&nbsp;"}</div></div>
<div class="row"><b>DAY OF SALE:</b> ${esc(s.vendorSignedDate)} (date by which both parties have signed).</div>

<h2 class="page-break">Special Conditions</h2>
<ol class="small" style="line-height:1.5">
  <li><b>Subject to finance (extends GC 20).</b> This contract is subject to the purchaser obtaining unconditional loan approval from the Commonwealth Bank of Australia for not less than <b>${esc(s.loanAmount)}</b> by <b>${esc(s.loanApprovalDate)}</b>. If approval is not obtained by that date the purchaser may end this contract by written notice accompanied by written evidence of non-approval.</li>
  <li><b>Building and pest reports (extends GC 21, 22).</b> The purchaser may end this contract within 14 days of the day of sale if a report from a registered building practitioner or licensed pest control operator discloses a major defect or major infestation as defined in those general conditions.</li>
  <li><b>Vendor's disclosure &amp; Section 32 statement.</b> The purchaser acknowledges receipt of a section 32 statement prior to signing, including a copy of the register search statement, copy of plan PS812345K, council rates certificate, owners corporation certificate (if any), and water information statement.</li>
  <li><b>Owners corporation.</b> The property is <i>not</i> affected by an owners corporation.</li>
  <li><b>GST.</b> The sale is of established residential premises and input-taxed. No amount on account of GST is payable in addition to the price.</li>
  <li><b>Foreign resident capital gains withholding (GC 24).</b> The vendor will, at least 5 business days before settlement, deliver a current ATO clearance certificate covering the settlement date.</li>
  <li><b>GST withholding (GC 25).</b> The vendor warrants that the property is <i>not</i> new residential premises or potential residential land and the purchaser will not be required to pay an amount under section 14-250 of Schedule 1 to the Taxation Administration Act 1953 (Cth).</li>
  <li><b>Electronic settlement (GC 18).</b> Settlement will be conducted electronically via PEXA. Each party will be, or will engage, a subscriber.</li>
  <li><b>Nominee (GC 4).</b> The purchaser may nominate a substitute or additional transferee no later than 14 days before the due date for settlement. Any such nomination must be to a related entity only; the named purchaser remains personally liable.</li>
  <li><b>Pre-settlement inspection (GC 29).</b> Two pre-settlement inspections permitted, the last being no earlier than 48 hours before settlement, arranged through the vendor's agent.</li>
</ol>

<div class="page-break"></div>
<h2>General Conditions</h2>
<div class="small">The general conditions of this contract are the standard general conditions 1 – 35 published by the Law Institute of Victoria Limited and the Real Estate Institute of Victoria Ltd in August 2019 (ELIV100A), incorporated by reference. They govern, without limitation: electronic signature, liability of signatory, guarantee, nominee, encumbrances, vendor warranties, identity of land, services, consents, transfer and duty, release of security interest, builder warranty insurance, general law land, deposit, deposit bond, bank guarantee, settlement, electronic settlement, GST, loan, building report, pest report, adjustments, foreign resident capital gains withholding, GST withholding, time and co-operation, service, notices, inspection, terms contract, loss or damage before settlement, breach, interest, default notice and default not remedied.</div>

</body></html>`;
}

async function main() {
  const out = path.resolve("C:/LAW/SAMPLE-CONTRACT-OF-SALE-POPULATED.pdf");
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
