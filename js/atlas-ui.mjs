const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
})[character]);

const normalize = (value) => String(value).normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .trim();

export const distanceBetween = (first, second) => {
  const radians = Math.PI / 180;
  const latitude = (second.latitude - first.latitude) * radians;
  const longitude = (second.longitude - first.longitude) * radians;
  const value = Math.sin(latitude / 2) ** 2
    + Math.cos(first.latitude * radians) * Math.cos(second.latitude * radians)
    * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const resultScore = (name, query) => {
  const normalized = normalize(name);
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (normalized.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  return normalized.includes(query) ? 3 : 99;
};

export const createAtlas = async (root, hooks = {}) => {
  const search = root.querySelector("[data-atlas-search]");
  const results = root.querySelector("[data-atlas-results]");
  const status = root.querySelector("[data-atlas-status]");
  const reset = root.querySelector("[data-atlas-reset]");
  const dossier = root.querySelector("[data-atlas-dossier]");
  const siteUrl = (path) => new URL(path.replace(/^\/+/, ""), root.dataset.siteRoot).href;
  const response = await fetch(root.dataset.atlasUrl);
  if (!response.ok) throw new Error(`Atlas data returned ${response.status}`);
  const data = await response.json();
  const places = new Map(data.places.map((place) => [place.id, place]));
  const countries = new Map(data.countries.map((country) => [country.id, country]));
  const trips = new Map(data.trips.map((trip) => [trip.id, trip]));
  const mappedPlaces = data.places.filter((place) => place.latitude !== null && place.longitude !== null);
  let matches = [];
  let activeIndex = -1;
  let selection = null;
  let appliedUrlSelection = null;

  const nearbyPlaces = (place) => mappedPlaces
    .filter((candidate) => candidate.id !== place.id)
    .map((candidate) => ({ ...candidate, distance: distanceBetween(place, candidate) }))
    .sort((first, second) => first.distance - second.distance || first.name.localeCompare(second.name))
    .slice(0, 8);

  const closeResults = () => {
    results.hidden = true;
    search.setAttribute("aria-expanded", "false");
    search.removeAttribute("aria-activedescendant");
  };

  const renderResults = () => {
    if (!matches.length) {
      closeResults();
      return;
    }
    results.innerHTML = matches.map((match, index) => {
      const detail = match.type === "country"
        ? `${match.item.place_count} places &middot; ${match.item.trip_count} trips`
        : `${escapeHtml(match.item.country.name)} &middot; ${match.item.visit_count} ${match.item.visit_count === 1 ? "trip" : "trips"}`;
      return `<button type="button" role="option" id="atlas-search-result-${index}" aria-selected="${index === activeIndex}" data-result-index="${index}"><span>${escapeHtml(match.item.name)}</span><small>${detail}</small></button>`;
    }).join("");
    results.hidden = false;
    search.setAttribute("aria-expanded", "true");
    if (activeIndex >= 0) search.setAttribute("aria-activedescendant", `atlas-search-result-${activeIndex}`);
    else search.removeAttribute("aria-activedescendant");
  };

  const updateUrl = (type, id, replace = false) => {
    const url = new URL(window.location.href);
    url.hash = type && id ? `${type}=${id}` : "";
    appliedUrlSelection = url.hash.slice(1);
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
  };

  const renderEmptyDossier = () => {
    dossier.innerHTML = `<div class="atlas-dossier-empty"><p class="eyebrow">Geographic index</p><h2>Explore the map</h2><p>Select a place or search the atlas. Browse the complete <a href="${siteUrl("places/")}">place</a> and <a href="${siteUrl("countries/")}">country</a> indexes.</p><dl><div><dt>Places</dt><dd>${data.places.length}</dd></div><div><dt>Countries</dt><dd>${data.countries.length}</dd></div><div><dt>Trips</dt><dd>${data.trips.length}</dd></div></dl></div>`;
  };

  const renderPlace = (place) => {
    const visits = place.visits.map((visit) => {
      const trip = trips.get(visit.id);
      const route = trip.route.map((id) => places.get(id)?.name).filter(Boolean).join(" <span aria-hidden=\"true\">&#8594;</span> ");
      return `<a class="atlas-trip-card" href="${siteUrl(trip.url)}" data-trip-id="${trip.id}"><time>${escapeHtml(trip.date_label)}</time><strong>${escapeHtml(trip.name)}</strong><span>${route || "One recorded destination"}</span></a>`;
    }).join("");
    dossier.innerHTML = `<article class="atlas-place-dossier"><h2>${escapeHtml(place.name)}&nbsp;<a class="atlas-place-title-link" href="${siteUrl(place.url)}" aria-label="Open place journal" title="Open place journal">&#8599;</a></h2><p class="atlas-dossier-country"><a href="${siteUrl(place.country.url)}">${escapeHtml(place.country.name)}</a> &middot; ${place.visit_count} ${place.visit_count === 1 ? "trip" : "trips"} &middot; ${place.first_year === place.last_year ? place.first_year : `${place.first_year}-${place.last_year}`}</p><h3>Trips</h3><div class="atlas-trip-list">${visits}</div></article>`;
  };

  const renderCountry = (country) => {
    const countryPlaces = country.places.map((id) => places.get(id)).filter(Boolean)
      .sort((first, second) => first.name.localeCompare(second.name));
    const buttons = countryPlaces.map((place) => `<button type="button" data-place-id="${place.id}"><span>${escapeHtml(place.name)}</span><strong>${place.visit_count} ${place.visit_count === 1 ? "trip" : "trips"}</strong></button>`).join("");
    dossier.innerHTML = `<article class="atlas-place-dossier atlas-country-dossier"><p class="eyebrow">Country index</p><h2>${escapeHtml(country.name)}</h2><p class="atlas-dossier-country">${country.place_count} places &middot; ${country.trip_count} trips</p><a class="atlas-place-link" href="${siteUrl(country.url)}">Open country journal &#8599;</a><h3>Recorded places</h3><div class="atlas-country-place-list">${buttons}</div></article>`;
  };

  const selectPlace = (id, options = {}) => {
    const place = places.get(Number(id));
    if (!place) return;
    const nearby = place.latitude === null ? [] : nearbyPlaces(place);
    selection = { type: "place", id: place.id };
    search.value = place.name;
    closeResults();
    status.textContent = "";
    renderPlace(place);
    hooks.onPlace?.(place, nearby, options);
    if (options.updateUrl !== false) updateUrl("place", place.id, options.replaceUrl);
  };

  const selectCountry = (id, options = {}) => {
    const country = countries.get(Number(id));
    if (!country) return;
    const countryPlaces = country.places.map((placeId) => places.get(placeId)).filter(Boolean);
    selection = { type: "country", id: country.id };
    search.value = country.name;
    closeResults();
    status.textContent = "";
    renderCountry(country);
    hooks.onCountry?.(country, countryPlaces, options);
    if (options.updateUrl !== false) updateUrl("country", country.id, options.replaceUrl);
  };

  const chooseResult = (match) => {
    if (match.type === "country") selectCountry(match.item.id);
    else selectPlace(match.item.id);
  };

  const updateMatches = () => {
    const query = normalize(search.value);
    activeIndex = -1;
    matches = query ? [
      ...data.countries.map((item) => ({ type: "country", item, score: resultScore(item.name, query) })),
      ...data.places.map((item) => ({ type: "place", item, score: resultScore(item.name, query) })),
    ].filter((match) => match.score < 99)
      .sort((first, second) => first.score - second.score
        || (first.type === second.type ? 0 : first.type === "country" ? -1 : 1)
        || first.item.name.localeCompare(second.item.name))
      .slice(0, 9) : [];
    renderResults();
    if (!query) status.textContent = "";
    else if (!matches.length) status.textContent = `No recorded place or country matches "${search.value.trim()}".`;
    else status.textContent = "";
  };

  search.addEventListener("input", updateMatches);
  search.addEventListener("focus", updateMatches);
  search.addEventListener("blur", () => window.setTimeout(closeResults, 120));
  search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && matches.length) {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % matches.length;
      renderResults();
    } else if (event.key === "ArrowUp" && matches.length) {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + matches.length) % matches.length;
      renderResults();
    } else if (event.key === "Enter" && matches.length) {
      event.preventDefault();
      chooseResult(matches[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === "Escape") closeResults();
  });
  results.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-result-index]");
    if (!button) return;
    event.preventDefault();
    chooseResult(matches[Number(button.dataset.resultIndex)]);
  });
  dossier.addEventListener("click", (event) => {
    const button = event.target.closest("[data-place-id]");
    if (button) selectPlace(button.dataset.placeId);
  });
  dossier.addEventListener("pointerover", (event) => {
    const trip = event.target.closest("[data-trip-id]");
    if (trip) hooks.onTripFocus?.(trips.get(Number(trip.dataset.tripId)));
  });
  dossier.addEventListener("focusin", (event) => {
    const trip = event.target.closest("[data-trip-id]");
    if (trip) hooks.onTripFocus?.(trips.get(Number(trip.dataset.tripId)));
  });
  dossier.addEventListener("pointerout", (event) => {
    if (event.target.closest("[data-trip-id]") && !event.relatedTarget?.closest?.("[data-trip-id]")) hooks.onTripBlur?.();
  });
  dossier.addEventListener("focusout", (event) => {
    if (event.target.closest("[data-trip-id]") && !event.relatedTarget?.closest?.("[data-trip-id]")) hooks.onTripBlur?.();
  });
  const clearSelection = (options = {}) => {
    selection = null;
    search.value = "";
    matches = [];
    closeResults();
    status.textContent = "";
    renderEmptyDossier();
    if (options.updateUrl !== false) updateUrl(null, null, options.replaceUrl);
    hooks.onReset?.();
    if (options.focus !== false) search.focus();
  };
  reset.addEventListener("click", () => clearSelection());

  const controller = {
    data,
    mappedPlaces,
    places,
    trips,
    selectPlace,
    selectCountry,
    clearSelection,
    getSelection: () => selection,
  };
  renderEmptyDossier();
  await hooks.onReady?.(controller);
  const applyUrlSelection = (instant = true) => {
    const key = window.location.hash.slice(1);
    if (key === appliedUrlSelection) return;
    appliedUrlSelection = key;
    const [hashType, hashId] = key.split("=");
    if (hashType === "place") selectPlace(hashId, { updateUrl: false, instant });
    else if (hashType === "country") selectCountry(hashId, { updateUrl: false, instant });
    else clearSelection({ updateUrl: false, focus: false });
  };
  applyUrlSelection();
  window.addEventListener("popstate", () => applyUrlSelection(false));
  window.addEventListener("hashchange", () => applyUrlSelection(false));
  return controller;
};
