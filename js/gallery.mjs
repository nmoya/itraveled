const gallery = document.querySelector(".gallery-months");

if (gallery) {
  const sections = [...gallery.querySelectorAll(".gallery-month")];
  const links = [...document.querySelectorAll(".gallery-month-nav a")];
  const defaultId = `gallery-month-${gallery.dataset.defaultMonth}`;

  function showMonth(requestedId = window.location.hash.slice(1)) {
    const selectedId = sections.some((section) => section.id === requestedId)
      ? requestedId
      : defaultId;

    for (const section of sections) {
      section.hidden = section.id !== selectedId;
    }
    for (const link of links) {
      if (link.hash === `#${selectedId}`) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }

  showMonth();
  for (const link of links) {
    link.addEventListener("click", () => showMonth(link.hash.slice(1)));
  }
  window.addEventListener("hashchange", () => showMonth());
}
