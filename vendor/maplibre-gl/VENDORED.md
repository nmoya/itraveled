# MapLibre GL JS

Version 6.12.0 is vendored from the `maplibre-gl` npm distribution under the
BSD-3-Clause license. The main module, shared module, worker, and CSS must be
updated together because both runtime modules import the shared file by a
relative path.

Upstream: <https://github.com/maplibre/maplibre-gl-js>

After an update, verify globe and Mercator projections, clustering, map worker
loading, mobile cooperative gestures, and the local Atlas style.
