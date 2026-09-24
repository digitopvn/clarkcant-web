/**
 * Page chrome: theme toggle, header state on scroll, current section in the nav, scroll reveals,
 * and the copy button on code blocks.
 */

const THEMES = ["system", "light", "dark"];

export function initThemeToggle() {
  const button = document.querySelector("[data-theme-toggle]");
  const root = document.documentElement;
  const apply = (mode) => {
    root.dataset.theme = mode;
    button.dataset.mode = mode;
    button.setAttribute("aria-label", `Theme: ${mode}. Switch theme`);
    try {
      if (mode === "system") localStorage.removeItem("cc-theme"); else localStorage.setItem("cc-theme", mode);
    } catch { /* storage may be unavailable; the choice still applies for this visit */ }
  };
  apply(THEMES.includes(root.dataset.theme) ? root.dataset.theme : "system");
  button.addEventListener("click", () => apply(THEMES[(THEMES.indexOf(root.dataset.theme) + 1) % THEMES.length]));
}

export function initHeader() {
  const header = document.querySelector("[data-header]");
  const onScroll = () => header.toggleAttribute("data-scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const links = new Map([...document.querySelectorAll(".site-nav a")].map((a) => [a.getAttribute("href").slice(1), a]));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      // Sections without a nav link (the hero, the finale) clear the highlight.
      links.forEach((l) => l.removeAttribute("aria-current"));
      links.get(entry.target.id)?.setAttribute("aria-current", "true");
    }
  }, { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll("main > section").forEach((section) => observer.observe(section));
}

export function initReveal() {
  const targets = document.querySelectorAll(".section__head, .plumbing__board, .widget-demo, .voice__grid, .principle-list li, .oss-grid > *, .finale > *");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  targets.forEach((target) => { target.setAttribute("data-reveal", ""); observer.observe(target); });
}

export function initCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    // Labels come from the button so a translated page keeps its own language.
    const idle = button.textContent;
    button.addEventListener("click", async () => {
      const code = button.closest("[data-code]").querySelector("code").textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = button.dataset.copiedLabel || "Copied";
      } catch {
        button.textContent = button.dataset.failedLabel || "Select and copy";
      }
      setTimeout(() => { button.textContent = idle; }, 1600);
    });
  });
}
