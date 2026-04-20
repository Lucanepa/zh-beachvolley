// Build enclosing-hall polygons from an Overpass response and test whether
// a court's centroid falls inside any of them. Used to infer indoor=true
// when the pitch itself doesn't carry the tag (common in OSM — halls tag
// the enclosing building/centre, not each pitch inside).

import type { OverpassElement, OverpassResponse } from "./overpass.ts";
import {
  bboxOfPolygons,
  pointInBBox,
  pointInPolygon,
  type BBox,
  type Polygon,
  type Ring,
} from "./geo.ts";

export interface IndoorHint {
  id: string;      // "way/123"
  tags: Record<string, string>;
  bbox: BBox;
  polygons: Polygon[];
}

function elementPolygons(el: OverpassElement): Polygon[] {
  // Overpass `out geom` on ways returns a flat geometry array; on relations
  // returns members with their own geometries. We handle both:
  //  - way with geometry: single polygon (one outer ring).
  //  - relation with `members`: assemble outer rings (skip inner for
  //    simplicity — good enough for enclosure test).
  if (el.type === "way" && el.geometry && el.geometry.length >= 3) {
    const ring: Ring = el.geometry.map((p) => [p.lon, p.lat]);
    // Close the ring if needed.
    if (
      ring.length > 0 &&
      (ring[0]![0] !== ring[ring.length - 1]![0] ||
        ring[0]![1] !== ring[ring.length - 1]![1])
    ) {
      ring.push([ring[0]![0], ring[0]![1]]);
    }
    return [[ring]];
  }
  if (el.type === "relation") {
    const rels = el as OverpassElement & {
      members?: Array<{ role?: string; geometry?: { lat: number; lon: number }[] }>;
    };
    const outers: Ring[] = [];
    for (const m of rels.members ?? []) {
      if (m.role !== "outer" || !m.geometry || m.geometry.length < 3) continue;
      const ring: Ring = m.geometry.map((p) => [p.lon, p.lat]);
      if (
        ring.length > 0 &&
        (ring[0]![0] !== ring[ring.length - 1]![0] ||
          ring[0]![1] !== ring[ring.length - 1]![1])
      ) {
        ring.push([ring[0]![0], ring[0]![1]]);
      }
      outers.push(ring);
    }
    return outers.map((r) => [r]);
  }
  return [];
}

export function indoorHintsFromResponse(
  resp: OverpassResponse,
): IndoorHint[] {
  const hints: IndoorHint[] = [];
  for (const el of resp.elements) {
    const tags = el.tags ?? {};
    const isHall =
      tags.building === "sports_hall" || tags.leisure === "sports_centre";
    if (!isHall) continue;
    const polygons = elementPolygons(el);
    if (polygons.length === 0) continue;
    hints.push({
      id: `${el.type}/${el.id}`,
      tags,
      bbox: bboxOfPolygons(polygons),
      polygons,
    });
  }
  return hints;
}

/** Return the first hint whose polygon contains (lat, lon), or null. */
export function enclosingHint(
  lat: number,
  lon: number,
  hints: IndoorHint[],
): IndoorHint | null {
  for (const h of hints) {
    if (!pointInBBox(lon, lat, h.bbox)) continue;
    for (const poly of h.polygons) {
      if (pointInPolygon(lon, lat, poly)) return h;
    }
  }
  return null;
}
