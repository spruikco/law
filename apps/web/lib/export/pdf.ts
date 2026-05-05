import type { Letter } from "@law/schema";
import { chromium, type Browser } from "playwright";
import { renderLetterHtml } from "./template";

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

/** Render a Letter to A4 PDF via headless Chromium. */
export async function renderLetterPdf(letter: Letter): Promise<Buffer> {
  const html = renderLetterHtml(letter);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    return pdf;
  } finally {
    await page.close();
  }
}
