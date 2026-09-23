/**
 * Mounts an Orb on a `<canvas data-orb>` element and owns its schedule.
 *
 * - Draws only while the canvas is on screen, so five Orbs on one page cost one or two at a time.
 * - Answers the pointer anywhere near it (tracked on the element named by data-orb-pointer, or
 *   the window), because light arriving from nearby is the effect, not a hover state on a box.
 * - With reduced motion it draws one still frame per change and never loops.
 * - Without WebGL the wrapper gets `.orb--fallback` and CSS paints a static Orb instead.
 */

import { createOrbRenderer, pointerFromClient } from "./orb-renderer.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Reads `--orb-body` (an "r g b" triple in 0..1) so the glass can follow the theme if a page asks. */
function readBodyColor(canvas) {
  const raw = getComputedStyle(canvas).getPropertyValue("--orb-body").trim();
  const parts = raw.split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? parts : undefined;
}

export function mountOrb(canvas, options = {}) {
  const shell = canvas.closest(".orb") || canvas.parentElement;
  const created = createOrbRenderer(canvas, options);
  if (!created.ok) {
    shell.classList.add("orb--fallback");
    return { setShape() {}, setLevel() {}, redraw() {}, ok: false };
  }

  const orb = created.renderer;
  const body = readBodyColor(canvas);
  if (body) orb.setCanvasColor(body);

  let visible = false;
  let running = false;
  let alwaysAnimate = !reducedMotion.matches;

  function loop(now) {
    if (!visible) { running = false; return; }
    orb.frame(now);
    if (alwaysAnimate || orb.isSettling()) {
      requestAnimationFrame(loop);
    } else {
      running = false;
    }
  }

  function kick() {
    if (running || !visible) return;
    running = true;
    requestAnimationFrame(loop);
  }

  // Reduced motion: shape changes still land (they carry meaning), but as a still frame.
  function redraw() {
    if (alwaysAnimate) { kick(); return; }
    requestAnimationFrame((now) => orb.frame(now, true));
  }

  const resize = () => { orb.resize(); redraw(); };
  new ResizeObserver(resize).observe(canvas);

  new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) { orb.resize(); alwaysAnimate ? kick() : redraw(); }
  }, { rootMargin: "80px" }).observe(canvas);

  reducedMotion.addEventListener("change", () => {
    alwaysAnimate = !reducedMotion.matches;
    redraw();
  });

  if (!reducedMotion.matches && options.pointer !== false) {
    const target = options.pointerTarget || window;
    let pending = null;
    target.addEventListener("pointermove", (event) => {
      if (!visible || event.pointerType === "touch") return;
      pending = event;
      requestAnimationFrame(() => {
        if (!pending) return;
        orb.setPointer(pointerFromClient(canvas.getBoundingClientRect(), pending.clientX, pending.clientY));
        pending = null;
      });
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => orb.setPointer({ x: 0, y: 0, strength: 0 }));
  }

  // A tap on touch devices gives the shell a single poke, so phones get the jelly too.
  canvas.addEventListener("pointerdown", (event) => {
    if (reducedMotion.matches) return;
    const rect = canvas.getBoundingClientRect();
    orb.setPointer(pointerFromClient(rect, event.clientX, event.clientY));
    orb.setLevel(0.7);
    kick();
    setTimeout(() => orb.setLevel(0), 140);
    if (event.pointerType === "touch") setTimeout(() => orb.setPointer({ x: 0, y: 0, strength: 0 }), 600);
  });

  return {
    ok: true,
    setShape(next) { orb.setShape(next); redraw(); },
    setLevel(value) { orb.setLevel(value); kick(); },
    redraw,
  };
}
