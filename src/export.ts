import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Court } from "./normalize.ts";

function ensureDir(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

export function writeJson(path: string, data: unknown): void {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function writeGeoJSON(path: string, courts: Court[]): void {
  const fc = {
    type: "FeatureCollection",
    features: courts.map((c) => ({
      type: "Feature",
      id: c.id,
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: {
        name: c.name,
        operator: c.operator,
        municipality: c.municipality,
        access: c.access,
        indoor: c.indoor,
        fee: c.fee,
        surface: c.surface,
        lit: c.lit,
        website: c.website,
        phone: c.phone,
        openingHours: c.openingHours,
        osmUrl: c.osmUrl,
      },
    })),
  };
  writeJson(path, fc);
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function writeCSV(path: string, courts: Court[]): void {
  ensureDir(path);
  const cols: (keyof Court)[] = [
    "id",
    "name",
    "municipality",
    "postcode",
    "lat",
    "lon",
    "indoor",
    "access",
    "fee",
    "surface",
    "operator",
    "website",
    "phone",
    "openingHours",
    "osmUrl",
  ];
  const lines = [
    cols.join(","),
    ...courts.map((c) => cols.map((k) => csvEscape(c[k])).join(",")),
  ];
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
}

export function writeMarkdownIndex(
  path: string,
  courts: Court[],
  meta: { fetchedAt: string },
): void {
  ensureDir(path);
  const byMuni = new Map<string, Court[]>();
  for (const c of courts) {
    const key = c.municipality ?? "(unknown)";
    if (!byMuni.has(key)) byMuni.set(key, []);
    byMuni.get(key)!.push(c);
  }
  const keys = [...byMuni.keys()].sort((a, b) => a.localeCompare(b));

  const lines: string[] = [];
  lines.push(`# Beach volleyball courts — Greater Zurich`);
  lines.push("");
  lines.push(`_Fetched: ${meta.fetchedAt}_`);
  lines.push("");
  lines.push(
    `**${courts.length}** courts across **${keys.length}** labeled municipalities.`,
  );
  lines.push("");
  lines.push(`Source: © OpenStreetMap contributors (ODbL 1.0).`);
  lines.push("");

  for (const k of keys) {
    const list = byMuni.get(k)!;
    lines.push(`## ${k} (${list.length})`);
    lines.push("");
    lines.push(`| Name | Access | Indoor | Surface | Coords | OSM |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const c of list) {
      const name = c.name ?? "_(unnamed)_";
      const access = c.access ?? "—";
      const indoor = c.indoor ? "yes" : "—";
      const surface = c.surface ?? "—";
      const coords = `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`;
      lines.push(
        `| ${name} | ${access} | ${indoor} | ${surface} | ${coords} | [link](${c.osmUrl}) |`,
      );
    }
    lines.push("");
  }

  writeFileSync(path, lines.join("\n"), "utf8");
}
