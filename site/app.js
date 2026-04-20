/* global L */
// Editorial Leaflet viewer for Greater Zurich beach volleyball courts.
// Fetches ./courts.geojson (built by `npm run build:site`) and renders a
// synced list + map with search and indoor/outdoor filtering.

const MAP_CENTER = [47.38, 8.54]; // Zurich
const MAP_ZOOM = 10;

const state = {
  features: [],     // all features
  visible: [],      // after search + filter
  search: "",
  filter: "all",    // "all" | "outdoor" | "indoor"
  selectedId: null,
};

const els = {
  list: document.getElementById("courts"),
  count: document.getElementById("count"),
  search: document.getElementById("search"),
  chips: document.querySelectorAll(".chip"),
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
  recompute();
}

function recompute() {
  const q = state.search.trim().toLowerCase();
  state.visible = state.features.filter((f) => {
    const p = f.properties || {};
    if (state.filter === "indoor" && !p.indoor) return false;
    if (state.filter === "outdoor" && p.indoor) return false;
    if (!q) return true;
    const hay = [
      p.name,
      p.municipality,
      p.operator,
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

  // Group by municipality.
  const groups = new Map();
  for (const f of features) {
    const key = f.properties?.municipality ?? "Unknown municipality";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "Unknown municipality") return 1;
    if (b === "Unknown municipality") return -1;
    return a.localeCompare(b);
  });

  for (const k of keys) {
    const items = groups.get(k);
    const header = document.createElement("li");
    header.className = "court-group";
    header.innerHTML = `${escapeHtml(k)}<span class="n">${items.length}</span>`;
    els.list.appendChild(header);
    for (const f of items) els.list.appendChild(listItem(f));
  }
}

function listItem(f) {
  const p = f.properties || {};
  const id = featureId(f);
  const li = document.createElement("li");
  li.className = "court";
  li.dataset.id = id;
  if (state.selectedId === id) li.setAttribute("aria-selected", "true");

  const name = p.name
    ? `<span class="named">${escapeHtml(p.name)}</span>`
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

  const muniMeta = [p.municipality, p.operator].filter(Boolean).map(escapeHtml).join(" · ");
  const [lon, lat] = f.geometry?.coordinates ?? [0, 0];

  li.innerHTML = `
    <p class="court-name">${name}</p>
    ${muniMeta ? `<p class="court-meta">${muniMeta}</p>` : ""}
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
  const name = p.name ? escapeHtml(p.name) : "Unnamed court";
  const muni = p.municipality ? escapeHtml(p.municipality) : "";
  const type = p.indoor ? "Indoor" : "Outdoor";
  const osm = p.osmUrl
    ? `<a href="${escapeAttr(p.osmUrl)}" target="_blank" rel="noopener">OSM ↗</a>`
    : "";
  const site = p.website
    ? `<a href="${escapeAttr(p.website)}" target="_blank" rel="noopener">Website ↗</a>`
    : "";
  const gmaps = `<a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener">Directions ↗</a>`;
  return `
    <div class="popup">
      <p class="popup-name">${name}</p>
      <p class="popup-meta">${type}${muni ? " · " + muni : ""}</p>
      <p class="popup-links">${[gmaps, osm, site].filter(Boolean).join("")}</p>
    </div>
  `;
}

// ─── Selection & sync ─────────────────────────────────────────────────────

function selectCourt(id, { fly, openPopup }) {
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
  if (!marker) return;
  const latlng = marker.getLatLng();
  if (fly) map.flyTo(latlng, Math.max(map.getZoom(), 14), { duration: 0.6 });
  if (openPopup) marker.openPopup();
}

// ─── Controls ─────────────────────────────────────────────────────────────

els.search.addEventListener("input", (e) => {
  state.search = e.target.value;
  recompute();
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
  });
});

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
