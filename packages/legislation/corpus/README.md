# Legislation corpus

Drop Markdown files here, one per Act (or per-section where the Act is large). They're chunked + embedded by `npm run ingest:legislation`.

## File format

Every file needs YAML front-matter:

```markdown
---
act: Sale of Land Act 1962 (Vic)
versionDate: 2025-07-01
url: https://www.legislation.vic.gov.au/in-force/acts/sale-land-act-1962
---

## 32 Vendor to give statement

(1) A vendor under a contract for the sale of land must give to the purchaser...

### 32(2)(a)

particulars of any mortgage...
```

- `## N Heading` becomes a chunk with `section=N`, `title=Heading`.
- `### Sub` becomes a child chunk under the current section.

## Required acts for bulletproof compliance (v1)

Download current-in-force text from https://www.legislation.vic.gov.au:

1. **Sale of Land Act 1962 (Vic)** — Division 2 / Section 32 family is the most critical. Also s 10A (off-the-plan), s 10G (land tax), s 27 (deposit), s 33A (due diligence).
2. **Property Law Act 1958 (Vic)** — s 41 (time of the essence), Part IV (easements).
3. **Owners Corporations Act 2006 (Vic)** — Part 6 (records/certificates), s 23 (levies), s 151 (disclosure requirements).
4. **Land Tax Act 2005 (Vic)** — assessment + rates relevant to adjustment clauses.
5. **Windfall Gains Tax Act 2021 (Vic)** — Part 2 (imposition).
6. **Commercial and Industrial Property Tax Reform Act 2024 (Vic)** — whole Act.
7. **Duties Act 2000 (Vic)** — s 3F (foreign purchaser additional duty) and Part 5 (duty on property).

## Also recommended

- **LIV/REIV Contract of Sale of Real Estate** — current general-conditions template. Get the PDF from LIV.
- **Form 1 prescribed under Sale of Land (General) Regulations 2024 (Vic)** — the s32 vendor statement template.

## Process

1. Download PDFs / text from legislation.vic.gov.au.
2. Convert to Markdown. Clean converters: `pandoc` for PDF→md, or hand-edit.
3. Normalise headings so `## 32`, `### 32(2)(a)` etc. — the chunker relies on these.
4. Save as e.g. `sale-of-land-act-1962.md` in this directory.
5. Run `npm run ingest:legislation` from repo root.

## ⚠️ LAWYER REVIEW REQUIRED

The corpus is the citation source for every compliance finding. It MUST match current-in-force text. Do not ship to production without a lawyer signing off that the ingested texts are current.
