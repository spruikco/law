#!/usr/bin/env tsx
/**
 * Fetch Victorian statute sections from AustLII and emit a Markdown corpus
 * file in the format consumed by `ingest.ts`.
 *
 * Only fetches a pre-declared list of sections per Act (we don't want to
 * crawl the whole site — lawyer review in README.md still applies).
 *
 * Usage:
 *   tsx packages/legislation/src/fetch-austlii.ts
 *
 * Writes to packages/legislation/corpus/<slug>.md
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = path.resolve(__dirname, "..", "corpus");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Throttle between AustLII requests (ms). Classic AustLII rate-limits hard.
 *  Override at runtime: `THROTTLE_MS=10000 tsx fetch-austlii.ts ...` */
const THROTTLE_MS = Number(process.env.THROTTLE_MS) || 4000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ActSpec {
  /** Friendly name used in citations (matches `act` in LegislationChunk) */
  act: string;
  /** AustLII path segment, e.g. "sola1962100" */
  slug: string;
  /** Sections to fetch, e.g. ["32", "32A", "33A"] */
  sections: string[];
  /** File name written under corpus/{jurisdiction}/ */
  out: string;
  /** Canonical url for citations */
  url: string;
  /** Version date — when we fetched this snapshot */
  versionDate: string;
  /** Where the corpus markdown is filed (controls subdir under `corpus/`).
   *  Defaults to "vic". */
  jurisdiction?: "vic" | "cth" | "nsw" | "qld" | "wa" | "sa" | "act" | "tas" | "nt";
  /** AustLII URL jurisdiction segment (the `vic`/`cth`/`nsw` between `/legis/`
   *  and `/consol_act/`). Defaults to `jurisdiction`. Override when an act is
   *  filed under one path on AustLII but applied/stored under another — e.g.
   *  the Legal Profession Uniform Law is filed at `/au/legis/nsw/consol_act/lpul333/`
   *  but applied as VIC law via LPULAA. */
  austliiJurisdiction?: string;
  /** If set, fetch this schedule file ONCE (e.g. "sch1.html") and split it into
   *  sections in memory. Use for big embedded schedules like NCC (Sch 1 of NCCPA)
   *  and ACL (Sch 2 of CCA) that AustLII serves as a single page. */
  scheduleFile?: string;
}

const TODAY = new Date().toISOString().slice(0, 10);

const ACTS: ActSpec[] = [
  {
    act: "Sale of Land Act 1962 (Vic)",
    slug: "sola1962100",
    sections: [
      "10", "10a", "10g",
      "27",
      "31",
      "32", "32a", "32b", "32c", "32d", "32e",
      "32f", "32g", "32h", "32i", "32j", "32k",
      "32l", "32m", "32n", "32o", "32p", "32q",
      "32r", "32s",
      "33a",
    ],
    out: "sale-of-land-act-1962.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/sale-land-act-1962",
    versionDate: TODAY,
  },
  {
    act: "Property Law Act 1958 (Vic)",
    slug: "pla1958179",
    sections: [
      "41",  // time of essence (drives sc-time-of-essence rule)
      "42",  // stipulations as to time
      "53",  // writing required for contracts re land
      "62",  // general words implied in conveyances (easements)
      "72",  // easements
      "73",  // restrictive covenants
    ],
    out: "property-law-act-1958.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/property-law-act-1958",
    versionDate: TODAY,
  },
  {
    act: "Owners Corporations Act 2006 (Vic)",
    slug: "oca2006260",
    sections: [
      "4",   // functions of OC
      "5",   // powers of OC
      "23",  // functions re levies (oc-active-special-levy)
      "24",  // setting fees
      "25",  // extraordinary fees
      "46",  // levying of fees
      "47",  // fees payable on purchase
      "49",  // enforcement of fees
      "146", // records of OC
      "147", // inspection of records
      "151", // owners corporation certificate (oc-flagged-future-obligation, oc-damage)
      "152", // contents of certificate
    ],
    out: "owners-corporations-act-2006.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/owners-corporations-act-2006",
    versionDate: TODAY,
  },
  {
    act: "Windfall Gains Tax Act 2021 (Vic)",
    slug: "wgta2021181",
    sections: [
      "1", "3",             // purposes + definitions
      "7", "8", "9", "10",  // imposition / liability (Part 2)
      "11", "12", "13",
      "37",                  // residential exemption
    ],
    out: "windfall-gains-tax-act-2021.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/windfall-gains-tax-act-2021",
    versionDate: TODAY,
  },
  {
    act: "Commercial and Industrial Property Tax Reform Act 2024 (Vic)",
    slug: "caiptra2024472",
    sections: [
      "1", "3",     // purposes + definitions
      "7",          // qualifying use
      "8", "9",     // entry transaction / liability
      "34",         // notice of change of use
    ],
    out: "commercial-industrial-property-tax-reform-act-2024.md",
    url: "https://www.legislation.vic.gov.au/as-made/acts/commercial-and-industrial-property-tax-reform-act-2024",
    versionDate: TODAY,
  },
  {
    act: "Duties Act 2000 (Vic)",
    slug: "da200093",
    sections: [
      "3",    // definitions
      "3f",   // who is a foreign purchaser (tax-foreign-purchaser-duty rule)
      "18a",  // foreign purchaser change-of-use duty
    ],
    out: "duties-act-2000.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/duties-act-2000",
    versionDate: TODAY,
  },
  {
    // RLA 2003 is Act No. 4/2003 (Vic) — AustLII slug follows <abbr><year><num> pattern.
    act: "Retail Leases Act 2003 (Vic)",
    slug: "rla2003135",
    sections: [
      "3",   // definitions
      "4",   // meaning of retail premises
      "11",  // disclosure statement (deprecated; replaced by s17)
      "17",  // disclosure statement required before lease entered
      "18",  // inducement information
      "21",  // duration / minimum 5 year term
      "23",  // prohibited payments (key money)
      "24",  // security bond / bank guarantee
      "28",  // option notice
      "35",  // rent reviews — methods
      "39",  // outgoings
      "40",  // estimate of outgoings
      "41",  // recoverable outgoings
      "46",  // annual outgoings statement
      "50",  // land tax apportionment
      "51",  // landlord's legal costs
      "52",  // repairs of capital nature
      "56",  // demolition clause
      "94",  // contracting out prohibited
    ],
    out: "retail-leases-act-2003.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/retail-leases-act-2003",
    versionDate: TODAY,
  },
  {
    act: "Land Tax Act 2005 (Vic)",
    slug: "lta200590",
    sections: [
      "3",    // definitions (taxable value, PPR)
      "7",    // imposition
      "46",   // assessments
      "54",   // principal place of residence exemption
    ],
    out: "land-tax-act-2005.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/land-tax-act-2005",
    versionDate: TODAY,
  },
  // ---------- Module 5: POA ----------
  {
    act: "Powers of Attorney Act 2014 (Vic)",
    slug: "poaa2014240",
    sections: [
      "1", "3",   // purposes + definitions
      "5",        // capacity
      "21", "22", // who may make a POA / decision-making capacity
      "33",       // formal requirements
      "34",       // explanation by witness
      "35",       // witnesses
      "41", "42", // attorney's acceptance, role
      "51",       // revocation
      "63",       // attorney must not act if conflict
      "78",       // VCAT review
    ],
    out: "powers-of-attorney-act-2014.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/powers-attorney-act-2014",
    versionDate: TODAY,
    jurisdiction: "vic",
  },
  // ---------- Module 6: Wills ----------
  {
    act: "Wills Act 1997 (Vic)",
    slug: "wa199791",
    sections: [
      "3",        // definitions
      "5", "6",   // age + capacity
      "7",        // execution
      "8", "8a",  // witness requirements + remote execution
      "9",        // informal-execution / dispensing power
      "12",       // revocation by marriage
      "13", "14", // effect of divorce
      "16",       // alterations
      "33",       // residue
    ],
    out: "wills-act-1997.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/wills-act-1997",
    versionDate: TODAY,
    jurisdiction: "vic",
  },
  // ---------- Module 6 cont. — family provision ----------
  {
    act: "Administration and Probate Act 1958 (Vic)",
    slug: "aapa1958259",
    sections: [
      "90",        // Pt IV definitions (eligible person)
      "91",        // family provision orders
      "91a",       // factors the Court must consider
      "96",        // claims period
      "97", "98",  // costs
      "99a",       // protection of personal representatives
    ],
    out: "administration-and-probate-act-1958.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/administration-and-probate-act-1958",
    versionDate: TODAY,
    jurisdiction: "vic",
  },
  // ---------- Module 7: conveyance — TLA ----------
  {
    act: "Transfer of Land Act 1958 (Vic)",
    slug: "tola1958160",
    sections: [
      "4",        // definitions
      "27",       // dealings — registration
      "40",       // priorities
      "42",       // estate of registered proprietor paramount (indefeasibility)
      "44",       // exceptions to indefeasibility
      "49",       // registration of personal representatives
      "60",       // adverse possession application
      "88",       // caveats
      "89a",      // removal of caveat by registrar
      "90",       // caveat to lapse after notice
    ],
    out: "transfer-of-land-act-1958.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/transfer-land-act-1958",
    versionDate: TODAY,
    jurisdiction: "vic",
  },
  // ---------- Lease deepening + conveyance: Building Act ----------
  {
    act: "Building Act 1993 (Vic)",
    slug: "ba199391",
    sections: [
      "3",         // definitions
      "16",        // offences re carrying out work
      "137a",      // domestic building work insurance
      "137b",      // insurance contract requirements
      "212",       // essential safety measures
    ],
    out: "building-act-1993.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/building-act-1993",
    versionDate: TODAY,
    jurisdiction: "vic",
  },
  // ---------- Modules 3, 8, 9: cost disclosure / trust / billing ----------
  // LPULAA itself (the VIC application act); LPUL substantive provisions live
  // in Schedule 1 to this act and are fetched separately below as a schedule.
  {
    act: "Legal Profession Uniform Law Application Act 2014 (Vic)",
    slug: "lpulaa2014406",
    sections: [
      "3",     // definitions
      "44",    // delegation
      "70",    // costs in civil claims
      "112",   // confidentiality
    ],
    out: "legal-profession-uniform-law-application-act-2014.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/legal-profession-uniform-law-application-act-2014",
    versionDate: TODAY,
    jurisdiction: "vic",
  },
  // ---------- Commonwealth: PPSA ----------
  {
    act: "Personal Property Securities Act 2009 (Cth)",
    slug: "ppsa2009356",
    sections: [
      "10",       // dictionary
      "12",       // meaning of security interest
      "19",       // attachment
      "20",       // enforceability vs third parties
      "21",       // perfection
      "55",       // priorities — main rule
      "62",       // PMSI super-priority
      "267",      // vesting on insolvency (the bit that bites)
    ],
    out: "personal-property-securities-act-2009.md",
    url: "https://www.legislation.gov.au/Series/C2009A00130",
    versionDate: TODAY,
    jurisdiction: "cth",
  },
  // ---------- Commonwealth: NCCP main act (NCC itself is Sch 1 — separate file) ----------
  {
    act: "National Consumer Credit Protection Act 2009 (Cth)",
    slug: "nccpa2009377",
    sections: [
      "5",       // dictionary
      "6",       // meaning of credit activity
      "29",      // engaging in credit activity without licence
    ],
    out: "national-consumer-credit-protection-act-2009.md",
    url: "https://www.legislation.gov.au/Series/C2009A00134",
    versionDate: TODAY,
    jurisdiction: "cth",
  },
  // ---------- LPUL (Sch 1 to LPULAA, but AustLII files it as a separate
  //            consol_act under NSW). We store it under VIC (where applied). ----------
  {
    act: "Legal Profession Uniform Law (Vic)",
    slug: "lpul333",
    sections: [
      // Definitions + structural
      "6",
      // Pt 4.2 — trust money
      "138", "139", "144", "145", "146", "147", "148", "149", "154",
      // Pt 4.3 — legal costs (cost disclosure, agreements, billing)
      "169", "172", "174", "175", "176", "177", "178", "179", "180",
      "181", "182", "185", "187", "188", "191", "194", "198",
    ],
    out: "legal-profession-uniform-law.md",
    url: "https://www.legislation.vic.gov.au/in-force/acts/legal-profession-uniform-law-application-act-2014/sch1",
    versionDate: TODAY,
    jurisdiction: "vic",
    austliiJurisdiction: "nsw",
  },
  // ---------- NCC (Sch 1 to NCCPA — single AustLII page, schedule mode) ----------
  {
    act: "National Credit Code (Cth)",
    slug: "nccpa2009377",
    sections: [
      "3", "4", "5",            // citation / parts / definitions
      "9",                       // contracts to which the Code applies
      "14",                      // form of credit contract (general)
      "16", "17",                // pre-contractual disclosure / matters in contract
      "23", "24", "25",          // interest, fees, charges
      "39", "40",                // assignment, variations
      "50",                      // interest charges
      "76", "77",                // unjust transactions
      "88",                      // default notice
      "110", "111", "112",       // mortgages
      "124", "125",              // guarantees
    ],
    out: "national-credit-code.md",
    url: "https://classic.austlii.edu.au/au/legis/cth/consol_act/nccpa2009377/sch1.html",
    versionDate: TODAY,
    jurisdiction: "cth",
    scheduleFile: "sch1.html",
  },
  // ---------- ACL (Sch 2 to CCA 2010 — single AustLII page, schedule mode) ----------
  {
    act: "Australian Consumer Law (Cth)",
    slug: "caca2010265",
    sections: [
      "2",                                // definitions
      "18",                               // misleading or deceptive conduct
      "20", "21", "22",                   // unconscionable conduct
      "23", "24", "25", "26", "27", "28", // unfair contract terms
      "29", "30", "33", "34",             // false / misleading representations
      "47", "48", "49",                   // consumer guarantees: title, undisturbed possession, undisclosed securities
      "51", "54", "55",                   // acceptable quality, fitness, supply by description
      "64",                               // contracting out prohibition
    ],
    out: "australian-consumer-law.md",
    url: "https://classic.austlii.edu.au/au/legis/cth/consol_act/caca2010265/sch2.html",
    versionDate: TODAY,
    jurisdiction: "cth",
    scheduleFile: "sch2.html",
  },
];

async function fetchSection(
  slug: string,
  section: string,
  jurisdiction: string,
): Promise<string> {
  const url = `https://classic.austlii.edu.au/au/legis/${jurisdiction}/consol_act/${slug}/s${section}.html`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

async function fetchSchedulePage(
  slug: string,
  scheduleFile: string,
  jurisdiction: string,
): Promise<string> {
  const url = `https://classic.austlii.edu.au/au/legis/${jurisdiction}/consol_act/${slug}/${scheduleFile}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

/** Split an AustLII schedule page (e.g. NCC at /sch1.html, ACL at /sch2.html)
 *  into per-section parsed sections. Schedule pages render the full text in a
 *  single page using `<p class="ActHead5">` markers per section, like:
 *    <p class="ActHead5"><a><span class="CharSectno">23</span> <span>Prohibited monetary obligations</span></a></p>
 *    <p class="subsection">(1) A credit contract ...</p>
 *    <p class="paragraph">(a) ...</p>
 *  Section body = everything between this marker and the next ActHead5 (or end). */
function parseScheduleSections(
  html: string,
): Array<{ number: string; title: string; body: string }> {
  const re = /<p[^>]*class="ActHead5"[^>]*>([\s\S]*?)<\/p>/gi;
  type Hit = { idx: number; len: number; number: string; title: string };
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const inner = m[1];
    const numMatch = inner.match(/class="CharSectno">\s*([0-9A-Z]+)/i);
    if (!numMatch) continue;
    const number = numMatch[1].trim().toUpperCase();
    const flatText = decodeEntities(stripTags(inner)).replace(/\s+/g, " ").trim();
    // Drop the leading section number from the title text.
    const title = flatText.replace(new RegExp(`^${number}\\s*`, "i"), "").trim();
    hits.push({ idx: m.index, len: m[0].length, number, title });
  }

  const out: Array<{ number: string; title: string; body: string }> = [];
  for (let i = 0; i < hits.length; i++) {
    const bodyStart = hits[i].idx + hits[i].len;
    const bodyEnd = i + 1 < hits.length ? hits[i + 1].idx : html.length;
    let body = html.slice(bodyStart, bodyEnd);
    // Drop intervening Part/Division/Subdivision headings — they belong between
    // sections and only add noise to the section's own body.
    body = body.replace(
      /<p[^>]*class="ActHead[1-4]"[^>]*>[\s\S]*?<\/p>/gi,
      "",
    );
    // Drop notes/footnote markers we don't need.
    body = body.replace(/<p[^>]*class="notemargin"[^>]*>[\s\S]*?<\/p>/gi, "");
    // Convert paragraph boundaries to newlines.
    body = body.replace(/<\/p\s*>/gi, "\n");
    body = body.replace(/<br\s*\/?>/gi, "\n");
    body = decodeEntities(stripTags(body));
    body = body
      .split(/\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0)
      .join("\n");
    out.push({ number: hits[i].number, title: hits[i].title, body });
  }
  return out;
}

/** Decode a minimal set of HTML entities found on AustLII pages. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function normaliseWhitespace(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

interface ParsedSection {
  number: string;   // "32", "32A"
  title: string;    // "Statement of matters affecting land being sold"
  body: string;     // cleaned paragraph text
}

/**
 * Parse one AustLII section page. The pages are hand-written HTML; the
 * stable anchors are:
 *   <H3> SALE OF LAND ACT 1962 - SECT 32 </H3>
 *   <B> Statement of matters affecting land being sold </B>
 *   <P> ... </P>
 * Footers we need to discard include the <!--sino noindex--> block and
 * any historical "inserted by No.X/YYYY" citation blocks.
 */
function parseSection(html: string): ParsedSection {
  // Grab the H3 (act name + section number).
  const h3Match = html.match(/<H3>\s*([\s\S]*?)\s*<\/H3>/i);
  if (!h3Match) throw new Error("No <H3> in section page");
  const h3 = normaliseWhitespace(stripTags(h3Match[1]));
  // "SALE OF LAND ACT 1962 - SECT 32A"
  const numMatch = h3.match(/SECT\s+([0-9A-Z]+)/i);
  const number = numMatch ? numMatch[1].toUpperCase() : h3;

  // The <B> immediately following the H3 is the section title.
  const afterH3 = html.slice(h3Match.index! + h3Match[0].length);
  const titleMatch = afterH3.match(/<B>\s*([\s\S]*?)\s*<\/B>/i);
  const title = titleMatch
    ? normaliseWhitespace(decodeEntities(stripTags(titleMatch[1])))
    : "";

  // Body: everything from end of the first <B> up to either the
  // "<!--sino noindex-->" marker or the final <HR> footer block.
  let body = titleMatch ? afterH3.slice(titleMatch.index! + titleMatch[0].length) : afterH3;
  const cut = body.search(/<!--sino noindex-->|<SMALL>[\s\S]*<\/SMALL>/i);
  if (cut > 0) body = body.slice(0, cut);

  // Discard historical-notes blocks (Arial <font> tags).
  body = body.replace(/<A\s+NAME=["']arial["']><\/A>[\s\S]*?<\/P>/gi, "");
  body = body.replace(/<P><font[\s\S]*?<\/font>\s*<\/P>/gi, "");

  // Convert paragraph boundaries to double-newlines.
  body = body.replace(/<\/P\s*>/gi, "\n\n");
  body = body.replace(/<BR\s*\/?>/gi, "\n");

  // Strip remaining tags and decode entities.
  body = decodeEntities(stripTags(body));
  body = body
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { number, title, body };
}

/** Parse an existing corpus markdown file into a map of upper-case section
 *  number -> full markdown block (heading + body). Lets us merge re-runs
 *  additively so a fresh 403 doesn't clobber a previously-fetched section. */
async function loadExistingSections(
  filepath: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let raw: string;
  try {
    raw = await readFile(filepath, "utf8");
  } catch {
    return out;
  }
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "");
  // Split on H2 boundaries; first chunk before any H2 is preamble (dropped).
  const blocks = body.split(/^(?=##\s)/m).filter((b) => b.startsWith("## "));
  for (const block of blocks) {
    const m = block.match(/^##\s+([\w()]+)/);
    if (!m) continue;
    out.set(m[1].toUpperCase(), block.trimEnd());
  }
  return out;
}

async function buildActMarkdown(
  spec: ActSpec,
  existing: Map<string, string>,
): Promise<string> {
  const parts: string[] = [];
  parts.push("---");
  parts.push(`act: ${spec.act}`);
  parts.push(`versionDate: ${spec.versionDate}`);
  parts.push(`url: ${spec.url}`);
  parts.push(`source: AustLII (classic) snapshot ${TODAY}`);
  parts.push("---");
  parts.push("");

  const corpusJur = spec.jurisdiction ?? "vic";
  const urlJur = spec.austliiJurisdiction ?? corpusJur;

  // Schedule mode: fetch the schedule page once, slice into sections.
  if (spec.scheduleFile) {
    const wanted = new Set(spec.sections.map((s) => s.toUpperCase()));
    let pageSections: Array<{ number: string; title: string; body: string }> = [];
    let fetchedOk = false;
    try {
      const html = await fetchSchedulePage(spec.slug, spec.scheduleFile, urlJur);
      pageSections = parseScheduleSections(html);
      fetchedOk = true;
      console.log(`  schedule: ${pageSections.length} sections found in ${spec.scheduleFile}`);
    } catch (err) {
      console.warn(`  schedule fetch failed (${(err as Error).message}) — falling back to existing`);
    }
    const found = new Map<string, { number: string; title: string; body: string }>();
    if (fetchedOk) {
      for (const p of pageSections) {
        if (!wanted.has(p.number)) continue;
        found.set(p.number, p);
      }
    }
    for (const s of spec.sections) {
      const key = s.toUpperCase();
      const parsed = found.get(key);
      if (parsed) {
        const heading = parsed.title
          ? `## ${parsed.number} ${parsed.title}`
          : `## ${parsed.number}`;
        parts.push(heading);
        parts.push("");
        parts.push(parsed.body);
        parts.push("");
        console.log(`  s${parsed.number}: ${parsed.title.slice(0, 60)}`);
      } else if (existing.has(key)) {
        parts.push(existing.get(key)!);
        parts.push("");
        console.log(`  s${key}: (kept from previous fetch)`);
      } else {
        console.warn(`  s${key}: NOT FOUND in schedule`);
      }
    }
    await sleep(THROTTLE_MS);
    return parts.join("\n");
  }

  for (const s of spec.sections) {
    const key = s.toUpperCase();
    if (existing.has(key)) {
      parts.push(existing.get(key)!);
      parts.push("");
      console.log(`  s${key}: (kept from previous fetch)`);
      continue;
    }
    let parsed: ParsedSection | null = null;
    try {
      const html = await fetchSection(spec.slug, s, urlJur);
      parsed = parseSection(html);
    } catch (err) {
      console.warn(`  s${key}: SKIP (${(err as Error).message})`);
      await sleep(THROTTLE_MS);
      continue;
    }
    const heading = parsed.title
      ? `## ${parsed.number} ${parsed.title}`
      : `## ${parsed.number}`;
    parts.push(heading);
    parts.push("");
    parts.push(parsed.body);
    parts.push("");
    console.log(`  s${parsed.number}: ${parsed.title.slice(0, 60)}`);
    await sleep(THROTTLE_MS);
  }

  return parts.join("\n");
}

async function main() {
  // Optional CLI filter: `tsx fetch-austlii.ts wills-act-1997.md retail-leases-act-2003.md`
  const onlyOuts = new Set(process.argv.slice(2));
  for (const spec of ACTS) {
    if (onlyOuts.size > 0 && !onlyOuts.has(spec.out)) continue;
    const jur = spec.jurisdiction ?? "vic";
    const dir = path.join(CORPUS_ROOT, jur);
    await mkdir(dir, { recursive: true });
    console.log(`\n${spec.act}  [${jur}]`);
    const out = path.join(dir, spec.out);
    const existing = await loadExistingSections(out);
    const md = await buildActMarkdown(spec, existing);
    await writeFile(out, md, "utf8");
    console.log(`  wrote ${out} (${md.length.toLocaleString()} chars)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
