/**
 * Renders messages into a thread: the visitor's bubble, a thinking state, and Clark's reply
 * streamed word by word with its widget arriving after the words. Used by the hero and by the
 * widget gallery, so both speak with the same voice.
 */

import { el } from "./widgets/widget-frame.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reducedMotion.matches ? 0 : ms));

export function userMessage(text) {
  return el("li", { class: "msg msg--user" }, el("p", { class: "bubble bubble--user" }, text));
}

function clarkShell() {
  const body = el("div", { class: "msg__body" });
  const node = el("li", { class: "msg msg--clark" }, el("span", { class: "orb-mark", "aria-hidden": "true" }), body);
  return { node, body };
}

/** Clark's reply, fully formed, for places that should not animate (the static gallery). */
export function clarkMessage(reply) {
  const { node, body } = clarkShell();
  body.append(el("p", { class: "msg__text" }, reply.text));
  if (reply.widget) body.append(reply.widget());
  return node;
}

/**
 * Stream a reply into `thread`. Resolves once the widget is on screen.
 * `onPhase` hears "thinking" → "answering" → "idle", which the Orb uses to change its state.
 */
export async function streamReply(thread, reply, onPhase = () => {}) {
  const { node, body } = clarkShell();
  node.dataset.thinking = "";
  // Busy while streaming, so a screen reader hears the finished sentence once, not every word.
  node.setAttribute("aria-busy", "true");
  const dots = el("span", { class: "msg__thinking", "aria-label": "Clark is thinking" }, el("span"), el("span"), el("span"));
  body.append(dots);
  thread.append(node);
  onPhase("thinking");
  reveal(node);

  await wait(650 + Math.random() * 450);
  dots.remove();
  delete node.dataset.thinking;
  onPhase("answering");

  const text = el("p", { class: "msg__text" });
  body.append(text);
  const words = reply.text.split(" ");
  if (reducedMotion.matches) {
    text.textContent = reply.text;
  } else {
    for (let i = 0; i < words.length; i += 1) {
      text.textContent = words.slice(0, i + 1).join(" ");
      await wait(22 + Math.random() * 26);
    }
  }

  if (reply.link) {
    text.append(" ", el("a", { href: reply.link.href }, reply.link.label, " →"));
  }
  if (reply.widget) {
    await wait(180);
    body.append(reply.widget());
  }
  node.removeAttribute("aria-busy");
  reveal(node);
  onPhase("idle");
}

/** Keep the newest message in view without yanking the page further than needed. */
function reveal(node) {
  const rect = node.getBoundingClientRect();
  const composer = document.querySelector("[data-composer]");
  const bottomLimit = composer ? composer.getBoundingClientRect().bottom + 24 : window.innerHeight;
  const overflow = bottomLimit - window.innerHeight;
  if (overflow <= 0) return;
  // Bring the composer into view, but never push the start of the reply under the header.
  const delta = Math.min(overflow, rect.top - 88);
  if (delta > 0) window.scrollBy({ top: delta, behavior: reducedMotion.matches ? "auto" : "smooth" });
}
