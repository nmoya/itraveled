const protectedPhotographSelector = "[data-protected-photograph]";

function preventPhotographAction(event) {
  if (event.target instanceof Element && event.target.matches(protectedPhotographSelector)) {
    event.preventDefault();
  }
}

document.addEventListener("contextmenu", preventPhotographAction);
document.addEventListener("dragstart", preventPhotographAction);
