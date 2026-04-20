// Overpass API: query construction + fetch with endpoint fallback.

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Greater Zurich: Canton ZH + a buffer into AG / ZG / SZ / SG / TG / SH. */
export const GREATER_ZURICH_BBOX: BBox = {
  south: 47.1,
  west: 8.3,
  north: 47.8,
  east: 9.0,
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

export function buildQuery(bbox: BBox = GREATER_ZURICH_BBOX): string {
  const { south, west, north, east } = bbox;
  const b = `${south},${west},${north},${east}`;
  // Both tag spellings appear in the wild. `beach_volleyball` is the
  // wiki-blessed form; `beachvolleyball` still exists on older edits.
  return `
[out:json][timeout:60];
(
  nwr["sport"="beach_volleyball"](${b});
  nwr["sport"="beachvolleyball"](${b});
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
