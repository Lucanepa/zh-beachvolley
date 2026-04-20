#!/usr/bin/env node
// One-shot fetch of Swiss canton polygons from OSM via Overpass.
// Writes data/swiss-cantons.geojson. Commit the result — canton
// boundaries change ~never, so this script rarely needs to re-run.
//
// Usage: node scripts/fetch-cantons.mjs
//
// Dev deps: osmtogeojson, @turf/simplify (build-time only).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import osmtogeojson from "osmtogeojson";
import simplify from "@turf/simplify";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outPath = resolve(root, "data/swiss-cantons.geojson");

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

const QUERY = `
[out:json][timeout:180];
area["ISO3166-1"="CH"]->.ch;
relation["admin_level"="4"]["boundary"="administrative"](area.ch);
out geom;
`.trim();

async function fetchOverpass(query) {
  const body = new URLSearchParams({ data: query });
  const errors = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "zh-beachvolley/0.1 (https://github.com/Lucanepa/zh-beachvolley)",
          "Accept": "application/json",
        },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`  - ${endpoint}: ${msg}`);
      console.warn(`[overpass] ${endpoint} failed: ${msg}`);
    }
  }
  throw new Error(`All Overpass endpoints failed:\n${errors.join("\n")}`);
}

async function main() {
  console.log("[cantons] Querying Overpass for Swiss cantons…");
  const started = Date.now();
  const resp = await fetchOverpass(QUERY);
  console.log(
    `[cantons] Got ${resp.elements.length} elements in ${Date.now() - started}ms`,
  );

  const fc = osmtogeojson(resp);

  const features = [];
  for (const f of fc.features) {
    const p = f.properties ?? {};
    const tags = p.tags ?? p;
    if (tags.admin_level !== "4" || tags.boundary !== "administrative") continue;
    if (!f.geometry) continue;
    if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") continue;

    const code = tags.ref ?? tags["ISO3166-2"]?.split("-").pop() ?? null;
    const name = tags["name:en"] ?? tags.name ?? null;
    if (!code || !name) {
      console.warn(`[cantons] skipping feature with missing ref/name: ${JSON.stringify(tags).slice(0, 120)}`);
      continue;
    }

    // Simplify: ~0.001 tolerance is ~100m at Swiss latitudes, plenty for
    // point-in-polygon against court coordinates.
    const simplified = simplify(f, { tolerance: 0.001, highQuality: false });

    features.push({
      type: "Feature",
      properties: { code: String(code).toUpperCase(), name: String(name) },
      geometry: simplified.geometry,
    });
  }

  features.sort((a, b) => a.properties.code.localeCompare(b.properties.code));

  const out = { type: "FeatureCollection", features };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out) + "\n", "utf8");

  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log(
    `[cantons] Wrote ${outPath} — ${features.length} cantons, ${Math.round(
      bytes / 1024,
    )} KB`,
  );
  console.log(
    `  codes: ${features.map((f) => f.properties.code).join(", ")}`,
  );
}

main().catch((err) => {
  console.error("\n[error]", err);
  process.exit(1);
});
