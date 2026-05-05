#!/usr/bin/env tsx
/** Quick retrieval sanity check against the ingested legislation store. */
import "dotenv/config";
import { defaultStore } from "../lib/rag/store";

const QUERIES = [
  "What must a vendor disclose about mortgages or charges over the land?",
  "Owners corporation disclosure requirements in a section 32 statement",
  "Right of the purchaser to rescind if the section 32 statement is false",
  "Cooling-off rights under the Sale of Land Act",
  "Growth areas infrastructure contribution disclosure",
];

async function main() {
  const store = defaultStore();
  await store.load();
  console.log(`Store has ${store.size} chunks.\n`);

  for (const q of QUERIES) {
    console.log("Q:", q);
    const hits = await store.retrieve(q, { limit: 3 });
    for (const h of hits) {
      const preview = h.text.replace(/\s+/g, " ").slice(0, 100);
      console.log(`  [${h.score.toFixed(3)}] ${h.act} s${h.section} — ${preview}...`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
