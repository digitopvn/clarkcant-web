/**
 * The hero is a working composer. Asking something (typed or a chip) turns the hero into a
 * conversation: the title steps back, the Orb thinks, and Clark answers with a widget.
 */

import { streamReply, userMessage } from "./conversation-thread.js";
import { REPLIES, replyFor } from "./scripted-replies.js";

/** How the Orb looks while Clark thinks and answers. Resting is the shipped shape. */
const ORB_PHASES = {
  thinking: { exposure: 2.9, glow: 0.42, chromatic: 0.7 },
  answering: { exposure: 2.4, glow: 0.36, chromatic: 0.55 },
  idle: { exposure: 2.0, glow: 0.3, chromatic: 0.42 },
};

export function initHeroConversation(heroOrb) {
  const hero = document.querySelector("[data-hero]");
  const thread = hero.querySelector("[data-thread]");
  const form = hero.querySelector("[data-composer]");
  const input = hero.querySelector("[data-composer-input]");
  const send = form.querySelector(".composer__send");
  const chips = [...hero.querySelectorAll("[data-ask]")];
  let busy = false;

  const syncSend = () => { send.disabled = busy || input.value.trim() === ""; };
  const grow = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 128)}px`; };

  async function ask(text, reply) {
    if (busy) return;
    busy = true;
    chips.forEach((chip) => { chip.disabled = true; });
    syncSend();
    hero.dataset.active = "";
    thread.append(userMessage(text));
    await streamReply(thread, reply, (phase) => heroOrb.setShape(ORB_PHASES[phase]));
    busy = false;
    chips.forEach((chip) => { chip.disabled = false; });
    syncSend();
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    grow();
    ask(text, replyFor(text));
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => { grow(); syncSend(); });

  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const reply = REPLIES[chip.dataset.ask];
      ask(reply.ask, reply);
    });
  }

  // The closing "Tell Clark" button brings the visitor back to the one place that matters.
  document.querySelectorAll("[data-focus-composer]").forEach((link) => {
    link.addEventListener("click", () => setTimeout(() => input.focus({ preventScroll: true }), 450));
  });

  syncSend();
}
