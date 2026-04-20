import type { OverpassElement, OverpassResponse } from "./overpass.ts";
import { cantonForPoint } from "./cantons.ts";
import { enclosingHint, type IndoorHint } from "./indoor.ts";

export interface Court {
  id: string;               // "node/123" | "way/456" | "relation/789"
  osmType: "node" | "way" | "relation";
  osmId: number;
  osmUrl: string;
  name: string | null;
  operator: string | null;
  canton: string | null;      // ISO3166-2 suffix, e.g. "ZH"
  cantonName: string | null;  // English name where available
  municipality: string | null;
  street: string | null;      // populated via Nominatim enrichment
  postcode: string | null;
  lat: number;
  lon: number;
  access: string | null;    // "yes" | "customers" | "private" | "members" | ...
  indoor: boolean;
  indoorSource: "tag" | "hall" | null; // "tag" = pitch tag; "hall" = PIP into enclosing hall
  fee: boolean | null;
  surface: string | null;   // typically "sand"
  lit: boolean | null;
  website: string | null;
  phone: string | null;
  openingHours: string | null;
  tags: Record<string, string>;
}

export interface NormalizeOptions {
  /** If set, keep only courts whose canton code matches (e.g. "ZH"). */
  keepCanton?: string;
  /** Optional enclosing-hall polygons; courts inside one are flagged indoor. */
  indoorHints?: IndoorHint[];
}

function centroid(pts: { lat: number; lon: number }[]): { lat: number; lon: number } {
  const n = pts.length;
  const s = pts.reduce(
    (a, p) => ({ lat: a.lat + p.lat, lon: a.lon + p.lon }),
    { lat: 0, lon: 0 },
  );
  return { lat: s.lat / n, lon: s.lon / n };
}

function coords(el: OverpassElement): { lat: number; lon: number } | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center) return el.center;
  if (el.geometry && el.geometry.length > 0) return centroid(el.geometry);
  return null;
}

function parseBool(v: string | undefined): boolean | null {
  if (v == null) return null;
  const low = v.toLowerCase();
  if (["yes", "true", "1"].includes(low)) return true;
  if (["no", "false", "0"].includes(low)) return false;
  return null;
}

function isCourt(el: OverpassElement): boolean {
  const s = el.tags?.sport;
  return s === "beach_volleyball" || s === "beachvolleyball";
}

export function normalize(
  resp: OverpassResponse,
  opts: NormalizeOptions = {},
): Court[] {
  const { keepCanton, indoorHints = [] } = opts;
  const seen = new Set<string>();
  const courts: Court[] = [];
  for (const el of resp.elements) {
    if (!isCourt(el)) continue;
    const pos = coords(el);
    if (!pos) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = el.tags ?? {};
    const canton = cantonForPoint(pos.lat, pos.lon);

    let indoor = parseBool(tags.indoor) === true;
    let indoorSource: Court["indoorSource"] = indoor ? "tag" : null;
    if (!indoor && indoorHints.length > 0) {
      const hit = enclosingHint(pos.lat, pos.lon, indoorHints);
      // A sports_hall building, or any enclosing polygon tagged `indoor=yes`
      // / `covered=yes`, is evidence the court is indoor. leisure=sports_centre
      // without those tags covers outdoor venues too, so don't auto-flag.
      if (hit) {
        const ht = hit.tags;
        if (
          ht.building === "sports_hall" ||
          parseBool(ht.indoor) === true ||
          parseBool(ht.covered) === true
        ) {
          indoor = true;
          indoorSource = "hall";
        }
      }
    }

    courts.push({
      id,
      osmType: el.type,
      osmId: el.id,
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      name: tags.name ?? null,
      operator: tags.operator ?? null,
      canton: canton?.code ?? null,
      cantonName: canton?.name ?? null,
      municipality: tags["addr:city"] ?? tags["is_in:city"] ?? null,
      street: null,
      postcode: tags["addr:postcode"] ?? null,
      lat: pos.lat,
      lon: pos.lon,
      access: tags.access ?? null,
      indoor,
      indoorSource,
      fee: parseBool(tags.fee),
      surface: tags.surface ?? null,
      lit: parseBool(tags.lit),
      website: tags.website ?? tags["contact:website"] ?? null,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      openingHours: tags.opening_hours ?? null,
      tags,
    });
  }

  const filtered = keepCanton
    ? courts.filter((c) => c.canton === keepCanton)
    : courts;

  // Stable sort: canton → municipality → name. Unknown sinks with "\uffff".
  const key = (s: string | null) => s ?? "\uffff";
  filtered.sort((a, b) => {
    const c = key(a.canton).localeCompare(key(b.canton));
    if (c !== 0) return c;
    const m = key(a.municipality).localeCompare(key(b.municipality));
    if (m !== 0) return m;
    return key(a.name).localeCompare(key(b.name));
  });
  return filtered;
}
