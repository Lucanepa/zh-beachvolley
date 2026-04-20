import { buildQuery, fetchOverpass, GREATER_ZURICH_BBOX } from "./overpass.ts";
import { normalize } from "./normalize.ts";
import {
  writeCSV,
  writeGeoJSON,
  writeJson,
  writeMarkdownIndex,
} from "./export.ts";

async function main() {
  const query = buildQuery(GREATER_ZURICH_BBOX);
  console.log("[fetch] Querying Overpass...");
  console.log(query.split("\n").map((l) => `       ${l}`).join("\n"));
  console.log("");

  const started = Date.now();
  const resp = await fetchOverpass(query);
  const fetchedAt = new Date().toISOString();
  console.log(
    `[fetch] Got ${resp.elements.length} elements in ${Date.now() - started}ms`,
  );

  const courts = normalize(resp);
  console.log(`[normalize] ${courts.length} unique courts after dedup\n`);

  writeJson("data/raw.json", { ...resp, _fetchedAt: fetchedAt });
  writeGeoJSON("data/courts.geojson", courts);
  writeCSV("data/courts.csv", courts);
  writeMarkdownIndex("data/INDEX.md", courts, { fetchedAt });

  console.log(`[export] Wrote:`);
  console.log(`  data/raw.json         (gitignored, full OSM response)`);
  console.log(`  data/courts.geojson   (${courts.length} features)`);
  console.log(`  data/courts.csv`);
  console.log(`  data/INDEX.md`);
}

main().catch((err) => {
  console.error("\n[error]", err);
  process.exit(1);
});
