import { buildQuery, fetchOverpass, CANTON_ZH_BBOX } from "./overpass.ts";
import { normalize, type Court } from "./normalize.ts";
import { indoorHintsFromResponse } from "./indoor.ts";
import { reverseMany } from "./nominatim.ts";
import {
  writeCSV,
  writeGeoJSON,
  writeJson,
  writeMarkdownIndex,
} from "./export.ts";

async function main() {
  const query = buildQuery(CANTON_ZH_BBOX);
  console.log("[fetch] Querying Overpass...");
  console.log(query.split("\n").map((l) => `       ${l}`).join("\n"));
  console.log("");

  const started = Date.now();
  const resp = await fetchOverpass(query);
  const fetchedAt = new Date().toISOString();
  console.log(
    `[fetch] Got ${resp.elements.length} elements in ${Date.now() - started}ms`,
  );

  const hints = indoorHintsFromResponse(resp);
  console.log(`[indoor] ${hints.length} enclosing-hall candidates`);

  const courts = normalize(resp, { keepCanton: "ZH", indoorHints: hints });
  const indoorN = courts.filter((c) => c.indoor).length;
  console.log(
    `[normalize] ${courts.length} ZH courts after filter (${indoorN} indoor — ` +
      `${courts.filter((c) => c.indoorSource === "tag").length} by tag, ` +
      `${courts.filter((c) => c.indoorSource === "hall").length} by PIP)`,
  );

  await enrichWithNominatim(courts);

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

async function enrichWithNominatim(courts: Court[]): Promise<void> {
  const needsMuni = courts
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.municipality || !c.street);
  if (needsMuni.length === 0) return;
  console.log(
    `[nominatim] Reverse-geocoding ${needsMuni.length} courts (cached where possible)…`,
  );
  const points = needsMuni.map(({ c }) => ({ lat: c.lat, lon: c.lon }));
  const results = await reverseMany(points);
  for (let k = 0; k < needsMuni.length; k++) {
    const court = needsMuni[k]!.c;
    const r = results[k]!;
    if (!court.municipality && r.municipality) court.municipality = r.municipality;
    if (!court.street && r.road) court.street = r.road;
    if (!court.postcode && r.postcode) court.postcode = r.postcode;
  }
}

main().catch((err) => {
  console.error("\n[error]", err);
  process.exit(1);
});
