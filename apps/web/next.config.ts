import type { NextConfig } from "next";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// Load the monorepo-root .env.local so the Next.js server runtime sees
// ANTHROPIC_API_KEY (and any future keys) without having to duplicate the
// file under apps/web/. `override: false` means a value set in apps/web/.env
// or the shell still wins.
loadEnv({ path: path.resolve(__dirname, "..", "..", ".env.local"), override: false });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
