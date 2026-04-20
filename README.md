# zh-beachvolley

Beach volleyball courts in the **Greater Zurich** area, pulled from OpenStreetMap and organized into machine- and human-readable outputs.

## What it does

1. Queries Overpass for `sport=beach_volleyball` **and** `sport=beachvolleyball` inside a Greater Zurich bounding box.
2. Normalizes OSM nodes / ways / relations into a flat `Court` shape (polygon → centroid, dedup by OSM id, stable sort by municipality + name).
3. Writes four outputs to `data/`:

   | File | Purpose |
   |---|---|
   | `raw.json` | Full Overpass response, gitignored. |
   | `courts.geojson` | `FeatureCollection` of `Point`s — drop into Leaflet, Mapbox, QGIS, umap, etc. |
   | `courts.csv` | Flat table for Excel / Numbers / pandas. |
   | `INDEX.md` | Human-readable summary, grouped by municipality. |

## Run

Requires Node ≥ 20.

```bash
pnpm install     # or: npm install
pnpm fetch       # or: npm run fetch
```

Takes a few seconds. If `overpass-api.de` is busy, the script automatically falls back to `kumi.systems` and `openstreetmap.fr` mirrors.

## Configuration

Bounding box lives in [`src/overpass.ts`](src/overpass.ts):

```ts
export const GREATER_ZURICH_BBOX = {
  south: 47.1,
  west:  8.3,
  north: 47.8,
  east:  9.0,
};
```

Covers Canton ZH with a buffer into AG, ZG, SZ, SG, TG, SH. Shrink it to just ZH if you prefer.

## Repo layout

```
.
├── src/
│   ├── overpass.ts     # query builder + fetch (with mirror fallback)
│   ├── normalize.ts    # OSM → Court, centroid, dedup, sort
│   ├── export.ts       # writers: json / geojson / csv / md
│   └── main.ts         # orchestrator
├── data/               # outputs land here
├── .github/workflows/
│   └── refresh.yml     # weekly cron: re-fetch and auto-commit
└── package.json
```

## Automated refresh

`.github/workflows/refresh.yml` runs `pnpm fetch` every Monday at 04:00 UTC and commits any diff to `data/`. Useful if you want to track how the OSM coverage of Swiss beach courts evolves over time. Enable by pushing to GitHub — no secrets needed.

## Data license

OSM data is © OpenStreetMap contributors, licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/).
Any redistribution of `courts.geojson` / `courts.csv` must preserve attribution.

## Ideas for next steps

- **Canton resolution** — spatial join against swisstopo cantons GeoJSON so `addr:city`-less courts still get a region.
- **Nominatim reverse geocode** — fill in missing `municipality` (watch the 1 req/s limit).
- **Swiss Beachvolley Tour overlay** — enrich with `tournament_venue: true` for courts hosting official events.
- **Static viewer** — tiny Leaflet page deployed on Cloudflare Pages, consuming `courts.geojson` directly.
- **OpenVolley integration** — push coords into the OpenVolley venue picker.
