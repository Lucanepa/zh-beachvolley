/* global L */
// Editorial Leaflet viewer for Greater Zurich beach volleyball courts.
// Fetches ./courts.geojson (built by `npm run build:site`) and renders a
// synced list + map with search, indoor/outdoor filtering, canton chips,
// and deep-linkable hash state (#id=…&q=…&type=…&cantons=…).

const MAP_CENTER = [47.38, 8.54]; // Zurich
const MAP_ZOOM = 10;

const state = {
  features: [],     // all features
  visible: [],      // after search + filter
  search: "",
  filter: "all",    // "all" | "outdoor" | "indoor"
  cantons: new Set(), // selected canton codes; empty = all
  selectedId: null,
};

// ─── Hash state ───────────────────────────────────────────────────────────
// Shape: #id=<osmType>/<osmId>&q=<search>&type=indoor|outdoor&cantons=ZH,AG
// Empty keys are omitted. Malformed hashes fall back to defaults.

const hashState = {
  read() {
    try {
      const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
      const p = new URLSearchParams(raw);
      const type = p.get("type");
      return {
        id: p.get("id") || null,
        q: p.get("q") || "",
        type: type === "indoor" || type === "outdoor" ? type : "all",
        cantons: (p.get("cantons") || "").split(",").map((s) => s.trim()).filter(Boolean),
      };
    } catch (err) {
      console.warn("[viewer] Malformed hash, ignoring:", err);
      return { id: null, q: "", type: "all", cantons: [] };
    }
  },
  write() {
    const p = new URLSearchParams();
    if (state.selectedId) p.set("id", state.selectedId);
    if (state.search) p.set("q", state.search);
    if (state.filter !== "all") p.set("type", state.filter);
    if (state.cantons.size > 0) p.set("cantons", [...state.cantons].join(","));
    const s = p.toString();
    const next = s ? `#${s}` : "";
    if (location.hash === next) return;
    // replaceState: no scroll jump, no history spam.
    history.replaceState(null, "", location.pathname + location.search + next);
  },
  subscribe(fn) {
    window.addEventListener("popstate", () => fn(this.read()));
    window.addEventListener("hashchange", () => fn(this.read()));
  },
};

const els = {
  list: document.getElementById("courts"),
  count: document.getElementById("count"),
  search: document.getElementById("search"),
  chips: document.querySelectorAll(".filter-row .chip"),
  cantonRow: document.getElementById("canton-row"),
};

// ─── Map ──────────────────────────────────────────────────────────────────

const map = L.map("map", {
  center: MAP_CENTER,
  zoom: MAP_ZOOM,
  scrollWheelZoom: true,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const markersById = new Map();

// ─── Data ─────────────────────────────────────────────────────────────────

async function loadData() {
  try {
    const r = await fetch("./courts.geojson", { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const fc = await r.json();
    state.features = fc.features || [];
  } catch (err) {
    console.error("Failed to load courts.geojson", err);
    els.count.textContent = "Could not load data.";
    renderList([], "Could not load data.");
    return;
  }
  renderCantonChips();
  applyHashState(hashState.read(), { fromHash: true, selectFromId: true });
}

// Apply hash-derived state to the UI. When fromHash is true we skip the
// hash write-back so we don't fight with history.replaceState.
function applyHashState(h, { fromHash = false, selectFromId = false } = {}) {
  state.search = h.q;
  state.filter = h.type;
  state.cantons = new Set(h.cantons);

  els.search.value = h.q;
  els.chips.forEach((c) => {
    c.setAttribute(
      "aria-pressed",
      c.dataset.filter === h.type ? "true" : "false",
    );
  });
  syncCantonChipPressed();

  recompute();

  if (selectFromId && h.id) {
    const hit = state.features.find((f) => featureId(f) === h.id);
    if (hit) {
      // Defer to next tick so the list has rendered and scrollIntoView works.
      requestAnimationFrame(() =>
        selectCourt(h.id, { fly: true, openPopup: true, writeHash: !fromHash }),
      );
    }
  }
}

function recompute() {
  const q = state.search.trim().toLowerCase();
  state.visible = state.features.filter((f) => {
    const p = f.properties || {};
    if (state.filter === "indoor" && !p.indoor) return false;
    if (state.filter === "outdoor" && p.indoor) return false;
    if (state.cantons.size > 0 && !state.cantons.has(p.canton)) return false;
    if (!q) return true;
    const hay = [
      p.name,
      p.municipality,
      p.operator,
      p.canton,
      p.cantonName,
      p.surface,
      p.access,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  render();
}

function renderCantonChips() {
  const counts = new Map();
  const names = new Map();
  for (const f of state.features) {
    const code = f.properties?.canton;
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
    if (f.properties.cantonName) names.set(code, f.properties.cantonName);
  }
  // Hide the row when there's nothing useful to pick: 0 cantons (no data)
  // or exactly 1 canton (current single-canton scope — filtering does
  // nothing).
  if (counts.size <= 1) {
    els.cantonRow.hidden = true;
    els.cantonRow.innerHTML = "";
    return;
  }
  const codes = [...counts.keys()].sort();
  const html = [
    `<button class="chip chip-canton chip-canton-all" data-canton="" aria-pressed="true">All cantons</button>`,
    ...codes.map(
      (code) =>
        `<button class="chip chip-canton" data-canton="${escapeAttr(code)}" aria-pressed="false" title="${escapeAttr(names.get(code) ?? code)}">${escapeHtml(code)}<span class="n">${counts.get(code)}</span></button>`,
    ),
  ];
  els.cantonRow.innerHTML = html.join("");
  els.cantonRow.querySelectorAll(".chip-canton").forEach((chip) => {
    chip.addEventListener("click", () => toggleCantonChip(chip.dataset.canton ?? ""));
  });
}

function toggleCantonChip(code) {
  if (!code) {
    // "All cantons" — clear multi-select.
    state.cantons.clear();
  } else if (state.cantons.has(code)) {
    state.cantons.delete(code);
  } else {
    state.cantons.add(code);
  }
  syncCantonChipPressed();
  recompute();
  hashState.write();
}

function syncCantonChipPressed() {
  els.cantonRow.querySelectorAll(".chip-canton").forEach((chip) => {
    const code = chip.dataset.canton ?? "";
    const pressed = code === ""
      ? state.cantons.size === 0
      : state.cantons.has(code);
    chip.setAttribute("aria-pressed", pressed ? "true" : "false");
  });
}

// ─── Rendering ────────────────────────────────────────────────────────────

function featureId(f) {
  return f.id || `${f.properties?.osmUrl ?? Math.random()}`;
}

function render() {
  renderCount();
  renderList(state.visible);
  renderMarkers(state.visible);
}

function renderCount() {
  const n = state.visible.length;
  const total = state.features.length;
  if (total === 0) {
    els.count.textContent = "No data.";
  } else if (n === total) {
    els.count.textContent = `${n} courts`;
  } else {
    els.count.textContent = `${n} of ${total} courts`;
  }
}

function renderList(features, emptyMsg = "No courts match these filters.") {
  els.list.innerHTML = "";
  if (!features.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = emptyMsg;
    els.list.appendChild(li);
    return;
  }

  // Two-level grouping: canton → municipality → items.
  const byCanton = new Map();
  const cantonNames = new Map();
  for (const f of features) {
    const code = f.properties?.canton ?? "";
    const cName = f.properties?.cantonName ?? "";
    if (code) cantonNames.set(code, cName || code);
    const muni = f.properties?.municipality ?? "Unknown municipality";
    if (!byCanton.has(code)) byCanton.set(code, new Map());
    const muniMap = byCanton.get(code);
    if (!muniMap.has(muni)) muniMap.set(muni, []);
    muniMap.get(muni).push(f);
  }

  const cKey = (k) => (k === "" ? "\uffff" : k);
  const cantonKeys = [...byCanton.keys()].sort((a, b) =>
    cKey(a).localeCompare(cKey(b)),
  );

  // When all visible courts share one canton, the canton header is noise —
  // skip it and let municipality-level groups be the top level.
  const onlyOneCanton = cantonKeys.length === 1 && cantonKeys[0] !== "";

  for (const cCode of cantonKeys) {
    const muniMap = byCanton.get(cCode);
    const total = [...muniMap.values()].reduce((n, xs) => n + xs.length, 0);
    if (!onlyOneCanton) {
      const cHeader = document.createElement("li");
      cHeader.className = "canton-group";
      const title = cCode
        ? `${escapeHtml(cCode)} <span class="canton-name">${escapeHtml(cantonNames.get(cCode) ?? "")}</span>`
        : `Outside Switzerland`;
      cHeader.innerHTML = `${title}<span class="n">${total}</span>`;
      els.list.appendChild(cHeader);
    }

    const muniKey = (s) => (s === "Unknown municipality" ? "\uffff" : s);
    const muniKeys = [...muniMap.keys()].sort((a, b) =>
      muniKey(a).localeCompare(muniKey(b)),
    );
    for (const m of muniKeys) {
      const items = muniMap.get(m);
      const mHeader = document.createElement("li");
      mHeader.className = "court-group";
      mHeader.innerHTML = `${escapeHtml(m)}<span class="n">${items.length}</span>`;
      els.list.appendChild(mHeader);
      for (const f of items) els.list.appendChild(listItem(f));
    }
  }
}

function listItem(f) {
  const p = f.properties || {};
  const id = featureId(f);
  const li = document.createElement("li");
  li.className = "court";
  li.dataset.id = id;
  if (state.selectedId === id) li.setAttribute("aria-selected", "true");

  const fallback = [p.street, p.municipality].filter(Boolean).join(", ");
  const name = p.name
    ? `<span class="named">${escapeHtml(p.name)}</span>`
    : fallback
      ? `<span class="unnamed-fallback">${escapeHtml(fallback)}</span>`
      : `<span class="unnamed">Unnamed court</span>`;

  const tags = [];
  tags.push(
    p.indoor
      ? `<span class="tag-indoor">Indoor</span>`
      : `<span class="tag-outdoor">Outdoor</span>`,
  );
  if (p.access && p.access !== "yes") tags.push(`<span>Access · ${escapeHtml(p.access)}</span>`);
  if (p.fee === true) tags.push(`<span>Fee</span>`);
  if (p.surface && p.surface !== "sand") tags.push(`<span>${escapeHtml(p.surface)}</span>`);

  // The municipality is already used in the group header; in the row,
  // surface the street + operator so the card carries distinct info.
  const rowMetaSource = p.name ? [p.street, p.operator] : [p.operator];
  const rowMeta = rowMetaSource.filter(Boolean).map(escapeHtml).join(" · ");
  const [lon, lat] = f.geometry?.coordinates ?? [0, 0];

  li.innerHTML = `
    <p class="court-name">${name}</p>
    ${rowMeta ? `<p class="court-meta">${rowMeta}</p>` : ""}
    <p class="court-tags">${tags.join("")}</p>
    <p class="court-coords">${lat.toFixed(5)}, ${lon.toFixed(5)}</p>
  `;

  li.addEventListener("click", () => selectCourt(id, { fly: true, openPopup: true }));
  return li;
}

function renderMarkers(features) {
  markerLayer.clearLayers();
  markersById.clear();
  for (const f of features) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const id = featureId(f);
    const p = f.properties || {};
    const icon = L.divIcon({
      className: "",
      html: `<div class="court-marker ${p.indoor ? "indoor" : "outdoor"}${
        state.selectedId === id ? " selected" : ""
      }"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const marker = L.marker([lat, lon], { icon });
    marker.bindPopup(() => popupHtml(f), { closeButton: true, minWidth: 200 });
    marker.on("click", () => selectCourt(id, { fly: false, openPopup: false }));
    marker.addTo(markerLayer);
    markersById.set(id, marker);
  }
}

function popupHtml(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry?.coordinates ?? [0, 0];
  const fallback = [p.street, p.municipality].filter(Boolean).join(", ");
  const name = escapeHtml(p.name || fallback || "Unnamed court");
  const muni = p.municipality ? escapeHtml(p.municipality) : "";
  const type = p.indoor ? "Indoor" : "Outdoor";
  const id = featureId(f);
  const osm = p.osmUrl
    ? `<a href="${escapeAttr(p.osmUrl)}" target="_blank" rel="noopener">OSM ↗</a>`
    : "";
  const site = p.website
    ? `<a href="${escapeAttr(p.website)}" target="_blank" rel="noopener">Website ↗</a>`
    : "";
  const gmaps = `<a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener">Directions ↗</a>`;
  const copy = `<button type="button" class="popup-copy" data-copy-id="${escapeAttr(id)}">Copy link ↗</button>`;
  return `
    <div class="popup">
      <p class="popup-name">${name}</p>
      <p class="popup-meta">${type}${muni ? " · " + muni : ""}</p>
      <p class="popup-links">${[gmaps, osm, site, copy].filter(Boolean).join("")}</p>
    </div>
  `;
}

// Event delegation: copy-link clicks from any popup.
map.on("popupopen", (e) => {
  const btn = e.popup.getElement()?.querySelector(".popup-copy");
  if (!btn) return;
  btn.addEventListener(
    "click",
    async () => {
      const id = btn.dataset.copyId ?? "";
      const url = location.origin + location.pathname + "#id=" + encodeURIComponent(id);
      const label = btn.textContent;
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = "Copied";
      } catch {
        // Fallback: prompt shows the URL so the user can copy manually.
        window.prompt("Copy this link:", url);
      }
      setTimeout(() => {
        btn.textContent = label;
      }, 1400);
    },
    { once: false },
  );
});

// ─── Selection & sync ─────────────────────────────────────────────────────

function selectCourt(id, { fly, openPopup, writeHash = true } = {}) {
  const prevId = state.selectedId;
  state.selectedId = id;

  if (prevId && prevId !== id) {
    const prevLi = els.list.querySelector(`.court[data-id="${cssEscape(prevId)}"]`);
    if (prevLi) prevLi.removeAttribute("aria-selected");
  }
  const li = els.list.querySelector(`.court[data-id="${cssEscape(id)}"]`);
  if (li) {
    li.setAttribute("aria-selected", "true");
    li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  renderMarkers(state.visible); // refresh marker classes

  const marker = markersById.get(id);
  if (marker) {
    const latlng = marker.getLatLng();
    if (fly) map.flyTo(latlng, Math.max(map.getZoom(), 14), { duration: 0.6 });
    if (openPopup) marker.openPopup();
  }

  if (writeHash) hashState.write();
}

// ─── Controls ─────────────────────────────────────────────────────────────

let searchDebounce;
els.search.addEventListener("input", (e) => {
  state.search = e.target.value;
  recompute();
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => hashState.write(), 200);
});

els.chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const f = chip.dataset.filter;
    if (!f || state.filter === f) return;
    state.filter = f;
    els.chips.forEach((c) => {
      c.setAttribute(
        "aria-pressed",
        c.dataset.filter === f ? "true" : "false",
      );
    });
    recompute();
    hashState.write();
  });
});

// Browser back/forward + manual URL edits.
hashState.subscribe((h) => applyHashState(h, { fromHash: true, selectFromId: true }));

// ─── Utilities ────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s) { return escapeHtml(s); }
function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&");
}

// ─── Go ───────────────────────────────────────────────────────────────────

loadData();
