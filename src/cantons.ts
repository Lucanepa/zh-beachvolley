// Lazy-loaded Swiss canton polygons + point-in-polygon lookup.
// Source: data/swiss-cantons.geojson (produced by scripts/fetch-cantons.mjs).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bboxOfPolygons,
  pointInBBox,
  pointInPolygon,
  type BBox,
  type Polygon,
} from "./geo.ts";

export interface CantonProps {
  code: string; // ISO3166-2 suffix, e.g. "ZH"
  name: string; // English name where available
}

interface PrepCanton {
  code: string;
  name: string;
  bbox: BBox;
  polygons: Polygon[]; // list of polygons; each is [outer, ...holes]
}

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = resolve(here, "../data/swiss-cantons.geojson");

let cache: PrepCanton[] | null = null;

/** Load and memoize the canton FeatureCollection. */
export function loadCantons(path: string = DEFAULT_PATH): PrepCanton[] {
  if (cache) return cache;
  const raw = readFileSync(path, "utf8");
  const fc = JSON.parse(raw) as {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: CantonProps;
      geometry:
        | { type: "Polygon"; coordinates: Polygon }
        | { type: "MultiPolygon"; coordinates: Polygon[] };
    }>;
  };
  cache = fc.features.map((f) => {
    const polygons: Polygon[] =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    return {
      code: f.properties.code,
      name: f.properties.name,
      bbox: bboxOfPolygons(polygons),
      polygons,
    };
  });
  return cache;
}

/** Reset the module cache — handy for tests. */
export function _resetCantonCache(): void {
  cache = null;
}

/**
 * Return the canton containing (lat, lon), or null if outside Switzerland /
 * on the border between features.
 */
export function cantonForPoint(
  lat: number,
  lon: number,
  cantons: PrepCanton[] = loadCantons(),
): { code: string; name: string } | null {
  for (const c of cantons) {
    if (!pointInBBox(lon, lat, c.bbox)) continue;
    for (const poly of c.polygons) {
      if (pointInPolygon(lon, lat, poly)) {
        return { code: c.code, name: c.name };
      }
    }
  }
  return null;
}
