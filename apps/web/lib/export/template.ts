import { marked } from "marked";
import type { Letter } from "@law/schema";

const STYLES = `
  @page { size: A4; margin: 24mm 22mm; }
  * { box-sizing: border-box; }
  html, body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #111; line-height: 1.5; }
  body { margin: 0; }
  header { border-bottom: 1px solid #ccc; padding-bottom: 12px; margin-bottom: 24px; }
  header .firm { font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 700; font-size: 14pt; letter-spacing: 0.04em; text-transform: uppercase; }
  header .meta { display: flex; justify-content: space-between; font-size: 9.5pt; color: #555; margin-top: 6px; }
  .recipient { margin-bottom: 24px; }
  .subject { font-weight: 700; text-decoration: underline; margin: 18px 0 12px; }
  h2 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12pt; margin: 22px 0 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 14px 0 6px; }
  p { margin: 6px 0 10px; text-align: justify; }
  ul, ol { margin: 6px 0 12px; padding-left: 20px; }
  li { margin: 4px 0; }
  blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #444; font-style: italic; }
  strong { font-weight: 700; }
  .disclaimer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 9pt; color: #666; }
  .sig { margin-top: 28px; }
  .sig .line { width: 220px; border-bottom: 1px solid #333; height: 28px; }
  .sig .who { font-size: 10pt; margin-top: 4px; }
`;

export function renderLetterHtml(letter: Letter): string {
  const body = letter.sections
    .map((s) => `<h2>${escapeHtml(s.heading)}</h2>\n${marked.parse(s.markdown, { async: false })}`)
    .join("\n");

  const formattedDate = new Date(letter.date + "T00:00:00").toLocaleDateString(
    "en-AU",
    { day: "numeric", month: "long", year: "numeric" },
  );

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<title>Letter of Advice — ${escapeHtml(letter.clientName)}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <div class="firm">Letter of Advice</div>
  <div class="meta">
    <span>${escapeHtml(letter.propertyAddress)}</span>
    <span>${escapeHtml(formattedDate)}</span>
  </div>
</header>
<div class="recipient">
  <p>Dear ${escapeHtml(letter.clientName)},</p>
</div>
<div class="subject">Re: Proposed purchase of ${escapeHtml(letter.propertyAddress)}</div>
${body}
<div class="sig">
  <p>Yours faithfully,</p>
  <div class="line"></div>
  <div class="who">[Reviewing Solicitor]</div>
</div>
<div class="disclaimer">
  This letter has been prepared with the assistance of an automated document review tool.
  It must be reviewed and signed off by the supervising solicitor before it is provided
  to the client. It is not legal advice unless and until the supervising solicitor adopts it.
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
