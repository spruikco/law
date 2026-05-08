import { existsSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

/**
 * Walk up from process.cwd() to find the monorepo root. Robust to whatever
 * cwd `next start` ends up with — `apps/web/` in dev, `apps/web/.run-qa/` on
 * Prodimus QA, etc. The root is recognised by having both `rules/` and
 * `apps/` as children.
 */
export function repoRoot(): string {
  if (cached) return cached;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "rules")) && existsSync(path.join(dir, "apps"))) {
      cached = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cached = path.resolve(process.cwd(), "..", "..");
  return cached;
}
