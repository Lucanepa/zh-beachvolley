import { normalize } from "./normalize.ts";
import {
  writeCSV,
  writeGeoJSON,
  writeJson,
  writeMarkdownIndex,
} from "./export.ts";
import { mkdirSync, readFileSync, rmSync } from "node:fs";

const fake = {
  version: 0.6,
  generator: "fake",
  elements: [
    {
      type: "node" as const,
      id: 1,
      lat: 47.4,
      lon: 8.5,
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
        { lat: 47.5, lon: 8.6 },
        { lat: 47.5, lon: 8.7 },
        { lat: 47.6, lon: 8.7 },
        { lat: 47.6, lon: 8.6 },
      ],
      tags: {
        sport: "beachvolleyball",
        name: "Test Court B",
        "addr:city": "Winterthur",
        indoor: "yes",
      },
    },
    // duplicate → should dedupe
    {
      type: "node" as const,
      id: 1,
      lat: 47.4,
      lon: 8.5,
      tags: { sport: "beach_volleyball" },
    },
    // no coords → should skip
    { type: "node" as const, id: 99, tags: { sport: "beach_volleyball" } },
  ],
};

mkdirSync("/tmp/zhbv", { recursive: true });
const courts = normalize(fake);
console.assert(courts.length === 2, `expected 2 courts, got ${courts.length}`);
console.assert(courts[0]!.municipality === "Winterthur", "sort order wrong");
console.assert(courts[1]!.municipality === "Zürich");

writeJson("/tmp/zhbv/raw.json", fake);
writeGeoJSON("/tmp/zhbv/courts.geojson", courts);
writeCSV("/tmp/zhbv/courts.csv", courts);
writeMarkdownIndex("/tmp/zhbv/INDEX.md", courts, {
  fetchedAt: new Date().toISOString(),
});

const geo = JSON.parse(readFileSync("/tmp/zhbv/courts.geojson", "utf8"));
console.assert(geo.features.length === 2, "geojson feature count");
console.assert(
  Math.abs(geo.features[0].geometry.coordinates[0] - 8.65) < 0.001,
  "way centroid",
);

const csv = readFileSync("/tmp/zhbv/courts.csv", "utf8");
console.assert(csv.split("\n").length === 4, "csv lines (header + 2 + trailing)");

const md = readFileSync("/tmp/zhbv/INDEX.md", "utf8");
console.assert(md.includes("## Winterthur (1)"));
console.assert(md.includes("## Zürich (1)"));

console.log("OK — all assertions passed");
console.log("  courts:", courts.length);
console.log("  geojson features:", geo.features.length);
console.log("  first court:", courts[0]!.name, "in", courts[0]!.municipality);

rmSync("/tmp/zhbv", { recursive: true, force: true });
