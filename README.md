# LAW — Legal Document Scanner (Victorian Property)

Scans Victorian Contracts of Sale + Section 32 Vendor Statements and drafts a lawyer-reviewable letter of advice.

See `C:\Users\ryesm\.claude\plans\indexed-leaping-mochi.md` for the full architecture plan.

## Stack

- Next.js 15 (App Router, TS, Tailwind)
- Anthropic SDK — Claude Sonnet 4.6 (extraction, drafting) + Opus 4.6 (compliance/risk)
- Supabase (Postgres + pgvector + Storage + Auth)
- Voyage embeddings for legislation RAG
- Playwright (PDF export) + `docx` (Word export)

## Layout

```
apps/web/          Next.js app
packages/schema/   Shared zod schemas
packages/legislation/   Legislation corpus ingestion
rules/             YAML rules — s32 disclosures, OC red flags, risky SCs, tax triggers
samples/           Sample PDFs for end-to-end testing (already present at repo root)
```

## Setup

```bash
cp .env.example .env.local   # fill in keys
npm install
npm run dev
```

## Pipeline

1. **Classify** — identify each uploaded PDF (CoS / s32 / OC cert / title search / land tax cert)
2. **Extract** — parallel tool calls → structured bundle
3. **Compliance** — iterate rules + RAG legislation → cited findings
4. **Risk** — conditions precedent, risky SCs, GC variations, tax
5. **Compose** — Opus 4.6 drafts A4 letter; stream to UI

## Status

See Linear PRJ-662 and sibling tickets (PRJ-656..661).
