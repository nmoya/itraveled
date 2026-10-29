import * as maplibregl from "../vendor/maplibre-gl/6.12.0/maplibre-gl.mjs";
import { collapseAttribution } from "./map-common.mjs";

maplibregl.setWorkerUrl(new URL(
  "../vendor/maplibre-gl/6.12.0/maplibre-gl-worker.mjs",
  import.meta.url,
).href);

const mapRoot = document.querySelector("[data-trip-map]");
const mapElement = mapRoot?.querySelector("[data-trip-map-canvas]");
const mapStatus = mapRoot?.querySelector("[data-trip-map-status]");
const mapFallback = mapRoot?.querySelector(".trip-map-fallback");
const stops = [...document.querySelectorAll("[data-trip-route] li")]
  .map((element, index) => ({
    order: index + 1,
    latitude: Number.parseFloat(element.dataset.latitude),
    longitude: Number.parseFloat(element.dataset.longitude),
  }))
  .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
const mobileLayout = window.matchMedia("(max-width: 720px)");

const pointCollection = {
  type: "FeatureCollection",
  features: stops.map((stop) => ({
    type: "Feature",
    properties: { order: String(stop.order) },
    geometry: { type: "Point", coordinates: [stop.longitude, stop.latitude] },
  })),
};

const splitAtDateLine = (coordinates) => {
  if (coordinates.length < 2) return [];
  const segments = [[coordinates[0]]];
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    const segment = segments[segments.length - 1];
    if (Math.abs(current[0] - previous[0]) <= 180) {
      segment.push(current);
      continue;
    }
    const crossingEast = previous[0] > 0;
    const adjustedLongitude = current[0] + (crossingEast ? 360 : -360);
    const boundary = crossingEast ? 180 : -180;
    const ratio = (boundary - previous[0]) / (adjustedLongitude - previous[0]);
    const latitude = previous[1] + ratio * (current[1] - previous[1]);
    segment.push([boundary, latitude]);
    segments.push([[-boundary, latitude], current]);
  }
  return segments.filter((segment) => segment.length > 1);
};

const routeCollection = {
  type: "FeatureCollection",
  features: splitAtDateLine(
    stops.map((stop) => [stop.longitude, stop.latitude]),
  ).map((coordinates) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  })),
};

const waitForMapEvent = (map, eventName, timeoutMessage) => new Promise((resolve, reject) => {
  const onEvent = () => {
    window.clearTimeout(timeout);
    resolve();
  };
  const timeout = window.setTimeout(() => {
    map.off(eventName, onEvent);
    reject(new Error(timeoutMessage));
  }, 15000);
  map.once(eventName, onEvent);
});

const start = async () => {
  if (!mapRoot || !mapElement) return;
  mapRoot.setAttribute("aria-busy", "true");
  let map;
  let updateMarkers;
  let resizeObserver;
  try {
    if (!stops.length) throw new Error("Trip has no mappable stops");
    map = new maplibregl.Map({
      container: mapElement,
      style: new URL("../map/atlas-style.json", import.meta.url).href,
      center: [stops[0].longitude, stops[0].latitude],
      zoom: 8,
      interactive: false,
      attributionControl: { compact: true },
      maxPitch: 0,
    });
    map.on("error", (event) => console.warn("Trip map resource error", event.error));
    await waitForMapEvent(map, "load", "Map style timed out");
    const contextualLabels = map.getStyle().layers
      .filter((layer) => layer.type === "symbol" && !layer.id.startsWith("label_country_"))
      .map((layer) => ({ id: layer.id, visibility: layer.layout?.visibility ?? "visible" }));
    map.addSource("trip-route", { type: "geojson", data: routeCollection });
    map.addSource("trip-stops", { type: "geojson", data: pointCollection });
    map.addLayer({
      id: "trip-route-underlay",
      type: "line",
      source: "trip-route",
      paint: { "line-color": "#101914", "line-width": 8, "line-opacity": 0.8 },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    map.addLayer({
      id: "trip-route",
      type: "line",
      source: "trip-route",
      paint: { "line-color": "#e7b44c", "line-width": 4 },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    map.addLayer({
      id: "trip-stops",
      type: "circle",
      source: "trip-stops",
      paint: {
        "circle-color": "#f7f3ea",
        "circle-radius": 12,
        "circle-stroke-color": "#ef7d58",
        "circle-stroke-width": 4,
      },
    });
    map.addLayer({
      id: "trip-stop-numbers",
      type: "symbol",
      source: "trip-stops",
      layout: { "text-field": ["get", "order"], "text-size": 12 },
      paint: { "text-color": "#18201c" },
    });
    updateMarkers = () => {
      map.setPaintProperty("trip-stops", "circle-radius", mobileLayout.matches ? 4.5 : 12);
      map.setPaintProperty("trip-stops", "circle-stroke-width", mobileLayout.matches ? 1.5 : 4);
      map.setLayoutProperty("trip-stop-numbers", "visibility", mobileLayout.matches ? "none" : "visible");
      map.setPaintProperty("trip-route", "line-width", mobileLayout.matches ? 3 : 4);
      map.setPaintProperty("trip-route-underlay", "line-width", mobileLayout.matches ? 6 : 8);
      contextualLabels.forEach(({ id, visibility }) => {
        map.setLayoutProperty(id, "visibility", mobileLayout.matches ? "none" : visibility);
      });
    };
    updateMarkers();
    mobileLayout.addEventListener("change", updateMarkers);

    const bounds = new maplibregl.LngLatBounds();
    stops.forEach((stop) => bounds.extend([stop.longitude, stop.latitude]));
    const fitRoute = () => {
      map.resize();
      if (stops.length === 1) {
        map.jumpTo({ center: [stops[0].longitude, stops[0].latitude], zoom: 10 });
      } else {
        map.fitBounds(bounds, { padding: mobileLayout.matches ? 32 : 64, maxZoom: 11, duration: 0 });
      }
    };
    fitRoute();
    resizeObserver = new ResizeObserver(fitRoute);
    resizeObserver.observe(mapElement);
    await waitForMapEvent(map, "idle", "Map tiles timed out");
    collapseAttribution(mapElement);
    mapElement.removeAttribute("aria-hidden");
    mapRoot.classList.add("is-ready");
    mapStatus.hidden = true;
    mapRoot.removeAttribute("aria-busy");
  } catch (error) {
    console.error(error);
    resizeObserver?.disconnect();
    if (updateMarkers) mobileLayout.removeEventListener("change", updateMarkers);
    map?.remove();
    mapStatus.textContent = "Loading fallback map…";
    mapFallback.onload = () => {
      mapStatus.hidden = true;
      mapRoot.removeAttribute("aria-busy");
    };
    mapFallback.onerror = () => {
      mapFallback.hidden = true;
      mapStatus.textContent = "Map unavailable.";
      mapRoot.removeAttribute("aria-busy");
    };
    mapFallback.hidden = false;
    mapFallback.src = mapFallback.dataset.src;
  }
};

start();
