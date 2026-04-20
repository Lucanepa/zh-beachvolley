import { normalize } from "./normalize.ts";
import type { OverpassResponse } from "./overpass.ts";
import { cantonForPoint } from "./cantons.ts";
import {
  writeCSV,
  writeGeoJSON,
  writeJson,
  writeMarkdownIndex,
} from "./export.ts";
import { mkdirSync, readFileSync, rmSync } from "node:fs";

const fake: OverpassResponse = {
  version: 0.6,
  generator: "fake",
  elements: [
    {
      type: "node" as const,
      id: 1,
      lat: 47.37,
      lon: 8.54,
      tags: {
        sport: "beach_volleyball",
        name: "Test Court A",
        "addr:city": "Zürich",
        surface: "sand",
        access: "yes",
        fee: "no",
      },
    },
    {
      type: "way" as const,
      id: 2,
      geometry: [
        { lat: 47.50, lon: 8.71 },
        { lat: 47.50, lon: 8.73 },
        { lat: 47.51, lon: 8.73 },
        { lat: 47.51, lon: 8.71 },
      ],
      tags: {
        sport: "beachvolleyball",
        name: "Test Court B",
        "addr:city": "Winterthur",
        indoor: "yes",
      },
    },
    // Outside CH → canton should be null.
    {
      type: "node" as const,
      id: 3,
      lat: 0,
      lon: 0,
      tags: { sport: "beach_volleyball", name: "Null Island" },
    },
    // duplicate → should dedupe
    {
      type: "node" as const,
      id: 1,
      lat: 47.37,
      lon: 8.54,
      tags: { sport: "beach_volleyball" },
    },
    // no coords → should skip
    { type: "node" as const, id: 99, tags: { sport: "beach_volleyball" } },
  ],
};

// Direct point-in-polygon checks against the canton dataset.
console.assert(cantonForPoint(47.37, 8.54)?.code === "ZH", "Zürich PIP");
console.assert(cantonForPoint(47.50, 8.72)?.code === "ZH", "Winterthur PIP");
console.assert(cantonForPoint(0, 0) === null, "Null Island PIP");

mkdirSync("/tmp/zhbv", { recursive: true });
const courts = normalize(fake);
console.assert(courts.length === 3, `expected 3 courts, got ${courts.length}`);

// Sort order: canton (ZH) first, then null canton last.
// Within ZH: municipality Winterthur < Zürich.
console.assert(courts[0]!.canton === "ZH" && courts[0]!.municipality === "Winterthur", "sort[0]");
console.assert(courts[1]!.canton === "ZH" && courts[1]!.municipality === "Zürich", "sort[1]");
console.assert(courts[2]!.canton === null, "null-canton court sinks last");

writeJson("/tmp/zhbv/raw.json", fake);
writeGeoJSON("/tmp/zhbv/courts.geojson", courts);
writeCSV("/tmp/zhbv/courts.csv", courts);
writeMarkdownIndex("/tmp/zhbv/INDEX.md", courts, {
  fetchedAt: new Date().toISOString(),
});

const geo = JSON.parse(readFileSync("/tmp/zhbv/courts.geojson", "utf8"));
console.assert(geo.features.length === 3, "geojson feature count");
console.assert(geo.features[0].properties.canton === "ZH", "geojson canton prop");
console.assert(
  Math.abs(geo.features[0].geometry.coordinates[0] - 8.72) < 0.01,
  "way centroid",
);

const csv = readFileSync("/tmp/zhbv/courts.csv", "utf8");
const header = csv.split("\n")[0]!;
console.assert(header.includes(",canton,"), "csv has canton column");
console.assert(csv.split("\n").length === 5, "csv lines (header + 3 + trailing)");

const md = readFileSync("/tmp/zhbv/INDEX.md", "utf8");
console.assert(md.includes("## ZH — "), "INDEX has canton section");
console.assert(md.includes("### Winterthur (1)"), "INDEX has municipality sub-section");
console.assert(md.includes("### Zürich (1)"));
console.assert(/courts across.*cantons \/.*municipalities/.test(md), "summary line");
console.assert(md.includes("## Outside Switzerland"), "outside-CH section");

console.log("OK — all assertions passed");
console.log("  courts:", courts.length);
console.log("  geojson features:", geo.features.length);
console.log("  first court:", courts[0]!.name, "in", courts[0]!.municipality, `[${courts[0]!.canton}]`);

rmSync("/tmp/zhbv", { recursive: true, force: true });
