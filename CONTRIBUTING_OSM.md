# Adding beach volleyball courts to OpenStreetMap

This project is downstream of OSM — we don't maintain our own court
database, we just organize what the map already knows. So the best way
to make this viewer (and every other app that consumes the same tags)
more accurate is to **fix OSM itself**.

Adding a missing court takes about a minute. Every edit you ship flows
into this repo the next time the weekly refresh runs. Below is the
shortest useful crash-course.

## Tools

Pick whichever feels most natural. All three write to the same map.

| Tool | Best for | Where |
|---|---|---|
| **StreetComplete** | Fastest on-site edits. Answer guided quests ("is this court sand? fenced? fee?") without thinking about tags. | Android — [F-Droid](https://f-droid.org/packages/de.westnordost.streetcomplete/) / Play |
| **iD editor** | Desk work. Add nodes or draw polygons in the browser. Good tag autocomplete. | [openstreetmap.org](https://www.openstreetmap.org) → sign in → **Edit** |
| **JOSM** | Batch edits, aerial-imagery tracing, complex geometry. Steepest curve. | [josm.openstreetmap.de](https://josm.openstreetmap.de) |

First-timers: start with iD.

## The tags

A beach volleyball court is `leisure=pitch` with `sport=beach_volleyball`
on sand. Everything else is metadata.

### Required

| Key | Value | Notes |
|---|---|---|
| `leisure` | `pitch` | It's a playing surface. |
| `sport` | `beach_volleyball` | Underscored form is [the wiki-blessed spelling][wiki-sport]. The old `beachvolleyball` variant still appears in the wild; our fetcher accepts both, but new edits should use `beach_volleyball`. |
| `surface` | `sand` | Rarely anything else. |

### Strongly encouraged

These turn an anonymous dot into something usable.

| Key | Value | Notes |
|---|---|---|
| `name` | e.g. `Beachvolleyballfeld Werdinsel` | What locals call it. If it has no name, leave it off — don't invent one. |
| `access` | `yes` / `customers` / `private` / `members` | Can anyone show up? Customers of a venue only? |
| `operator` | e.g. `Sportamt Zürich` | Who runs it. |
| `addr:city` | e.g. `Zürich` | Helps our viewer bucket it before the spatial join kicks in. |
| `addr:postcode` | e.g. `8049` | Pairs with `addr:city`. |

### Nice to have

| Key | Value |
|---|---|
| `lit` | `yes` / `no` — floodlights for evening play. |
| `fee` | `yes` / `no` — pay-to-play? |
| `opening_hours` | e.g. `Mo-Su 08:00-22:00` — see the [opening_hours syntax][wiki-hours]. |
| `website` | Venue or booking URL. |
| `phone` | `+41 44 ...` |
| `wheelchair` | `yes` / `limited` / `no` — accessibility to the court area, not the sand itself. |

### Indoor halls (Beachhalle)

A domed or enclosed sand court should carry all of the above *plus*:

| Key | Value |
|---|---|
| `indoor` | `yes` |
| `covered` | `yes` |
| `building` | `sports_hall` — on the enclosing building, not the pitch itself. |

## Workflow

1. **Spot a missing court.** Pass by one, see it from the road, notice
   a hole on this viewer or on osm.org.
2. **Open iD** at [openstreetmap.org](https://www.openstreetmap.org),
   navigate to the spot, click **Edit**. Either drop a single node
   (fine for casual single courts) or draw the sand as a way (better —
   gives real geometry).
3. **Tag it** with at least the three required keys. Add as many from
   the encouraged list as you're sure about. Don't guess — missing is
   better than wrong.
4. **Save** with a short changeset comment like
   `Add beach volleyball court at Werdinsel`.
5. **Wait ~15 min** for planet replication. Overpass sees your edit
   shortly after.
6. **Refresh this repo:**
   ```bash
   npm run fetch
   git add data/
   git commit -m "chore(data): refresh"
   git push
   ```
   or just wait — the weekly `refresh.yml` workflow picks it up on its
   own.

## A complete example

This is how the outdoor sand courts on Werdinsel, Zürich could look
fully tagged:

```
leisure        = pitch
sport          = beach_volleyball
surface        = sand
name           = Beachvolleyballfelder Werdinsel
access         = yes
operator       = Sportamt der Stadt Zürich
addr:city      = Zürich
addr:postcode  = 8049
lit            = no
fee            = no
opening_hours  = Apr-Oct: Mo-Su 08:00-22:00
```

One row per court (or a single polygon covering the sand area if the
courts share one surface).

## Verify your edit

Two weeks after you save, this Overpass query will list every recent
beach volleyball edit in the Greater Zurich bbox:

```
[out:json][timeout:60];
(
  nwr["sport"="beach_volleyball"](newer:"P14D")(47.15,8.37,47.71,8.99);
  nwr["sport"="beachvolleyball"](newer:"P14D")(47.15,8.37,47.71,8.99);
);
out geom;
```

Run it on [overpass-turbo.eu][otb] — it shows results on the map and
flags anything your changeset introduced.

[otb]: https://overpass-turbo.eu/?Q=%5Bout%3Ajson%5D%5Btimeout%3A60%5D%3B%0A(%0A%20%20nwr%5B%22sport%22%3D%22beach_volleyball%22%5D(newer%3A%22P14D%22)(47.15%2C8.37%2C47.71%2C8.99)%3B%0A%20%20nwr%5B%22sport%22%3D%22beachvolleyball%22%5D(newer%3A%22P14D%22)(47.15%2C8.37%2C47.71%2C8.99)%3B%0A)%3B%0Aout%20geom%3B&R

## References

- [Tag:sport=beach_volleyball][wiki-sport] — canonical tag reference.
- [Tag:leisure=pitch][wiki-pitch] — parent tag for playing surfaces.
- [opening_hours syntax][wiki-hours] — if you want to be precise about
  seasonality.

[wiki-sport]: https://wiki.openstreetmap.org/wiki/Tag:sport%3Dbeach_volleyball
[wiki-pitch]: https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dpitch
[wiki-hours]: https://wiki.openstreetmap.org/wiki/Key:opening_hours
