import * as maplibregl from "../vendor/maplibre-gl/6.12.0/maplibre-gl.mjs";
import { collapseAttribution } from "./map-common.mjs";

maplibregl.setWorkerUrl(new URL(
  "../vendor/maplibre-gl/6.12.0/maplibre-gl-worker.mjs",
  import.meta.url,
).href);

const root = document.querySelector("[data-country-map]");
const canvas = root?.querySelector("[data-country-map-canvas]");
const status = root?.querySelector("[data-country-map-status]");
const places = [...document.querySelectorAll("[data-country-places] a[data-latitude][data-longitude]")]
  .map((link) => ({
    name: link.textContent.trim(),
    url: link.href,
    latitude: Number(link.dataset.latitude),
    longitude: Number(link.dataset.longitude),
    visits: Number(link.dataset.visits),
  }))
  .filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));

const points = {
  type: "FeatureCollection",
  features: places.map((place, index) => ({
    type: "Feature",
    properties: { index, visits: place.visits },
    geometry: { type: "Point", coordinates: [place.longitude, place.latitude] },
  })),
};

const waitForMapEvent = (map, name) => new Promise((resolve, reject) => {
  const timeout = window.setTimeout(() => {
    map.off(name, onEvent);
    reject(new Error(`Country map ${name} timed out`));
  }, 15000);
  const onEvent = () => {
    window.clearTimeout(timeout);
    resolve();
  };
  map.once(name, onEvent);
});

const start = async () => {
  if (!root || !canvas) return;
  root.setAttribute("aria-busy", "true");
  let map;
  let resizeObserver;
  try {
    if (!places.length) throw new Error("Country has no mappable places");
    map = new maplibregl.Map({
      container: canvas,
      style: new URL("../map/atlas-style.json", import.meta.url).href,
      center: [places[0].longitude, places[0].latitude],
      zoom: 6,
      cooperativeGestures: true,
      attributionControl: { compact: true },
      maxPitch: 0,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (event) => console.warn("Country map resource error", event.error));
    await waitForMapEvent(map, "load");
    map.addSource("country-places", {
      type: "geojson",
      data: points,
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 11,
    });
    map.addLayer({
      id: "country-clusters",
      type: "circle",
      source: "country-places",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#18201c",
        "circle-radius": ["step", ["get", "point_count"], 18, 8, 22, 20, 27],
        "circle-stroke-color": "#e7855f",
        "circle-stroke-width": 3,
      },
    });
    map.addLayer({
      id: "country-cluster-count",
      type: "symbol",
      source: "country-places",
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
      paint: { "text-color": "#f7f3ea" },
    });
    map.addLayer({
      id: "country-points",
      type: "circle",
      source: "country-places",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#f7f3ea",
        "circle-radius": ["interpolate", ["linear"], ["get", "visits"], 1, 6, 5, 9],
        "circle-stroke-color": "#ef7d58",
        "circle-stroke-width": 2.5,
      },
    });
    map.on("click", "country-clusters", async (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const zoom = await map.getSource("country-places").getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({ center: feature.geometry.coordinates, zoom });
    });
    map.on("click", "country-points", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const place = places[feature.properties.index];
      const popup = document.createElement("div");
      const link = document.createElement("a");
      link.href = place.url;
      link.textContent = place.name;
      const visits = document.createElement("span");
      visits.textContent = `${place.visits} recorded visit${place.visits === 1 ? "" : "s"}`;
      popup.append(link, visits);
      new maplibregl.Popup({ className: "country-map-popup", offset: 12 })
        .setLngLat(feature.geometry.coordinates)
        .setDOMContent(popup)
        .addTo(map);
    });
    for (const layer of ["country-clusters", "country-points"]) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }

    const bounds = new maplibregl.LngLatBounds();
    places.forEach((place) => bounds.extend([place.longitude, place.latitude]));
    const fitPlaces = () => {
      map.resize();
      if (places.length === 1) {
        map.jumpTo({ center: bounds.getCenter(), zoom: 9 });
      } else {
        map.fitBounds(bounds, { padding: window.innerWidth <= 720 ? 36 : 70, maxZoom: 10, duration: 0 });
      }
    };
    fitPlaces();
    resizeObserver = new ResizeObserver(fitPlaces);
    resizeObserver.observe(canvas);
    await waitForMapEvent(map, "idle");
    collapseAttribution(canvas);
    canvas.removeAttribute("aria-hidden");
    root.classList.add("is-ready");
    status.hidden = true;
  } catch (error) {
    console.error(error);
    resizeObserver?.disconnect();
    map?.remove();
    status.textContent = "Map unavailable. Browse the places below.";
  } finally {
    root.removeAttribute("aria-busy");
  }
};

start();
