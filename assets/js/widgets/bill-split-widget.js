/** Split a bill: change the total, the people or the tip, and the answer follows. */

import { el, widgetFrame } from "./widget-frame.js";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function createBillSplitWidget() {
  const state = { total: 186, people: 5, tip: 15 };

  const perPerson = el("output", { class: "split__result", "aria-live": "polite" });
  const breakdown = el("p", { class: "split__breakdown" });
  const peopleOut = el("output", { class: "split__count" });

  const totalInput = el("input", {
    type: "number", min: "0", step: "1", value: String(state.total), inputmode: "decimal",
    class: "split__total", "aria-label": "Bill total in dollars",
  });
  totalInput.addEventListener("input", () => { state.total = Math.max(0, Number(totalInput.value) || 0); render(); });

  const step = (delta) => () => { state.people = Math.min(20, Math.max(1, state.people + delta)); render(); };
  const minus = el("button", { type: "button", class: "stepper__btn", "aria-label": "One fewer person", onclick: step(-1) }, "−");
  const plus = el("button", { type: "button", class: "stepper__btn", "aria-label": "One more person", onclick: step(1) }, "+");

  const tips = [0, 10, 15, 20].map((value) =>
    el("button", {
      type: "button", class: "segmented__btn", "aria-pressed": String(value === state.tip),
      onclick: () => { state.tip = value; render(); },
    }, value === 0 ? "No tip" : `${value}%`),
  );

  function render() {
    const withTip = state.total * (1 + state.tip / 100);
    perPerson.textContent = money.format(withTip / state.people);
    breakdown.textContent = `${money.format(state.total)} + ${state.tip}% tip = ${money.format(withTip)}, split ${state.people} ways`;
    peopleOut.textContent = String(state.people);
    tips.forEach((button, i) => button.setAttribute("aria-pressed", String([0, 10, 15, 20][i] === state.tip)));
  }
  render();

  const body = el(
    "div", { class: "split" },
    el("div", { class: "split__hero" }, el("span", { class: "split__label" }, "Each person pays"), perPerson, breakdown),
    el("div", { class: "split__controls" },
      el("label", { class: "field" }, el("span", {}, "Bill"), el("span", { class: "field__prefix" }, "$", totalInput)),
      el("div", { class: "field" }, el("span", {}, "People"), el("div", { class: "stepper" }, minus, peopleOut, plus)),
      el("div", { class: "field field--wide" }, el("span", {}, "Tip"), el("div", { class: "segmented", role: "group", "aria-label": "Tip" }, tips)),
    ),
  );

  return widgetFrame({ icon: "receipt", title: "Bill split", meta: "calculator", body });
}
