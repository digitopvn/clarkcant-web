/**
 * Fills the widget gallery: each card is a request and Clark's reply, with a live widget.
 * Replies render once the card nears the viewport, so the timers and forms start fresh.
 */

import { clarkMessage } from "./conversation-thread.js";
import { REPLIES } from "./scripted-replies.js";

export function initWidgetGallery() {
  const demos = document.querySelectorAll("[data-widget-demo]");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const reply = REPLIES[entry.target.dataset.widgetDemo];
      const thread = document.createElement("ol");
      thread.className = "thread";
      thread.append(clarkMessage(reply));
      entry.target.append(thread);
    }
  }, { rootMargin: "240px" });
  demos.forEach((demo) => observer.observe(demo));
}
