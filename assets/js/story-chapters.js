/**
 * Drives the story stage from scroll position. The chapter whose middle is nearest the middle
 * of the viewport is current; the section's data-chapter changes the cage, the bubbles, the
 * name, and the Orb's shape together.
 */

const SHAPES = {
  1: { exposure: 0.45, chromatic: 0.0, glow: 0.05, sheen: 0.12, radius: 0.6 },
  2: { exposure: 1.3, chromatic: 0.25, glow: 0.18, sheen: 0.22, radius: 0.68 },
  3: { exposure: 2.3, chromatic: 0.5, glow: 0.36, sheen: 0.3, radius: 0.74 },
};

export function initStory(storyOrb) {
  const story = document.querySelector("[data-story]");
  if (!story) return;
  const chapters = [...story.querySelectorAll("[data-chapter-step]")];
  let current = null;

  function setChapter(step) {
    if (step === current) return;
    current = step;
    story.dataset.chapter = step;
    chapters.forEach((chapter) => chapter.classList.toggle("is-current", chapter.dataset.chapterStep === step));
    storyOrb.setShape(SHAPES[step]);
  }

  // Thin band across the middle of the viewport: a chapter is current while it crosses it.
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) setChapter(entry.target.dataset.chapterStep);
    }
  }, { rootMargin: "-45% 0px -45% 0px" });
  chapters.forEach((chapter) => observer.observe(chapter));

  // The refusals only nag once the story holds the screen, not while its edge peeks in.
  new IntersectionObserver((entries) => {
    story.toggleAttribute("data-live", entries[0].isIntersecting);
  }, { rootMargin: "-30% 0px -30% 0px" }).observe(story);

  setChapter("1");
}
