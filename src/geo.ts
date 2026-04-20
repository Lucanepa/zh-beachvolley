// Shared geometry helpers: bounding boxes + point-in-polygon.
// Used by src/cantons.ts and src/indoor.ts.

export type Ring = [number, number][]; // [lon, lat] pairs
export type Polygon = Ring[]; // [outer, hole, hole, ...]
export type BBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

export function bboxOfPolygons(polys: Polygon[]): BBox {
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

export function pointInBBox(lon: number, lat: number, bbox: BBox): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/** Standard ray-casting point-in-ring. */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lon: number, lat: number, poly: Polygon): boolean {
  if (poly.length === 0) return false;
  if (!pointInRing(lon, lat, poly[0]!)) return false;
  for (let i = 1; i < poly.length; i++) {
    if (pointInRing(lon, lat, poly[i]!)) return false; // hole
  }
  return true;
}
