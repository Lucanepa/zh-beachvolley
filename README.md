# zh-beachvolley

Beach volleyball courts in the **Canton of Zürich**, pulled from OpenStreetMap and organized into machine- and human-readable outputs.

## What it does

1. Queries Overpass for `sport=beach_volleyball` **and** `sport=beachvolleyball` inside a Canton ZH bounding box, along with `building=sports_hall` + `leisure=sports_centre` polygons for indoor inference.
2. Normalizes OSM nodes / ways / relations into a flat `Court` shape (polygon → centroid, dedup, point-in-polygon against Swiss cantons, filter to ZH, sort by municipality + name).
3. Flags indoor courts via `indoor=yes` on the pitch *or* by falling inside a `building=sports_hall` polygon.
4. Reverse-geocodes missing `municipality` / `street` via Nominatim (throttled 1 req/s, cached in `data/nominatim-cache.json`).
5. Writes five outputs to `data/`:

   | File | Purpose |
   |---|---|
   | `raw.json` | Full Overpass response, gitignored. |
   | `courts.geojson` | `FeatureCollection` of `Point`s — drop into Leaflet, Mapbox, QGIS, umap, etc. |
   | `courts.csv` | Flat table for Excel / Numbers / pandas. |
   | `INDEX.md` | Human-readable summary, grouped by municipality. |
   | `nominatim-cache.json` | Reverse-geocode cache, committed; avoids re-hammering Nominatim on each refresh. |

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
export const CANTON_ZH_BBOX = {
  south: 47.15,
  west:  8.37,
  north: 47.71,
  east:  8.99,
};
```

Roughly hugs the Canton ZH rectangle; the spatial join in `normalize.ts`
discards stragglers that leak in from AG / ZG / SZ / SH. Widen the bbox
and change `keepCanton` in `src/main.ts` if you want neighbors.

## Repo layout

```
.
├── src/
│   ├── overpass.ts     # query builder + fetch (with mirror fallback)
│   ├── cantons.ts      # point-in-polygon lookup into Swiss cantons
│   ├── normalize.ts    # OSM → Court, centroid, dedup, sort
│   ├── export.ts       # writers: json / geojson / csv / md
│   ├── smoke.test.ts   # offline sanity check
│   └── main.ts         # orchestrator
├── scripts/
│   ├── fetch-cantons.mjs  # one-shot: pull cantons from Overpass
│   └── build-site.mjs     # copies data/courts.geojson → site/
├── site/                  # static Leaflet viewer
├── data/
│   ├── courts.geojson
│   ├── courts.csv
│   ├── INDEX.md
│   └── swiss-cantons.geojson   # committed; rebuilt by fetch-cantons.mjs
├── .github/workflows/refresh.yml
└── package.json
```

## Swiss cantons

Every court is tagged with its canton via a point-in-polygon join against
[`data/swiss-cantons.geojson`][cantons]. That file is committed — canton
boundaries don't meaningfully move. Regenerate only if you need fresher
geometry or want to fix a bad boundary:

```bash
node scripts/fetch-cantons.mjs
```

This hits Overpass for `admin_level=4` relations inside `ISO3166-1="CH"`,
converts them to a GeoJSON `MultiPolygon` FeatureCollection (via the
`osmtogeojson` dev dep) and simplifies with `@turf/simplify` (tolerance
~0.001 ≈ 100 m at Swiss latitudes — plenty for a PIP test). Expect ~25
KB per canton after simplification (~230 KB total).

[cantons]: data/swiss-cantons.geojson

## Automated refresh

`.github/workflows/refresh.yml` runs `pnpm fetch` every Monday at 04:00 UTC and commits any diff to `data/`. Useful if you want to track how the OSM coverage of Swiss beach courts evolves over time. Enable by pushing to GitHub — no secrets needed.

## Data license

OSM data is © OpenStreetMap contributors, licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/).
Any redistribution of `courts.geojson` / `courts.csv` must preserve attribution.

## Ideas for next steps

- **OSM contributions** — see [CONTRIBUTING_OSM.md](./CONTRIBUTING_OSM.md).
- **Swiss Beachvolley Tour overlay** — enrich with `tournament_venue: true` for courts hosting official events.
- **OpenVolley integration** — push coords into the OpenVolley venue picker.
