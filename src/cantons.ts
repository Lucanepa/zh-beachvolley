// Lazy-loaded Swiss canton polygons + point-in-polygon lookup.
// Source: data/swiss-cantons.geojson (produced by scripts/fetch-cantons.mjs).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export interface CantonProps {
  code: string; // ISO3166-2 suffix, e.g. "ZH"
  name: string; // English name where available
}

type Ring = [number, number][]; // [lon, lat] pairs
interface PrepCanton {
  code: string;
  name: string;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  polygons: Ring[][]; // list of polygons; each is [outer, ...holes]
}

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = resolve(here, "../data/swiss-cantons.geojson");

let cache: PrepCanton[] | null = null;
let cacheRaw: unknown = null;

function prepPolygon(coords: Ring[]): Ring[] {
  // GeoJSON Polygon is [outer, hole, hole, ...]. Keep as-is.
  return coords;
}

function bboxOfRings(polys: Ring[][]): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

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
        | { type: "Polygon"; coordinates: Ring[] }
        | { type: "MultiPolygon"; coordinates: Ring[][] };
    }>;
  };
  cacheRaw = fc;
  cache = fc.features.map((f) => {
    const polygons: Ring[][] =
      f.geometry.type === "Polygon"
        ? [prepPolygon(f.geometry.coordinates)]
        : f.geometry.coordinates.map(prepPolygon);
    return {
      code: f.properties.code,
      name: f.properties.name,
      bbox: bboxOfRings(polygons),
      polygons,
    };
  });
  return cache;
}

/** Reset the module cache — handy for tests. */
export function _resetCantonCache(): void {
  cache = null;
  cacheRaw = null;
}

/** Standard ray-casting point-in-polygon for one ring. */
function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, poly: Ring[]): boolean {
  if (poly.length === 0) return false;
  if (!pointInRing(lon, lat, poly[0]!)) return false;
  for (let i = 1; i < poly.length; i++) {
    if (pointInRing(lon, lat, poly[i]!)) return false; // in a hole
  }
  return true;
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
    const [minLon, minLat, maxLon, maxLat] = c.bbox;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    for (const poly of c.polygons) {
      if (pointInPolygon(lon, lat, poly)) {
        return { code: c.code, name: c.name };
      }
    }
  }
  return null;
}

// Silence unused-var warning for cacheRaw; it exists so we can debug-inspect.
void cacheRaw;
