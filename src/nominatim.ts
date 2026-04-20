// Reverse-geocode (lat, lon) → address parts using Nominatim (OSM).
//
// Nominatim usage policy:
//   - Max 1 request/second
//   - Valid User-Agent header required
//   - Heavy use expected to self-host; we're doing ~150 one-shot lookups
//     at fetch time, with results cached to data/nominatim-cache.json.
//
// See https://operations.osmfoundation.org/policies/nominatim/

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Reverse {
  road: string | null;
  suburb: string | null;       // neighbourhood / suburb
  municipality: string | null; // city / town / village / municipality
  postcode: string | null;
  state: string | null;
}

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT =
  "zh-beachvolley/0.1 (https://github.com/Lucanepa/zh-beachvolley; l.canepa@aequitax.pro)";
const MIN_GAP_MS = 1100; // 1 req/s with headroom

type CacheFile = Record<string, Reverse>;

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function loadCache(path: string): CacheFile {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CacheFile;
  } catch {
    return {};
  }
}

function saveCache(path: string, cache: CacheFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface NominatimResponse {
  address?: {
    road?: string;
    pedestrian?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    postcode?: string;
    state?: string;
  };
}

function extract(r: NominatimResponse): Reverse {
  const a = r.address ?? {};
  return {
    road: a.road ?? a.pedestrian ?? null,
    suburb: a.neighbourhood ?? a.suburb ?? null,
    municipality: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
    postcode: a.postcode ?? null,
    state: a.state ?? null,
  };
}

async function fetchReverse(lat: number, lon: number): Promise<Reverse> {
  const url =
    `${NOMINATIM_ENDPOINT}?lat=${lat}&lon=${lon}` +
    `&format=json&zoom=17&addressdetails=1&accept-language=de,en`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const body = (await res.json()) as NominatimResponse;
  return extract(body);
}

/**
 * Reverse-geocode many points with throttling + disk cache. Points whose
 * cache entry already exists are returned instantly; misses are fetched
 * serially with a ≥1.1 s gap between requests.
 */
export async function reverseMany(
  points: Array<{ lat: number; lon: number }>,
  opts: { cachePath: string } = { cachePath: "data/nominatim-cache.json" },
): Promise<Reverse[]> {
  const cache = loadCache(opts.cachePath);
  const results: Reverse[] = new Array(points.length);
  let lastFetch = 0;
  let hits = 0;
  let misses = 0;
  let failures = 0;

  for (let i = 0; i < points.length; i++) {
    const { lat, lon } = points[i]!;
    const key = cacheKey(lat, lon);
    if (cache[key]) {
      results[i] = cache[key]!;
      hits++;
      continue;
    }

    const gap = lastFetch + MIN_GAP_MS - Date.now();
    if (gap > 0) await sleep(gap);
    lastFetch = Date.now();

    try {
      const r = await fetchReverse(lat, lon);
      cache[key] = r;
      results[i] = r;
      misses++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[nominatim] ${key}: ${msg} — skipping`);
      results[i] = {
        road: null, suburb: null, municipality: null,
        postcode: null, state: null,
      };
      failures++;
    }
  }

  if (misses > 0) saveCache(opts.cachePath, cache);
  console.log(
    `[nominatim] ${hits} cached, ${misses} fetched, ${failures} failed`,
  );
  return results;
}
