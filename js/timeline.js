const order = document.querySelector("#timeline-order");
const timeline = document.querySelector(".timeline");

if (order && timeline) {
  const trips = [...timeline.children];
  let ascending = false;

  const render = () => {
    const direction = ascending ? 1 : -1;
    const sortedTrips = [...trips].sort(
      (left, right) =>
        direction *
        (Number(left.dataset.timelineOrder) - Number(right.dataset.timelineOrder)),
    );

    sortedTrips.forEach((trip, index) => {
      const previous = sortedTrips[index - 1];
      const weeks = previous
        ? Number(
            direction === 1
              ? trip.dataset.weeksFromPrevious
              : previous.dataset.weeksFromPrevious,
          )
        : 0;
      trip.style.setProperty("--weeks-from-previous", weeks);
      timeline.append(trip);
    });

    const startYear = ascending ? order.dataset.earliestYear : order.dataset.latestYear;
    const endYear = ascending ? order.dataset.latestYear : order.dataset.earliestYear;
    order.textContent = `${startYear} -> ${endYear}`;
    order.setAttribute(
      "aria-label",
      `Show ${ascending ? "newest" : "oldest"} trips first`,
    );
  };

  order.addEventListener("click", () => {
    ascending = !ascending;
    render();
  });
  render();
}
