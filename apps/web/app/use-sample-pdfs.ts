/**
 * Fetch one or more sample PDFs from /public/samples and return them as `File`
 * objects suitable for an upload form. Used by the "Use sample documents"
 * buttons on the PDF-ingest module pages.
 */
export async function fetchSamplePdfs(paths: string[]): Promise<File[]> {
  const out: File[] = [];
  for (const p of paths) {
    const url = p.startsWith("/") ? p : `/samples/${p}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load sample ${url}: ${res.status}`);
    const blob = await res.blob();
    const name = url.split("/").pop() || "sample.pdf";
    out.push(new File([blob], name, { type: "application/pdf" }));
  }
  return out;
}
