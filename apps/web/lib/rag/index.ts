export { embed, cosine, EMBED_DIMS } from "./embed";
export {
  LegislationStore,
  defaultStore,
  type LegislationChunk,
  type RetrievedChunk,
} from "./store";

import { defaultStore, type RetrievedChunk } from "./store";

/** Convenience retrieve against the default store. */
export async function retrieve(
  query: string,
  opts: { limit?: number; filter?: { act?: string } } = {},
): Promise<RetrievedChunk[]> {
  return defaultStore().retrieve(query, opts);
}
