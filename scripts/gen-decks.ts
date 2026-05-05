/**
 * Generates two PowerPoint decks for LAW:
 *  1. Investor / technical pitch
 *  2. Law-firm sales pitch
 */
import PptxGenJS from "pptxgenjs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "decks");
mkdirSync(OUT_DIR, { recursive: true });

// Brand palette
const INK = "0F172A";        // zinc-900
const INK_SOFT = "334155";   // slate-700
const MUTED = "64748B";      // slate-500
const BG = "F8FAFC";         // zinc-50
const ACCENT = "2563EB";     // blue-600
const ACCENT_SOFT = "DBEAFE";// blue-100
const OK = "059669";         // emerald-600
const WARN = "D97706";       // amber-600

type SlideBuilder = (s: PptxGenJS.Slide, pres: PptxGenJS) => void;

function makeDeck(
  title: string,
  subject: string,
  slides: SlideBuilder[],
  outFile: string,
) {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
  pres.title = title;
  pres.subject = subject;
  pres.company = "LAW";
  pres.author = "LAW";

  // Master slide — footer
  pres.defineSlideMaster({
    title: "BASE",
    background: { color: "FFFFFF" },
    objects: [
      {
        rect: {
          x: 0,
          y: 7.15,
          w: 13.333,
          h: 0.02,
          fill: { color: ACCENT },
          line: { color: ACCENT, width: 0 },
        },
      },
      {
        text: {
          text: "LAW — Victorian property & lease review",
          options: {
            x: 0.4,
            y: 7.2,
            w: 8,
            h: 0.3,
            fontSize: 9,
            color: MUTED,
            fontFace: "Calibri",
          },
        },
      },
    ],
    slideNumber: {
      x: 12.7,
      y: 7.2,
      w: 0.4,
      h: 0.3,
      fontSize: 9,
      color: MUTED,
      fontFace: "Calibri",
    },
  });

  for (const build of slides) {
    const s = pres.addSlide({ masterName: "BASE" });
    build(s, pres);
  }

  const outPath = resolve(OUT_DIR, outFile);
  pres.writeFile({ fileName: outPath }).then(() => {
    console.log(`wrote ${outPath}`);
  });
}

// ---------- shared slide helpers ----------

function titleBar(s: PptxGenJS.Slide, eyebrow: string, title: string) {
  s.addText(eyebrow.toUpperCase(), {
    x: 0.6,
    y: 0.45,
    w: 12,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: ACCENT,
    fontFace: "Calibri",
    charSpacing: 3,
  });
  s.addText(title, {
    x: 0.6,
    y: 0.75,
    w: 12,
    h: 0.9,
    fontSize: 32,
    bold: true,
    color: INK,
    fontFace: "Calibri",
  });
  s.addShape("line", {
    x: 0.6,
    y: 1.7,
    w: 1.2,
    h: 0,
    line: { color: ACCENT, width: 2 },
  });
}

function bulletList(
  s: PptxGenJS.Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  bullets: { t: string; sub?: string }[],
) {
  const rows: PptxGenJS.TextProps[] = [];
  for (const b of bullets) {
    rows.push({
      text: b.t,
      options: {
        bullet: { type: "bullet", code: "25A0" },
        fontSize: 15,
        bold: true,
        color: INK,
        paraSpaceAfter: b.sub ? 2 : 10,
        paraSpaceBefore: 6,
      },
    });
    if (b.sub) {
      rows.push({
        text: b.sub,
        options: {
          fontSize: 13,
          color: INK_SOFT,
          indentLevel: 1,
          paraSpaceAfter: 10,
        },
      });
    }
  }
  s.addText(rows, {
    x,
    y,
    w,
    h,
    fontFace: "Calibri",
    valign: "top",
  });
}

function statTile(
  s: PptxGenJS.Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  big: string,
  label: string,
) {
  s.addShape("roundRect", {
    x,
    y,
    w,
    h,
    fill: { color: BG },
    line: { color: "E2E8F0", width: 1 },
    rectRadius: 0.1,
  });
  s.addText(big, {
    x,
    y: y + 0.15,
    w,
    h: h * 0.55,
    fontSize: 40,
    bold: true,
    color: ACCENT,
    align: "center",
    fontFace: "Calibri",
  });
  s.addText(label, {
    x,
    y: y + h * 0.62,
    w,
    h: h * 0.38,
    fontSize: 12,
    color: INK_SOFT,
    align: "center",
    fontFace: "Calibri",
  });
}

// ================================================================
// DECK 1 — INVESTOR / TECHNICAL PITCH
// ================================================================

const investorSlides: SlideBuilder[] = [
  // 1 — Title
  (s) => {
    s.background = { color: INK };
    s.addText("LAW", {
      x: 0.8,
      y: 2.3,
      w: 12,
      h: 1.2,
      fontSize: 72,
      bold: true,
      color: "FFFFFF",
      fontFace: "Calibri",
      charSpacing: 4,
    });
    s.addText("AI-first legal document review", {
      x: 0.8,
      y: 3.5,
      w: 12,
      h: 0.6,
      fontSize: 26,
      color: ACCENT_SOFT,
      fontFace: "Calibri",
    });
    s.addText(
      "A bulletproof-by-design pipeline for Victorian property & commercial lease documents.",
      {
        x: 0.8,
        y: 4.2,
        w: 10,
        h: 0.6,
        fontSize: 16,
        color: "94A3B8",
        fontFace: "Calibri",
      },
    );
    s.addText("Investor / technical overview · 2026", {
      x: 0.8,
      y: 6.7,
      w: 8,
      h: 0.4,
      fontSize: 12,
      color: "64748B",
      fontFace: "Calibri",
    });
  },

  // 2 — Problem
  (s) => {
    titleBar(s, "The problem", "Reading property docs is billable hours, not legal work.");
    bulletList(s, 0.6, 2.0, 12, 4.5, [
      {
        t: "Every Victorian property transaction & commercial lease involves 80–300 pages of dense, structured documents.",
        sub: "Contract of Sale + Section 32 Vendor Statement, LIV 2023 commercial lease + bespoke Additional Provisions schedules.",
      },
      {
        t: "Lawyers spend 2–4 hours per file on the mechanical first pass — extract, cross-check against legislation, flag adverse clauses, draft the advice letter.",
        sub: "Retail Leases Act 2003, Sale of Land Act 1962, Owners Corporations Act 2006, Windfall Gains Tax, Land Tax, C&I Property Tax Reform.",
      },
      {
        t: "That first pass is high-volume, rule-driven, and almost never the billable intellectual work — but it has to be bulletproof. Miss one mandatory s32 disclosure and the contract can be rescinded.",
      },
      {
        t: "Generic LLM tools fail: they hallucinate citations, miss items buried in tick-box grids, and can't be audited.",
      },
    ]);
  },

  // 3 — Product today
  (s) => {
    titleBar(s, "Product today", "Two live modules. Drag in PDFs. Get a lawyer-reviewable letter.");
    s.addShape("roundRect", {
      x: 0.6, y: 2.0, w: 6, h: 4.7,
      fill: { color: BG }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.12,
    });
    s.addText("Module 1", {
      x: 0.9, y: 2.15, w: 5.5, h: 0.35, fontSize: 11, bold: true, color: ACCENT,
      charSpacing: 2, fontFace: "Calibri",
    });
    s.addText("Section 32 & Contract of Sale", {
      x: 0.9, y: 2.5, w: 5.5, h: 0.55, fontSize: 22, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(
      [
        { text: "• Classifies each uploaded PDF (CoS, S32, OC cert, title search, land tax)\n", options: { fontSize: 13, color: INK_SOFT } },
        { text: "• Extracts particulars, special conditions, services grid, OC details\n", options: { fontSize: 13, color: INK_SOFT } },
        { text: "• Runs every mandatory s32 disclosure as a rule, cites SoLA section\n", options: { fontSize: 13, color: INK_SOFT } },
        { text: "• Drafts a letter of advice styled for the supervising solicitor", options: { fontSize: 13, color: INK_SOFT } },
      ],
      { x: 0.9, y: 3.1, w: 5.5, h: 3.5, fontFace: "Calibri", valign: "top" },
    );

    s.addShape("roundRect", {
      x: 6.8, y: 2.0, w: 6, h: 4.7,
      fill: { color: BG }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.12,
    });
    s.addText("Module 2", {
      x: 7.1, y: 2.15, w: 5.5, h: 0.35, fontSize: 11, bold: true, color: ACCENT,
      charSpacing: 2, fontFace: "Calibri",
    });
    s.addText("Victorian commercial lease review", {
      x: 7.1, y: 2.5, w: 5.5, h: 0.55, fontSize: 22, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(
      [
        { text: "• Retail vs non-retail classification under RLA s4\n", options: { fontSize: 13, color: INK_SOFT } },
        { text: "• Extracts items schedule, make-good, outgoings, ongoing $ obligations\n", options: { fontSize: 13, color: INK_SOFT } },
        { text: "• Flags tenant-adverse clauses against a catalogue of 16+ patterns\n", options: { fontSize: 13, color: INK_SOFT } },
        { text: "• Drafts polite-but-firm schedule of proposed amendments", options: { fontSize: 13, color: INK_SOFT } },
      ],
      { x: 7.1, y: 3.1, w: 5.5, h: 3.5, fontFace: "Calibri", valign: "top" },
    );
  },

  // 4 — Architecture diagram
  (s) => {
    titleBar(s, "Architecture", "Next.js front-to-back, Claude for LLM work, pgvector for citations.");
    const rowY = 2.3;
    const tiles: [string, string, string][] = [
      ["Upload", "Next.js App\nTailwind + shadcn", BG],
      ["Orchestration", "Server actions\nSSE progress", BG],
      ["LLM", "Claude Sonnet 4.6\nClaude Opus 4.6", ACCENT_SOFT],
      ["Structured", "Tool use +\nzod schemas", BG],
      ["RAG", "pgvector +\nBGE embeddings", ACCENT_SOFT],
      ["Rules", "YAML rule packs\nper act", BG],
    ];
    const w = 1.95, h = 1.4, gap = 0.1;
    const startX = 0.6;
    tiles.forEach(([label, body, fill], i) => {
      const x = startX + i * (w + gap);
      s.addShape("roundRect", {
        x, y: rowY, w, h,
        fill: { color: fill }, line: { color: "CBD5E1", width: 1 }, rectRadius: 0.08,
      });
      s.addText(label.toUpperCase(), {
        x, y: rowY + 0.1, w, h: 0.3,
        fontSize: 10, bold: true, color: ACCENT, align: "center", charSpacing: 2, fontFace: "Calibri",
      });
      s.addText(body, {
        x, y: rowY + 0.45, w, h: 0.9,
        fontSize: 12, color: INK, align: "center", fontFace: "Calibri",
      });
    });

    s.addText("Every pass persists structured output", {
      x: 0.6, y: 4.2, w: 12, h: 0.4,
      fontSize: 14, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(
      "Each of the 5 pipeline passes writes typed JSON to disk (via zod schema). That means we can (a) replay a single failing pass without re-running the whole job, (b) stream partial progress to the UI as soon as it's available, and (c) show the lawyer exactly what the model saw at each step.",
      {
        x: 0.6, y: 4.6, w: 12, h: 1.3,
        fontSize: 13, color: INK_SOFT, fontFace: "Calibri",
      },
    );
    s.addText("Storage: local cache for v0 → Supabase (Postgres + Storage) for multi-tenant.", {
      x: 0.6, y: 6.1, w: 12, h: 0.4,
      fontSize: 12, italic: true, color: MUTED, fontFace: "Calibri",
    });
  },

  // 5 — Pipeline
  (s) => {
    titleBar(s, "The 5-pass pipeline", "Deterministic structure, generative drafting, auditable at every step.");
    const passes = [
      ["1", "CLASSIFY", "Sonnet", "Identify each uploaded PDF — CoS vs S32 vs OC cert, retail vs non-retail lease under RLA s4."],
      ["2", "EXTRACT", "Sonnet + tools", "Parallel tool calls: particulars, special conditions, services grid, items, make-good, outgoings, ongoing obligations."],
      ["3", "COMPLIANCE", "Sonnet + rules + RAG", "Iterate every YAML rule; retrieve exact legislative section; cite back with verbatim quote."],
      ["4", "RISK / CLAUSES", "Opus + tools", "Classify each clause (standard / tenant-adverse / unusual), rate severity, draft proposed amendment."],
      ["5", "COMPOSE", "Opus streaming", "Generate the letter in structured sections, streamed to the UI as it writes."],
    ];
    let y = 2.05;
    passes.forEach(([num, label, model, body]) => {
      s.addShape("ellipse", {
        x: 0.6, y, w: 0.7, h: 0.7,
        fill: { color: ACCENT }, line: { color: ACCENT, width: 0 },
      });
      s.addText(num, {
        x: 0.6, y, w: 0.7, h: 0.7,
        fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: "Calibri",
      });
      s.addText(label, {
        x: 1.5, y: y + 0.02, w: 2.2, h: 0.35,
        fontSize: 14, bold: true, color: INK, charSpacing: 2, fontFace: "Calibri",
      });
      s.addText(model, {
        x: 1.5, y: y + 0.37, w: 2.2, h: 0.3,
        fontSize: 11, color: ACCENT, fontFace: "Calibri",
      });
      s.addText(body, {
        x: 3.8, y: y + 0.05, w: 9.2, h: 0.7,
        fontSize: 13, color: INK_SOFT, fontFace: "Calibri",
      });
      y += 1.0;
    });
  },

  // 6 — RAG
  (s) => {
    titleBar(s, "The RAG layer", "Bulletproof citations — every finding cites a real section of a real act.");
    statTile(s, 0.6, 2.0, 3.0, 1.6, "83", "chunks indexed");
    statTile(s, 3.8, 2.0, 3.0, 1.6, "8", "Victorian acts");
    statTile(s, 7.0, 2.0, 3.0, 1.6, "768", "dim BGE embeddings");
    statTile(s, 10.2, 2.0, 3.0, 1.6, "0", "external API calls");

    s.addText("Corpus (v1)", {
      x: 0.6, y: 3.9, w: 6, h: 0.4, fontSize: 14, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(
      [
        { text: "• Sale of Land Act 1962 (s32 family)\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• Retail Leases Act 2003 (19 sections, incl. s4, s94)\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• Owners Corporations Act 2006\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• Property Law Act 1958\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• Land Tax Act 2005\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• Windfall Gains Tax Act 2021\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• Commercial & Industrial Property Tax Reform Act 2024\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• LIV/REIV standard General Conditions", options: { fontSize: 12, color: INK_SOFT } },
      ],
      { x: 0.6, y: 4.3, w: 6, h: 2.3, fontFace: "Calibri", valign: "top" },
    );

    s.addText("Why local embeddings + chunk-by-section", {
      x: 7.0, y: 3.9, w: 6, h: 0.4, fontSize: 14, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(
      [
        { text: "• No data leaves the infrastructure for retrieval — client PDFs stay private\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• Chunks carry metadata: act, section, subsection, version date\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• The model quotes the retrieved text verbatim — no paraphrase drift\n", options: { fontSize: 12, color: INK_SOFT } },
        { text: "• Corpus refresh is a one-line script against AustLII — re-runnable", options: { fontSize: 12, color: INK_SOFT } },
      ],
      { x: 7.0, y: 4.3, w: 6, h: 2.3, fontFace: "Calibri", valign: "top" },
    );
  },

  // 7 — Defensibility
  (s) => {
    titleBar(s, "Why this is defensible", "Three layers the generic wrappers cannot replicate overnight.");
    const items: [string, string, string][] = [
      [
        "Rules, not vibes",
        "35+ YAML rules",
        "Every mandatory s32 disclosure and every tenant-adverse lease pattern is encoded as deterministic rule — the LLM runs the check but the coverage is hand-curated by practising lawyers. Guarantees zero-miss on mandatory items.",
      ],
      [
        "Legislation corpus",
        "Victorian specific",
        "Chunked by section, embedded locally, versioned to the date of the statute. Not a generic 'legal RAG' — purpose-built for the 8 acts that touch 95% of a property review.",
      ],
      [
        "Model orchestration",
        "Sonnet + Opus split",
        "Extraction & compliance on Sonnet (cheaper, structured, parallel). Risk classification & letter drafting on Opus (judgement, prose). Each pass re-runnable independently.",
      ],
    ];
    items.forEach(([h, tag, body], i) => {
      const x = 0.6 + i * 4.25, w = 4.05;
      s.addShape("roundRect", {
        x, y: 2.1, w, h: 4.6,
        fill: { color: BG }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.12,
      });
      s.addText(tag.toUpperCase(), {
        x: x + 0.25, y: 2.3, w: w - 0.5, h: 0.3,
        fontSize: 10, bold: true, color: ACCENT, charSpacing: 2, fontFace: "Calibri",
      });
      s.addText(h, {
        x: x + 0.25, y: 2.65, w: w - 0.5, h: 0.6,
        fontSize: 20, bold: true, color: INK, fontFace: "Calibri",
      });
      s.addText(body, {
        x: x + 0.25, y: 3.4, w: w - 0.5, h: 3.0,
        fontSize: 13, color: INK_SOFT, fontFace: "Calibri",
      });
    });
  },

  // 8 — Market
  (s) => {
    titleBar(s, "Market", "Small-to-mid Victorian property firms — a concentrated, accessible beach-head.");
    bulletList(s, 0.6, 2.0, 12, 4.5, [
      {
        t: "~2,500 practising Victorian property lawyers; ~180,000 property transactions per year in the state.",
        sub: "Every one of those generates a S32 + CoS review — the exact workflow this tool replaces the first pass of.",
      },
      {
        t: "Commercial lease reviews on top: every new tenancy, renewal, and assignment. Typically billed $1,500–$5,000 each.",
      },
      {
        t: "We sell minutes back to the lawyer. At $150–400/hr, a 2-hour saving pays for the tool for a month.",
      },
      {
        t: "Land-and-expand from Victoria to NSW/QLD is a legislation-corpus swap, not a rewrite — our architecture is jurisdiction-pluggable.",
      },
    ]);
  },

  // 9 — Roadmap
  (s) => {
    titleBar(s, "Roadmap", "Ship, harden, expand.");
    const phases = [
      ["NOW", "Shipped", OK, [
        "S32 / CoS module live",
        "Commercial lease module live",
        "8-act RAG corpus",
        "35+ YAML rules",
        "PDF + SSE progress UI",
      ]],
      ["NEXT", "Q2 2026", ACCENT, [
        "DOCX export with firm letterhead",
        "Multi-user auth (Supabase)",
        "OC cert deep-check",
        "Land tax cert handling",
        "Lawyer feedback loop → rule updates",
      ]],
      ["LATER", "H2 2026", MUTED, [
        "NSW / QLD corpus + rules",
        "Residential lease module",
        "Negotiation / redline suggestions",
        "Firm-level analytics dashboard",
      ]],
    ] as const;
    phases.forEach(([tag, h, color, items], i) => {
      const x = 0.6 + i * 4.25, w = 4.05;
      s.addShape("roundRect", {
        x, y: 2.1, w, h: 4.9,
        fill: { color: BG }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.12,
      });
      s.addText(tag, {
        x: x + 0.25, y: 2.3, w: w - 0.5, h: 0.35,
        fontSize: 11, bold: true, color, charSpacing: 3, fontFace: "Calibri",
      });
      s.addText(h, {
        x: x + 0.25, y: 2.65, w: w - 0.5, h: 0.5,
        fontSize: 18, bold: true, color: INK, fontFace: "Calibri",
      });
      s.addText(
        items.map((t) => ({
          text: t,
          options: { bullet: { code: "2022" }, fontSize: 13, color: INK_SOFT, paraSpaceAfter: 6 },
        })),
        { x: x + 0.25, y: 3.3, w: w - 0.5, h: 3.5, fontFace: "Calibri", valign: "top" },
      );
    });
  },

  // 10 — Ask / CTA
  (s) => {
    s.background = { color: INK };
    s.addText("THE ASK", {
      x: 0.8, y: 2.0, w: 12, h: 0.4,
      fontSize: 12, bold: true, color: ACCENT_SOFT, charSpacing: 3, fontFace: "Calibri",
    });
    s.addText("Back the pipeline that turns 3 hours of billable reading\ninto a 3-minute reviewable draft.", {
      x: 0.8, y: 2.5, w: 12, h: 1.8,
      fontSize: 28, bold: true, color: "FFFFFF", fontFace: "Calibri",
    });
    s.addText(
      [
        { text: "• Target ", options: { fontSize: 16, color: "CBD5E1" } },
        { text: "10 design-partner Victorian firms", options: { fontSize: 16, bold: true, color: "FFFFFF" } },
        { text: " in the next quarter.\n", options: { fontSize: 16, color: "CBD5E1" } },
        { text: "• Raise to fund ", options: { fontSize: 16, color: "CBD5E1" } },
        { text: "legislation corpus expansion + multi-tenant infra", options: { fontSize: 16, bold: true, color: "FFFFFF" } },
        { text: ".\n", options: { fontSize: 16, color: "CBD5E1" } },
        { text: "• Land-and-expand ", options: { fontSize: 16, color: "CBD5E1" } },
        { text: "to NSW & QLD", options: { fontSize: 16, bold: true, color: "FFFFFF" } },
        { text: " once the Victorian moat is priced in.", options: { fontSize: 16, color: "CBD5E1" } },
      ],
      { x: 0.8, y: 4.5, w: 12, h: 2.0, fontFace: "Calibri", valign: "top" },
    );
  },
];

// ================================================================
// DECK 2 — LAW FIRM SALES
// ================================================================

const firmSlides: SlideBuilder[] = [
  // 1 — Title
  (s) => {
    s.background = { color: "FFFFFF" };
    s.addShape("rect", {
      x: 0, y: 0, w: 0.25, h: 7.5,
      fill: { color: ACCENT }, line: { color: ACCENT, width: 0 },
    });
    s.addText("LAW", {
      x: 0.8, y: 2.0, w: 12, h: 1.0,
      fontSize: 56, bold: true, color: INK, fontFace: "Calibri", charSpacing: 3,
    });
    s.addText("Less time reading.\nMore time advising.", {
      x: 0.8, y: 3.0, w: 12, h: 1.8,
      fontSize: 36, bold: true, color: ACCENT, fontFace: "Calibri",
    });
    s.addText(
      "An AI assistant that reads a Section 32, a Contract of Sale, or a commercial lease\nin minutes — and hands you a draft letter you can sign off.",
      {
        x: 0.8, y: 5.0, w: 12, h: 1.2, fontSize: 16, color: INK_SOFT, fontFace: "Calibri",
      },
    );
    s.addText("Built for Victorian property lawyers · Always lawyer-reviewed", {
      x: 0.8, y: 6.6, w: 10, h: 0.4, fontSize: 12, color: MUTED, italic: true, fontFace: "Calibri",
    });
  },

  // 2 — Problem
  (s) => {
    titleBar(s, "The problem", "You know this file. 3 hours before you even pick up the phone.");
    bulletList(s, 0.6, 2.0, 12, 4.5, [
      {
        t: "A client forwards a Section 32 at 4pm and needs a go/no-go by morning.",
        sub: "You block out the evening, read every page, tick every mandatory disclosure against SoLA, draft a letter.",
      },
      {
        t: "A tenant client is handed a 90-page commercial lease with a 40-clause Additional Provisions schedule.",
        sub: "Somewhere in those clauses is a ratchet rent review, a bare-shell make-good, and a land tax pass-through. You need to find every one.",
      },
      {
        t: "The intellectual work is judging what to flag and how hard to push back. The mechanical work is everything before that — and it's most of the time.",
      },
    ]);
  },

  // 3 — In 60 seconds
  (s) => {
    titleBar(s, "What we do", "Drag in the PDFs. Get a lawyer-reviewable letter.");
    const steps: [string, string, string][] = [
      ["1", "Upload", "Drag the Contract, the Section 32 — or the lease + Additional Provisions — into your browser."],
      ["2", "Watch it work", "A live progress view shows each step: classify → extract → compliance check → risk analysis → letter."],
      ["3", "Review & refine", "Every finding cites the legislative section. Click into any clause to see the model's reasoning."],
      ["4", "Sign off", "Export the letter to PDF or DOCX. Sign off on what you'd sign off on anyway."],
    ];
    let y = 2.1;
    steps.forEach(([n, h, body]) => {
      s.addShape("ellipse", {
        x: 0.6, y, w: 0.8, h: 0.8,
        fill: { color: ACCENT_SOFT }, line: { color: ACCENT, width: 2 },
      });
      s.addText(n, {
        x: 0.6, y, w: 0.8, h: 0.8,
        fontSize: 22, bold: true, color: ACCENT, align: "center", valign: "middle", fontFace: "Calibri",
      });
      s.addText(h, {
        x: 1.6, y: y + 0.05, w: 11, h: 0.4,
        fontSize: 18, bold: true, color: INK, fontFace: "Calibri",
      });
      s.addText(body, {
        x: 1.6, y: y + 0.45, w: 11, h: 0.4,
        fontSize: 13, color: INK_SOFT, fontFace: "Calibri",
      });
      y += 1.15;
    });
  },

  // 4 — Module 1
  (s) => {
    titleBar(s, "Module 1 — Section 32 & Contract of Sale", "Every mandatory s32 disclosure, every time.");
    s.addText("What it catches", {
      x: 0.6, y: 2.1, w: 5.5, h: 0.4, fontSize: 14, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(
      [
        { text: "Missing or inconsistent Section 32 disclosures\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Conditions precedent (finance, inspection, pest)\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Special conditions — flagged by risk level\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Variations to standard general conditions\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Owners Corporation red-flags\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Windfall Gains / Land Tax / C&I Property triggers", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
      ],
      { x: 0.6, y: 2.5, w: 5.8, h: 4.0, fontFace: "Calibri", valign: "top" },
    );

    s.addShape("roundRect", {
      x: 6.8, y: 2.1, w: 6, h: 4.6,
      fill: { color: BG }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.12,
    });
    s.addText("SAMPLE LETTER EXTRACT", {
      x: 7.0, y: 2.25, w: 5.6, h: 0.3,
      fontSize: 10, bold: true, color: ACCENT, charSpacing: 2, fontFace: "Calibri",
    });
    s.addText("— Missing s32 disclosures", {
      x: 7.0, y: 2.55, w: 5.6, h: 0.4,
      fontSize: 15, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(
      "The Vendor Statement does not include a planning certificate under s32C(b) of the Sale of Land Act 1962 (Vic). " +
      "This is a mandatory disclosure. You are entitled to rescind the contract under s32K if this is not rectified before signing. " +
      "We recommend requesting the certificate before proceeding.",
      {
        x: 7.0, y: 3.0, w: 5.6, h: 3.5,
        fontSize: 12, color: INK_SOFT, italic: true, fontFace: "Calibri",
      },
    );
  },

  // 5 — Module 2
  (s) => {
    titleBar(s, "Module 2 — Commercial lease review", "LIV 2023 baseline. Polite-but-firm amendment drafts.");
    s.addText("What it catches", {
      x: 0.6, y: 2.1, w: 5.5, h: 0.4, fontSize: 14, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(
      [
        { text: "Retail vs non-retail under RLA s4\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Excessive make-good (bare shell, total strip)\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Uncapped outgoings & capital expense pass-through\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Ongoing financial obligations (guarantees, deposits)\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Ratchet rent reviews\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Unreasonable assignment / termination clauses\n", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
        { text: "Anything that conflicts with RLA s94 (no contracting out)", options: { fontSize: 13, color: INK_SOFT, bullet: { code: "2713" }, paraSpaceAfter: 6 } },
      ],
      { x: 0.6, y: 2.5, w: 5.8, h: 4.0, fontFace: "Calibri", valign: "top" },
    );

    s.addShape("roundRect", {
      x: 6.8, y: 2.1, w: 6, h: 4.6,
      fill: { color: BG }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.12,
    });
    s.addText("SAMPLE AMENDMENT", {
      x: 7.0, y: 2.25, w: 5.6, h: 0.3,
      fontSize: 10, bold: true, color: ACCENT, charSpacing: 2, fontFace: "Calibri",
    });
    s.addText("Clause 34 — Make good", {
      x: 7.0, y: 2.55, w: 5.6, h: 0.4,
      fontSize: 15, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(
      "As currently drafted the tenant must remove all fitout and return the premises to bare shell — including works approved and funded by the landlord. " +
      "We propose the tenant's make-good obligation be limited to removal of the tenant's own fitout only, with fair wear and tear excepted, " +
      "and that any landlord-approved works be treated as part of the premises at expiry.",
      {
        x: 7.0, y: 3.0, w: 5.6, h: 3.5,
        fontSize: 12, color: INK_SOFT, italic: true, fontFace: "Calibri",
      },
    );
  },

  // 6 — Auditable
  (s) => {
    titleBar(s, "Auditable by design", "Because it's a draft for YOU, not legal advice to the client.");
    bulletList(s, 0.6, 2.0, 12, 4.5, [
      {
        t: "Every compliance finding cites a specific section of a specific act.",
        sub: "Not 'the legislation says' — it says 'SoLA s32(2)(a)' with the verbatim text available on click.",
      },
      {
        t: "Every flagged clause shows WHY it was flagged.",
        sub: "Which rule triggered, what pattern matched, and what the model's reasoning was. No black-box findings.",
      },
      {
        t: "You can replay any single step without re-running the whole review.",
        sub: "If the classification was wrong, fix the classification. The rest of the pipeline re-runs in seconds.",
      },
      {
        t: "Every output is clearly marked DRAFT — subject to supervising solicitor sign-off.",
      },
    ]);
  },

  // 7 — Privacy & security
  (s) => {
    titleBar(s, "Privacy & security", "Client PDFs stay where they belong.");
    statTile(s, 0.6, 2.1, 3.0, 1.4, "AU", "data residency");
    statTile(s, 3.8, 2.1, 3.0, 1.4, "0", "training on your data");
    statTile(s, 7.0, 2.1, 3.0, 1.4, "TLS", "in transit");
    statTile(s, 10.2, 2.1, 3.0, 1.4, "AES", "at rest");

    bulletList(s, 0.6, 3.8, 12, 2.8, [
      {
        t: "Uploaded documents are processed per-review and deleted on your schedule.",
        sub: "Retention policy configurable at the firm level (default: 30 days, then purged).",
      },
      {
        t: "Legislation corpus runs on local embeddings — retrieval never leaves the infrastructure.",
      },
      {
        t: "Anthropic (Claude) API is contractually barred from training on enterprise inputs. We inherit that protection and pass it through.",
      },
    ]);
  },

  // 8 — Pricing
  (s) => {
    titleBar(s, "Pricing", "Simple. Per-seat. Cancel any time during the pilot.");
    const tiers: [string, string, string[], boolean][] = [
      ["Solo", "$249/mo per lawyer", [
        "Unlimited S32 reviews",
        "Unlimited commercial lease reviews",
        "PDF + DOCX export",
        "Email support",
      ], false],
      ["Firm", "$199/mo per seat", [
        "Everything in Solo",
        "5+ seats",
        "Firm letterhead templates",
        "Slack/Teams support",
        "Priority rule updates",
      ], true],
      ["Enterprise", "Talk to us", [
        "Custom letterhead & clause library",
        "SSO + audit log",
        "On-prem RAG option",
        "Dedicated onboarding",
      ], false],
    ];
    tiers.forEach(([name, price, items, featured], i) => {
      const x = 0.6 + i * 4.25, w = 4.05;
      s.addShape("roundRect", {
        x, y: 2.1, w, h: 4.8,
        fill: { color: featured ? INK : BG },
        line: { color: featured ? INK : "E2E8F0", width: 1 },
        rectRadius: 0.12,
      });
      s.addText(name.toUpperCase(), {
        x: x + 0.3, y: 2.3, w: w - 0.6, h: 0.35,
        fontSize: 11, bold: true, color: featured ? ACCENT_SOFT : ACCENT,
        charSpacing: 3, fontFace: "Calibri",
      });
      s.addText(price, {
        x: x + 0.3, y: 2.65, w: w - 0.6, h: 0.7,
        fontSize: 22, bold: true, color: featured ? "FFFFFF" : INK, fontFace: "Calibri",
      });
      s.addText(
        items.map((t) => ({
          text: t,
          options: {
            fontSize: 13,
            color: featured ? "CBD5E1" : INK_SOFT,
            bullet: { code: "2713" },
            paraSpaceAfter: 8,
          },
        })),
        { x: x + 0.3, y: 3.5, w: w - 0.6, h: 3.1, fontFace: "Calibri", valign: "top" },
      );
    });
    s.addText("All pilots start with a 30-day free trial, no card required.", {
      x: 0.6, y: 7.0, w: 12, h: 0.3,
      fontSize: 11, italic: true, color: MUTED, fontFace: "Calibri",
    });
  },

  // 9 — Onboarding
  (s) => {
    titleBar(s, "Getting started", "You'll be running your first review on a live file inside an hour.");
    const steps: [string, string][] = [
      ["Day 1", "Kick-off call — 30 min. We set up your firm account and load your letterhead template."],
      ["Day 1", "Your first review — we walk through a S32 or lease together, side-by-side."],
      ["Week 1", "Your team onboards. Each lawyer gets a 20-min intro — that's it."],
      ["Week 2+", "Feedback loop — any clause pattern your firm flags that we don't catch, we add to the rule pack."],
    ];
    let y = 2.2;
    steps.forEach(([tag, body]) => {
      s.addShape("roundRect", {
        x: 0.6, y, w: 1.5, h: 0.8,
        fill: { color: ACCENT_SOFT }, line: { color: ACCENT, width: 0 }, rectRadius: 0.1,
      });
      s.addText(tag, {
        x: 0.6, y, w: 1.5, h: 0.8,
        fontSize: 14, bold: true, color: ACCENT, align: "center", valign: "middle", fontFace: "Calibri",
      });
      s.addText(body, {
        x: 2.3, y: y + 0.1, w: 10.8, h: 0.6,
        fontSize: 15, color: INK, fontFace: "Calibri",
      });
      y += 1.1;
    });
  },

  // 10 — CTA
  (s) => {
    s.background = { color: ACCENT };
    s.addText("Book a 30-minute demo.", {
      x: 0.8, y: 2.2, w: 12, h: 1.2,
      fontSize: 44, bold: true, color: "FFFFFF", fontFace: "Calibri",
    });
    s.addText("We'll run it against one of YOUR files — not a canned example.", {
      x: 0.8, y: 3.6, w: 12, h: 0.6,
      fontSize: 20, color: ACCENT_SOFT, fontFace: "Calibri",
    });
    s.addText(
      [
        { text: "Email   ", options: { fontSize: 15, bold: true, color: "FFFFFF" } },
        { text: "hello@law-review.com.au\n\n", options: { fontSize: 15, color: ACCENT_SOFT } },
        { text: "Phone    ", options: { fontSize: 15, bold: true, color: "FFFFFF" } },
        { text: "(03) 0000 0000\n\n", options: { fontSize: 15, color: ACCENT_SOFT } },
        { text: "Book    ", options: { fontSize: 15, bold: true, color: "FFFFFF" } },
        { text: "law-review.com.au/demo", options: { fontSize: 15, color: ACCENT_SOFT } },
      ],
      { x: 0.8, y: 4.6, w: 12, h: 2.2, fontFace: "Calibri", valign: "top" },
    );
  },
];

// ---------- build both decks ----------
makeDeck(
  "LAW — Investor / technical overview",
  "AI-first legal document review — architecture, RAG, pipeline",
  investorSlides,
  "investor-deck.pptx",
);
makeDeck(
  "LAW — for Victorian property law firms",
  "Less time reading. More time advising.",
  firmSlides,
  "law-firm-deck.pptx",
);
