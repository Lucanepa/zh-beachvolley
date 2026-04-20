import type { OverpassElement, OverpassResponse } from "./overpass.ts";

export interface Court {
  id: string;               // "node/123" | "way/456" | "relation/789"
  osmType: "node" | "way" | "relation";
  osmId: number;
  osmUrl: string;
  name: string | null;
  operator: string | null;
  municipality: string | null;
  postcode: string | null;
  lat: number;
  lon: number;
  access: string | null;    // "yes" | "customers" | "private" | "members" | ...
  indoor: boolean;
  fee: boolean | null;
  surface: string | null;   // typically "sand"
  lit: boolean | null;
  website: string | null;
  phone: string | null;
  openingHours: string | null;
  tags: Record<string, string>;
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

export function normalize(resp: OverpassResponse): Court[] {
  const seen = new Set<string>();
  const courts: Court[] = [];
  for (const el of resp.elements) {
    const pos = coords(el);
    if (!pos) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = el.tags ?? {};
    courts.push({
      id,
      osmType: el.type,
      osmId: el.id,
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      name: tags.name ?? null,
      operator: tags.operator ?? null,
      municipality: tags["addr:city"] ?? tags["is_in:city"] ?? null,
      postcode: tags["addr:postcode"] ?? null,
      lat: pos.lat,
      lon: pos.lon,
      access: tags.access ?? null,
      indoor: parseBool(tags.indoor) === true,
      fee: parseBool(tags.fee),
      surface: tags.surface ?? null,
      lit: parseBool(tags.lit),
      website: tags.website ?? tags["contact:website"] ?? null,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      openingHours: tags.opening_hours ?? null,
      tags,
    });
  }
  // Stable sort: municipality (unknown last), then name (unknown last).
  const key = (s: string | null) => s ?? "\uffff";
  courts.sort((a, b) => {
    const m = key(a.municipality).localeCompare(key(b.municipality));
    if (m !== 0) return m;
    return key(a.name).localeCompare(key(b.name));
  });
  return courts;
}
