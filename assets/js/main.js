/** Entry point: mount the Orbs, then wire each section to the Orb it talks to. */

import { mountOrb } from "./orb/mount-orb.js";
import { initHeroConversation } from "./hero-conversation.js";
import { initStory } from "./story-chapters.js";
import { initPlumbing } from "./plumbing-toggle.js";
import { initWidgetGallery } from "./widget-gallery.js";
import { initVoiceListen } from "./voice-listen.js";
import { initCopyButtons, initHeader, initReveal, initThemeToggle } from "./page-chrome.js";

const orbs = {};
for (const canvas of document.querySelectorAll("canvas[data-orb]")) {
  const name = canvas.dataset.orb;
  // Large Orbs are soft light: a lower pixel ratio costs nothing visible and saves the GPU.
  orbs[name] = mountOrb(canvas, { maxPixelRatio: name === "hero" || name === "voice" ? 1.5 : 1.25 });
}

initThemeToggle();
initHeader();
initHeroConversation(orbs.hero);
initStory(orbs.story);
initPlumbing();
initWidgetGallery();
initVoiceListen(orbs.voice);
initReveal();
initCopyButtons();
