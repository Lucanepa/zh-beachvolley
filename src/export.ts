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
        canton: c.canton,
        cantonName: c.cantonName,
        municipality: c.municipality,
        street: c.street,
        access: c.access,
        indoor: c.indoor,
        indoorSource: c.indoorSource,
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
    "street",
    "municipality",
    "canton",
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

function displayName(c: Court): string {
  if (c.name) return c.name;
  const parts = [c.street, c.municipality].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(", ");
  return "_(unnamed)_";
}

export function writeMarkdownIndex(
  path: string,
  courts: Court[],
  meta: { fetchedAt: string },
): void {
  ensureDir(path);

  // Canton → Municipality → Court[]
  const byCanton = new Map<string, Map<string, Court[]>>();
  const cantonNames = new Map<string, string>();
  const muniSet = new Set<string>();
  for (const c of courts) {
    const cCode = c.canton ?? "??";
    const cName = c.cantonName ?? "Outside Switzerland";
    cantonNames.set(cCode, cName);
    const muniKey = c.municipality ?? "(unknown municipality)";
    muniSet.add(`${cCode}::${muniKey}`);
    if (!byCanton.has(cCode)) byCanton.set(cCode, new Map());
    const muniMap = byCanton.get(cCode)!;
    if (!muniMap.has(muniKey)) muniMap.set(muniKey, []);
    muniMap.get(muniKey)!.push(c);
  }

  const cantonKey = (k: string) => (k === "??" ? "\uffff" : k);
  const cantonKeys = [...byCanton.keys()].sort((a, b) =>
    cantonKey(a).localeCompare(cantonKey(b)),
  );

  const lines: string[] = [];
  const knownCantons = cantonKeys.filter((k) => k !== "??");
  const singleCanton = knownCantons.length === 1 ? knownCantons[0]! : null;
  const title = singleCanton
    ? `# Beach volleyball courts — Canton of ${cantonNames.get(singleCanton)}`
    : `# Beach volleyball courts — Switzerland`;
  lines.push(title);
  lines.push("");
  lines.push(`_Fetched: ${meta.fetchedAt}_`);
  lines.push("");
  const summary = singleCanton
    ? `**${courts.length}** courts across **${muniSet.size}** municipalities.`
    : `**${courts.length}** courts across **${knownCantons.length}** cantons / **${muniSet.size}** municipalities.`;
  lines.push(summary);
  lines.push("");
  const indoorCount = courts.filter((c) => c.indoor).length;
  if (indoorCount > 0) {
    lines.push(
      `Of which **${indoorCount}** are indoor (tag or inferred from an enclosing hall).`,
    );
    lines.push("");
  }
  lines.push(`Source: © OpenStreetMap contributors (ODbL 1.0).`);
  lines.push("");

  const muniSortKey = (s: string) =>
    s === "(unknown municipality)" ? "\uffff" : s;

  for (const cCode of cantonKeys) {
    const muniMap = byCanton.get(cCode)!;
    const total = [...muniMap.values()].reduce((n, xs) => n + xs.length, 0);

    // Skip the canton-level section header when we have exactly one canton;
    // promote municipalities to ##.
    if (!singleCanton) {
      const header =
        cCode === "??"
          ? `## Outside Switzerland (${total} court${total === 1 ? "" : "s"})`
          : `## ${cCode} — ${cantonNames.get(cCode)} (${total} court${total === 1 ? "" : "s"})`;
      lines.push(header);
      lines.push("");
    }

    const muniKeys = [...muniMap.keys()].sort((a, b) =>
      muniSortKey(a).localeCompare(muniSortKey(b)),
    );
    for (const m of muniKeys) {
      const list = muniMap.get(m)!;
      const headerPrefix = singleCanton ? "##" : "###";
      lines.push(`${headerPrefix} ${m} (${list.length})`);
      lines.push("");
      lines.push(`| Name | Access | Indoor | Surface | Coords | OSM |`);
      lines.push(`|---|---|---|---|---|---|`);
      for (const c of list) {
        const name = displayName(c);
        const access = c.access ?? "—";
        const indoor = c.indoor
          ? c.indoorSource === "hall"
            ? "yes (inferred)"
            : "yes"
          : "—";
        const surface = c.surface ?? "—";
        const coords = `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`;
        lines.push(
          `| ${name} | ${access} | ${indoor} | ${surface} | ${coords} | [link](${c.osmUrl}) |`,
        );
      }
      lines.push("");
    }
  }

  writeFileSync(path, lines.join("\n"), "utf8");
}
