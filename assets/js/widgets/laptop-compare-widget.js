/**
 * Compare three options and re-rank them by what the visitor cares about.
 * The laptops are made up on purpose: this shows the shape of an answer, not a buying guide.
 */

import { el, widgetFrame } from "./widget-frame.js";

const OPTIONS = [
  { name: "Aster 14", price: 1299, battery: 18, weight: 1.24, speed: 7 },
  { name: "Brio 13", price: 899, battery: 12, weight: 1.05, speed: 5 },
  { name: "Cobalt 16", price: 1899, battery: 9, weight: 2.1, speed: 10 },
];

const PRIORITIES = [
  { key: "battery", label: "Battery", score: (o) => o.battery / 18 },
  { key: "weight", label: "Light", score: (o) => 1.05 / o.weight },
  { key: "price", label: "Price", score: (o) => 899 / o.price },
  { key: "speed", label: "Power", score: (o) => o.speed / 10 },
];

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function createLaptopCompareWidget() {
  const chosen = new Set(["battery", "weight"]);
  const list = el("ol", { class: "compare__list" });
  const reason = el("p", { class: "compare__reason", "aria-live": "polite" });

  const rows = new Map(OPTIONS.map((o) => [o.name, el(
    "li", { class: "compare__row" },
    el("span", { class: "compare__name" }, o.name),
    el("span", { class: "compare__specs" }, `$${o.price.toLocaleString("en-US")} · ${o.battery} h · ${o.weight} kg`),
    el("span", { class: "compare__meter" }, el("span", { class: "compare__fill" })),
  )]));

  const chips = PRIORITIES.map((p) => el("button", {
    type: "button", class: "segmented__btn", "aria-pressed": String(chosen.has(p.key)),
    onclick: (event) => {
      if (chosen.has(p.key) && chosen.size > 1) chosen.delete(p.key); else chosen.add(p.key);
      event.currentTarget.setAttribute("aria-pressed", String(chosen.has(p.key)));
      render();
    },
  }, p.label));

  function render() {
    const active = PRIORITIES.filter((p) => chosen.has(p.key));
    const ranked = OPTIONS
      .map((o) => ({ o, score: active.reduce((sum, p) => sum + p.score(o), 0) / active.length }))
      .sort((a, b) => b.score - a.score);

    // FLIP: remember where rows were, reorder, then animate from the old spot to the new one.
    const before = new Map([...rows].map(([name, row]) => [name, row.getBoundingClientRect().top]));
    ranked.forEach(({ o, score }, i) => {
      const row = rows.get(o.name);
      row.classList.toggle("is-pick", i === 0);
      row.querySelector(".compare__fill").style.transform = `scaleX(${Math.max(0.08, score).toFixed(3)})`;
      list.append(row);
    });
    if (!reducedMotion.matches) {
      for (const [name, row] of rows) {
        const delta = before.get(name) - row.getBoundingClientRect().top;
        if (delta) row.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    }
    const names = active.map((p) => p.label.toLowerCase()).join(" and ");
    reason.textContent = `If ${names} matter most, go with the ${ranked[0].o.name}.`;
  }

  const body = el(
    "div", { class: "compare" },
    el("div", { class: "compare__prefs" }, el("span", { class: "split__label" }, "What matters to you?"), el("div", { class: "segmented segmented--wrap", role: "group", "aria-label": "Priorities" }, chips)),
    list,
    reason,
  );
  render();

  return widgetFrame({ icon: "compare", title: "Comparison", meta: "3 options", body, foot: "Made-up laptops. Tap what you care about and the ranking follows." });
}
