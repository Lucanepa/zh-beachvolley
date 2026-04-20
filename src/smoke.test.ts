import { normalize } from "./normalize.ts";
import type { OverpassResponse } from "./overpass.ts";
import { cantonForPoint } from "./cantons.ts";
import { indoorHintsFromResponse } from "./indoor.ts";
import {
  writeCSV,
  writeGeoJSON,
  writeJson,
  writeMarkdownIndex,
} from "./export.ts";
import { mkdirSync, readFileSync, rmSync } from "node:fs";

// A tiny "sports hall" polygon centered on (47.38, 8.55) — a rectangle
// ~100 m on a side at Swiss latitudes.
const HALL_RING = [
  { lat: 47.3795, lon: 8.5495 },
  { lat: 47.3795, lon: 8.5505 },
  { lat: 47.3805, lon: 8.5505 },
  { lat: 47.3805, lon: 8.5495 },
  { lat: 47.3795, lon: 8.5495 },
];

const fake: OverpassResponse = {
  version: 0.6,
  generator: "fake",
  elements: [
    // ZH outdoor court with addr:city.
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
    // ZH (Winterthur area) court with explicit indoor=yes → source "tag".
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
    // Outside CH — should be filtered out by keepCanton: "ZH".
    {
      type: "node" as const,
      id: 3,
      lat: 0,
      lon: 0,
      tags: { sport: "beach_volleyball", name: "Null Island" },
    },
    // Court sitting inside the fake sports_hall below → source "hall".
    {
      type: "node" as const,
      id: 4,
      lat: 47.38,
      lon: 8.55,
      tags: { sport: "beach_volleyball", name: "Inside The Hall" },
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
    // Enclosing sports_hall. Not a court itself (no sport tag).
    {
      type: "way" as const,
      id: 1000,
      geometry: HALL_RING,
      tags: { building: "sports_hall", name: "Test Hall" },
    },
  ],
};

// Direct point-in-polygon checks against the canton dataset.
console.assert(cantonForPoint(47.37, 8.54)?.code === "ZH", "Zürich PIP");
console.assert(cantonForPoint(47.50, 8.72)?.code === "ZH", "Winterthur PIP");
console.assert(cantonForPoint(0, 0) === null, "Null Island PIP");

const hints = indoorHintsFromResponse(fake);
console.assert(hints.length === 1, `expected 1 indoor hint, got ${hints.length}`);
console.assert(hints[0]!.tags.building === "sports_hall", "hint is sports_hall");

mkdirSync("/tmp/zhbv", { recursive: true });
const courts = normalize(fake, { keepCanton: "ZH", indoorHints: hints });
console.assert(courts.length === 3, `expected 3 ZH courts, got ${courts.length}`);
console.assert(
  courts.every((c) => c.canton === "ZH"),
  "keepCanton filters to ZH only",
);

const byName = Object.fromEntries(courts.map((c) => [c.name, c]));
console.assert(byName["Test Court A"]!.indoor === false, "A: outdoor");
console.assert(byName["Test Court B"]!.indoor === true, "B: indoor");
console.assert(byName["Test Court B"]!.indoorSource === "tag", "B: indoor via tag");
console.assert(byName["Inside The Hall"]!.indoor === true, "D: indoor via hall PIP");
console.assert(byName["Inside The Hall"]!.indoorSource === "hall", "D: source=hall");

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
  "street" in geo.features[0].properties,
  "geojson has street prop",
);

const csv = readFileSync("/tmp/zhbv/courts.csv", "utf8");
const header = csv.split("\n")[0]!;
console.assert(header.includes(",canton,"), "csv has canton column");
console.assert(header.includes(",street,"), "csv has street column");

const md = readFileSync("/tmp/zhbv/INDEX.md", "utf8");
console.assert(md.includes("Canton of Zurich"), "INDEX title scoped to ZH");
console.assert(md.includes("## Winterthur (1)"), "muni promoted to ## (single canton)");
console.assert(md.includes("## Zürich (1)"));
console.assert(/courts across.*municipalities/.test(md), "summary line");
console.assert(
  md.includes("yes (inferred)") || md.includes("yes"),
  "INDEX marks indoor court",
);

console.log("OK — all assertions passed");
console.log("  courts:", courts.length);
console.log("  indoor:", courts.filter((c) => c.indoor).length);
console.log("  first court:", courts[0]!.name, "in", courts[0]!.municipality, `[${courts[0]!.canton}]`);

rmSync("/tmp/zhbv", { recursive: true, force: true });
