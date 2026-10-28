import * as maplibregl from "../vendor/maplibre-gl/6.12.0/maplibre-gl.mjs";
import { createAtlas } from "./atlas-ui.mjs";
import { collapseAttribution } from "./map-common.mjs";

maplibregl.setWorkerUrl(new URL(
  "../vendor/maplibre-gl/6.12.0/maplibre-gl-worker.mjs",
  import.meta.url,
).href);

const root = document.querySelector("[data-atlas]");
const mapElement = document.querySelector("[data-atlas-map]");
const desktopQuery = window.matchMedia("(min-width: 721px)");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const HOME = {
  desktop: { center: [12, 48], zoom: 2.2, projection: "globe" },
  mobile: { center: [12, 48], zoom: 2.6, projection: "mercator" },
};
let map;
let atlas;
let displayCoordinates = new Map();

const homeView = () => desktopQuery.matches ? HOME.desktop : HOME.mobile;

const spreadCoincidentPlaces = (places) => {
  const groups = new Map();
  places.forEach((place) => {
    const key = `${place.latitude.toFixed(6)},${place.longitude.toFixed(6)}`;
    const group = groups.get(key) ?? [];
    group.push(place);
    groups.set(key, group);
  });
  const coordinates = new Map();
  groups.forEach((group) => {
    group.forEach((place, index) => {
      if (group.length === 1) {
        coordinates.set(place.id, [place.longitude, place.latitude]);
        return;
      }
      const angle = (2 * Math.PI * index) / group.length;
      const radius = 0.00035;
      coordinates.set(place.id, [
        place.longitude + Math.cos(angle) * radius,
        place.latitude + Math.sin(angle) * radius,
      ]);
    });
  });
  return coordinates;
};

const collection = (places) => ({
  type: "FeatureCollection",
  features: places.map((place) => ({
    type: "Feature",
    id: place.id,
    properties: {
      id: place.id,
      name: place.name,
      country: place.country.name,
      visits: place.visit_count,
    },
    geometry: {
      type: "Point",
      coordinates: displayCoordinates.get(place.id) ?? [place.longitude, place.latitude],
    },
  })),
});

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

const routeCollection = (trip) => {
  if (!trip || !atlas) return { type: "FeatureCollection", features: [] };
  const coordinates = trip.route.map((id) => atlas.places.get(id))
    .filter((place) => place && place.latitude !== null && place.longitude !== null)
    .map((place) => [place.longitude, place.latitude]);
  return {
    type: "FeatureCollection",
    features: splitAtDateLine(coordinates).map((segment) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: segment },
    })),
  };
};

const addJournalLayers = (places) => {
  map.addSource("journal-places", {
    type: "geojson",
    data: collection(places),
    cluster: true,
    clusterRadius: 46,
    clusterMaxZoom: 8,
  });
  map.addSource("atlas-selection", { type: "geojson", data: collection([]) });
  map.addSource("atlas-nearby", { type: "geojson", data: collection([]) });
  map.addSource("atlas-route", { type: "geojson", data: routeCollection() });
  map.addLayer({
    id: "atlas-route",
    type: "line",
    source: "atlas-route",
    paint: {
      "line-color": "#e7b44c",
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.5, 8, 3.5],
      "line-opacity": 0.9,
      "line-dasharray": [2, 1.4],
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "atlas-clusters",
    type: "circle",
    source: "journal-places",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#18201c",
      "circle-radius": ["step", ["get", "point_count"], 17, 8, 21, 20, 26],
      "circle-stroke-color": "#e7855f",
      "circle-stroke-width": 3,
      "circle-opacity": 0.96,
    },
  });
  map.addLayer({
    id: "atlas-cluster-count",
    type: "symbol",
    source: "journal-places",
    filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
    paint: { "text-color": "#f7f3ea" },
  });
  map.addLayer({
    id: "atlas-points",
    type: "circle",
    source: "journal-places",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#f7f3ea",
      "circle-radius": ["interpolate", ["linear"], ["get", "visits"], 1, 5, 5, 9],
      "circle-stroke-color": "#ef7d58",
      "circle-stroke-width": 2.5,
    },
  });
  map.addLayer({
    id: "atlas-nearby",
    type: "circle",
    source: "atlas-nearby",
    paint: {
      "circle-color": "#ef7d58",
      "circle-radius": 6,
      "circle-stroke-color": "#f7f3ea",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "atlas-selected-halo",
    type: "circle",
    source: "atlas-selection",
    paint: {
      "circle-color": "rgba(0, 0, 0, 0)",
      "circle-radius": 17,
      "circle-stroke-color": "#e7b44c",
      "circle-stroke-width": 3,
      "circle-blur": 0.1,
    },
  });
  map.addLayer({
    id: "atlas-selected",
    type: "circle",
    source: "atlas-selection",
    paint: {
      "circle-color": "#e7b44c",
      "circle-radius": 7,
      "circle-stroke-color": "#18201c",
      "circle-stroke-width": 2,
    },
  });
};

const fitPlaces = (places, options = {}) => {
  const mapped = places.filter((place) => place.latitude !== null && place.longitude !== null);
  if (!mapped.length) return;
  const bounds = new maplibregl.LngLatBounds();
  mapped.forEach((place) => bounds.extend([place.longitude, place.latitude]));
  if (mapped.length === 1) {
    map.easeTo({ center: bounds.getCenter(), zoom: 8, duration: options.instant ? 0 : 900 });
  } else {
    map.fitBounds(bounds, {
      padding: { top: 70, right: 70, bottom: 70, left: 70 },
      maxZoom: 7,
      duration: options.instant ? 0 : 900,
    });
  }
};

const start = async () => {
  try {
    atlas = await createAtlas(root, {
      onReady: async (controller) => {
        mapElement.innerHTML = "";
        mapElement.setAttribute("aria-busy", "true");
        const initialView = homeView();
        map = new maplibregl.Map({
          container: mapElement,
          style: new URL("../map/atlas-style.json", import.meta.url).href,
          center: initialView.center,
          zoom: initialView.zoom,
          cooperativeGestures: !desktopQuery.matches,
          attributionControl: { compact: true },
          maxPitch: 0,
        });
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", (event) => console.warn("Atlas map resource error", event.error));
        await Promise.race([
          new Promise((resolve) => map.once("load", resolve)),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("Map style timed out")), 15000)),
        ]);
        // Collapse after MapLibre completes its load-time resize and attribution setup.
        collapseAttribution(mapElement);
        mapElement.setAttribute("aria-busy", "false");
        atlas = controller;
        displayCoordinates = spreadCoincidentPlaces(controller.mappedPlaces);
        map.setProjection({ type: initialView.projection });
        addJournalLayers(controller.mappedPlaces);
        desktopQuery.addEventListener("change", () => {
          if (desktopQuery.matches) map.cooperativeGestures.disable();
          else map.cooperativeGestures.enable();
          if (controller.getSelection?.()) return;
          const view = homeView();
          map.setProjection({ type: view.projection });
          map.jumpTo({ center: view.center, zoom: view.zoom });
        });
        map.on("click", "atlas-clusters", async (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const zoom = await map.getSource("journal-places").getClusterExpansionZoom(feature.properties.cluster_id);
          map.easeTo({ center: feature.geometry.coordinates, zoom });
        });
        map.on("click", "atlas-points", (event) => {
          const feature = event.features?.[0];
          if (feature) controller.selectPlace(feature.properties.id);
        });
        map.on("click", "atlas-nearby", (event) => {
          const feature = event.features?.[0];
          if (feature) controller.selectPlace(feature.properties.id);
        });
        for (const layer of ["atlas-clusters", "atlas-points", "atlas-nearby"]) {
          map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
        }
      },
      onPlace: (place, nearby, options) => {
        if (!map) return;
        map.setProjection({ type: "mercator" });
        map.getSource("atlas-selection")?.setData(collection(place.latitude === null ? [] : [place]));
        map.getSource("atlas-nearby")?.setData(collection(nearby));
        if (place.latitude !== null) map.easeTo({
          center: [place.longitude, place.latitude],
          zoom: 7.5,
          duration: options.instant || reducedMotionQuery.matches ? 0 : 1000,
        });
      },
      onCountry: (_country, places, options) => {
        if (!map) return;
        map.setProjection({ type: "mercator" });
        map.getSource("atlas-selection")?.setData(collection([]));
        map.getSource("atlas-nearby")?.setData(collection(places.filter((place) => place.latitude !== null)));
        fitPlaces(places, options);
      },
      onTripFocus: (trip) => map?.getSource("atlas-route")?.setData(routeCollection(trip)),
      onTripBlur: () => map?.getSource("atlas-route")?.setData(routeCollection()),
      onReset: () => {
        if (!map) return;
        map.getSource("atlas-selection")?.setData(collection([]));
        map.getSource("atlas-nearby")?.setData(collection([]));
        map.getSource("atlas-route")?.setData(routeCollection());
        const view = homeView();
        map.setProjection({ type: view.projection });
        map.easeTo({ center: view.center, zoom: view.zoom, duration: reducedMotionQuery.matches ? 0 : 700 });
      },
    });
  } catch (error) {
    console.error(error);
    map?.remove();
    map = undefined;
    mapElement.removeAttribute("aria-busy");
    mapElement.innerHTML = "<p class=\"atlas-map-error\">The interactive map could not be loaded. Search and journal links remain available.</p>";
  }
};

start();
