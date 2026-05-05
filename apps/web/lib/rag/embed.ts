/**
 * Embedding wrapper — dev uses local BGE model via transformers.js,
 * production swaps in Voyage voyage-3-large with the same interface.
 *
 * BGE-base-en-v1.5 is 768-dim, handles 512 tokens per chunk, MIT-licensed,
 * strong on legal/technical text. Good enough to ship; swap to Voyage
 * once VOYAGE_API_KEY is provisioned.
 */

import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Transformers.js caches models under node_modules by default. Keep it in
// a stable location so dev reloads don't re-download.
env.cacheDir = process.env.TRANSFORMERS_CACHE ?? ".cache/transformers";

const MODEL_ID = "Xenova/bge-base-en-v1.5";
export const EMBED_DIMS = 768;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractorPromise ??= pipeline("feature-extraction", MODEL_ID, {
    dtype: "fp32",
  }) as Promise<FeatureExtractionPipeline>;
  return extractorPromise;
}

/** Embed one or more strings. Returns normalized vectors for cosine via dot-product. */
export async function embed(texts: string[]): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const output = await extractor(texts, {
    pooling: "mean",
    normalize: true,
  });
  // output.data is a flat Float32Array of shape [batch, dims]
  const flat = output.data as Float32Array;
  const batch = texts.length;
  const dims = flat.length / batch;
  const vecs: Float32Array[] = [];
  for (let i = 0; i < batch; i++) {
    vecs.push(flat.slice(i * dims, (i + 1) * dims));
  }
  return vecs;
}

/** Cosine similarity for already-normalised vectors is just dot product. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
