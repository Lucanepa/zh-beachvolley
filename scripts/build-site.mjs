#!/usr/bin/env node
// Copies data/courts.geojson → site/courts.geojson so the static viewer
// can fetch it relative to index.html. Run after `npm run fetch`.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = resolve(root, "data/courts.geojson");
const dstDir = resolve(root, "site");
const dst = resolve(dstDir, "courts.geojson");

if (!existsSync(src)) {
  console.error(
    `[build:site] ${src} not found — run \`npm run fetch\` first.`,
  );
  process.exit(1);
}

mkdirSync(dstDir, { recursive: true });
copyFileSync(src, dst);
console.log(`[build:site] ${src} → ${dst}`);
