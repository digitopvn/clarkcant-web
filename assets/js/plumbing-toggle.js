/**
 * "Show me the plumbing": the machinery is always there, out of focus, until asked for.
 * Progressive disclosure, demonstrated by the page instead of described.
 */

export function initPlumbing() {
  const below = document.querySelector("[data-plumbing-below]");
  if (!below) return;
  const toggle = below.querySelector("[data-plumbing-toggle]");
  const label = below.querySelector("[data-plumbing-label]");
  const caption = below.querySelector("[data-plumbing-caption]");
  below.querySelectorAll(".plumbing__list li").forEach((item, i) => item.style.setProperty("--i", i));

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    below.toggleAttribute("data-open", open);
    label.textContent = open ? "Put it back underneath" : "Show me the plumbing";
    caption.textContent = open ? "Still here. Still Clark's job, not yours." : "What Clark handles.";
  });
}
