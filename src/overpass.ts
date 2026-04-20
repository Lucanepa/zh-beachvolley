// Overpass API: query construction + fetch with endpoint fallback.

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Canton Zürich (tight-ish rectangle; the spatial join in normalize.ts
 *  discards stragglers that leak in from the neighboring cantons). */
export const CANTON_ZH_BBOX: BBox = {
  south: 47.15,
  west: 8.37,
  north: 47.71,
  east: 8.99,
};

/** @deprecated Use {@link CANTON_ZH_BBOX}. Kept as an alias for any
 *  external script that imported the old name. */
export const GREATER_ZURICH_BBOX = CANTON_ZH_BBOX;

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

export function buildQuery(bbox: BBox = CANTON_ZH_BBOX): string {
  const { south, west, north, east } = bbox;
  const b = `${south},${west},${north},${east}`;
  // Courts + enclosing halls in one round-trip. Both `beach_volleyball`
  // and the legacy `beachvolleyball` spelling are accepted. Halls are
  // used in normalize.ts to infer indoor=true when the pitch itself
  // doesn't carry the tag (common in OSM).
  return `
[out:json][timeout:60];
(
  nwr["sport"="beach_volleyball"](${b});
  nwr["sport"="beachvolleyball"](${b});
  way["building"="sports_hall"](${b});
  relation["building"="sports_hall"](${b});
  way["leisure"="sports_centre"](${b});
  relation["leisure"="sports_centre"](${b});
);
out geom;
`.trim();
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
  members?: unknown[];
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s?: { timestamp_osm_base: string };
  elements: OverpassElement[];
}

export async function fetchOverpass(query: string): Promise<OverpassResponse> {
  const body = new URLSearchParams({ data: query });
  const errors: string[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "zh-beachvolley/0.1 (https://github.com/Lucanepa/zh-beachvolley)",
          "Accept": "application/json",
        },
        body,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as OverpassResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`  - ${endpoint}: ${msg}`);
      console.warn(`[overpass] ${endpoint} failed: ${msg}`);
    }
  }
  throw new Error(`All Overpass endpoints failed:\n${errors.join("\n")}`);
}
