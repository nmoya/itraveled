export const collapseAttribution = (mapElement) => {
  const collapse = () => {
    const attribution = mapElement.querySelector(".maplibregl-ctrl-attrib");
    attribution?.removeAttribute("open");
    attribution?.classList.remove("maplibregl-compact-show");
  };
  collapse();
  window.requestAnimationFrame(collapse);
};
