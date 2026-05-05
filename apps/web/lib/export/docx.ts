import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import type { Letter, LetterSection } from "@law/schema";

/** Render a Letter to a Word document. */
export async function renderLetterDocx(letter: Letter): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: "Letter of Advice",
          bold: true,
          size: 28,
          font: "Helvetica",
        }),
      ],
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" },
      },
      children: [
        new TextRun({
          text: `${letter.propertyAddress}    ${formatDate(letter.date)}`,
          size: 18,
          color: "555555",
          font: "Helvetica",
        }),
      ],
      spacing: { after: 300 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Dear ${letter.clientName},` })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Re: Proposed purchase of ${letter.propertyAddress}`,
          bold: true,
          underline: {},
        }),
      ],
      spacing: { after: 200 },
    }),
  );

  for (const section of letter.sections) {
    children.push(...renderSection(section));
  }

  children.push(
    new Paragraph({
      children: [new TextRun({ text: "Yours faithfully," })],
      spacing: { before: 400, after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "_______________________________" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: "[Reviewing Solicitor]", size: 20 })],
      spacing: { after: 600 },
    }),
    new Paragraph({
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" },
      },
      children: [
        new TextRun({
          text: "This letter has been prepared with the assistance of an automated document review tool. It must be reviewed and signed off by the supervising solicitor before it is provided to the client. It is not legal advice unless and until the supervising solicitor adopts it.",
          size: 18,
          color: "666666",
          italics: true,
        }),
      ],
    }),
  );

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
          ],
        },
        {
          reference: "numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 twips
            margin: { top: 1360, right: 1247, bottom: 1360, left: 1247 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

function renderSection(section: LetterSection): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "EEEEEE" },
      },
      children: [
        new TextRun({ text: section.heading, bold: true, size: 24, font: "Helvetica" }),
      ],
    }),
  );
  out.push(...renderMarkdownBlocks(section.markdown));
  return out;
}

/**
 * Minimal markdown-to-docx converter for our own output.
 * Supports: paragraphs, `- ` / `* ` bullets, `1.` numbered lists, `**bold**`,
 * `*italic*`, and H3 (`### `) subheadings. That covers what the letter model
 * actually emits.
 */
function renderMarkdownBlocks(md: string): Paragraph[] {
  const lines = md.split(/\r?\n/);
  const blocks: Paragraph[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      blocks.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: h3[1], bold: true, size: 22 })],
        }),
      );
      i++;
      continue;
    }

    const bullet = line.match(/^(?:\s*)[-*]\s+(.+)$/);
    if (bullet) {
      while (i < lines.length && /^(?:\s*)[-*]\s+/.test(lines[i])) {
        const m = lines[i].match(/^(?:\s*)[-*]\s+(.+)$/)!;
        blocks.push(
          new Paragraph({
            numbering: { reference: "bullets", level: 0 },
            children: parseInline(m[1]),
          }),
        );
        i++;
      }
      continue;
    }

    const numbered = line.match(/^(?:\s*)(\d+)\.\s+(.+)$/);
    if (numbered) {
      while (i < lines.length && /^(?:\s*)\d+\.\s+/.test(lines[i])) {
        const m = lines[i].match(/^(?:\s*)\d+\.\s+(.+)$/)!;
        blocks.push(
          new Paragraph({
            numbering: { reference: "numbers", level: 0 },
            children: parseInline(m[1]),
          }),
        );
        i++;
      }
      continue;
    }

    // Paragraph — join continuation lines until a blank line or block boundary
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(?:\s*)[-*]\s+/.test(lines[i]) &&
      !/^(?:\s*)\d+\.\s+/.test(lines[i]) &&
      !/^###\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      new Paragraph({
        spacing: { after: 120 },
        children: parseInline(paraLines.join(" ")),
        alignment: AlignmentType.JUSTIFIED,
      }),
    );
  }

  return blocks;
}

function parseInline(text: string): ParagraphChild[] {
  // Split on **bold** and *italic* markers
  const runs: ParagraphChild[] = [];
  const tokenRx = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRx.exec(text)) !== null) {
    if (m.index > lastIdx) {
      runs.push(new TextRun(text.slice(lastIdx, m.index)));
    }
    const t = m[0];
    const stripped = t.replace(/^[*]{1,2}|[*]{1,2}$/g, "");
    const opts: IRunOptions = t.startsWith("**")
      ? { text: stripped, bold: true }
      : { text: stripped, italics: true };
    runs.push(new TextRun(opts));
    lastIdx = m.index + t.length;
  }
  if (lastIdx < text.length) runs.push(new TextRun(text.slice(lastIdx)));
  return runs.length === 0 ? [new TextRun(text)] : runs;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
