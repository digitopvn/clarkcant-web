/**
 * A working focus timer: the kind of tiny app Clark can hand you inside a reply.
 * It really counts down; nothing here is animated for show.
 */

import { el, widgetFrame } from "./widget-frame.js";

const CIRCUMFERENCE = 2 * Math.PI * 52;

function format(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function createFocusTimerWidget() {
  let total = 25 * 60;
  let left = total;
  let ticking = null;
  let endsAt = 0;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("class", "timer__ring");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<circle cx="60" cy="60" r="52" class="timer__track"/><circle cx="60" cy="60" r="52" class="timer__progress" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="0"/>`;
  const bar = svg.querySelector(".timer__progress");

  const readout = el("output", { class: "timer__readout", "aria-live": "off" }, format(left));
  const status = el("span", { class: "timer__status" }, "Ready when you are");
  const startButton = el("button", { type: "button", class: "button button--small" }, "Start");
  const resetButton = el("button", { type: "button", class: "button button--small button--quiet" }, "Reset");
  const addButton = el("button", { type: "button", class: "button button--small button--quiet" }, "+5 min");

  function render() {
    readout.textContent = format(left);
    bar.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE * (1 - left / total)));
  }

  function stop(message) {
    clearInterval(ticking);
    ticking = null;
    startButton.textContent = left === 0 ? "Again" : "Resume";
    status.textContent = message;
  }

  function tick() {
    left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    render();
    if (left === 0) {
      stop("Done. Take a breath.");
      left = total;
      readout.setAttribute("aria-live", "polite");
      readout.textContent = "00:00";
    }
  }

  startButton.addEventListener("click", () => {
    if (ticking) { stop("Paused"); return; }
    endsAt = Date.now() + left * 1000;
    ticking = setInterval(tick, 250);
    startButton.textContent = "Pause";
    status.textContent = "Focusing";
  });
  resetButton.addEventListener("click", () => { stop("Ready when you are"); total = 25 * 60; left = total; startButton.textContent = "Start"; render(); });
  addButton.addEventListener("click", () => {
    total += 300; left += 300;
    if (ticking) endsAt += 300 * 1000;
    render();
  });

  const body = el(
    "div", { class: "timer" },
    el("div", { class: "timer__dial" }, svg, el("div", { class: "timer__center" }, readout, status)),
    el("div", { class: "timer__controls" }, startButton, addButton, resetButton),
  );

  return widgetFrame({ icon: "timer", title: "Focus timer", meta: "mini-app", body, foot: "Runs right here in the reply. Close it and it's gone." });
}
