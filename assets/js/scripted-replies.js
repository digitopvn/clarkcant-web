/**
 * The replies this page can give. They are scripted, and the page says so wherever they appear.
 * Anything the script does not cover gets the honest answer: Clark can't, here.
 */

import { createBillSplitWidget } from "./widgets/bill-split-widget.js";
import { createFileResultsWidget } from "./widgets/file-results-widget.js";
import { createFocusTimerWidget } from "./widgets/focus-timer-widget.js";
import { createLaptopCompareWidget } from "./widgets/laptop-compare-widget.js";

export const REPLIES = {
  "find-contract": {
    ask: "Find the contract I signed in March",
    text: "Found it. The signed one is on top; the other two are an older agreement and an unsigned draft.",
    widget: createFileResultsWidget,
  },
  "focus-timer": {
    ask: "Give me a 25-minute focus timer",
    text: "Here you go. Press start whenever you're ready.",
    widget: createFocusTimerWidget,
  },
  "split-bill": {
    ask: "Split a $186 dinner five ways, with tip",
    text: "$42.78 each with a 15% tip. Change anything and it updates.",
    widget: createBillSplitWidget,
  },
  "compare-laptops": {
    ask: "Which of these three laptops should I get?",
    text: "Depends what matters to you. Tap it, or just tell me.",
    widget: createLaptopCompareWidget,
  },
  "what-can-you-do": {
    ask: "What can you actually do?",
    text: "Whatever you can describe that your computer can do, within the folders and tools you allow. I get on with it instead of asking at every step, show you what I'm doing, and stop the moment you say stop. When a table, a chart or a tiny app says it better than words, you get that instead.",
  },
};

const KEYWORDS = [
  ["find-contract", /\b(contract|file|find|document|pdf|search)\b/i],
  ["focus-timer", /\b(timer|focus|pomodoro|countdown)\b/i],
  ["split-bill", /\b(split|bill|dinner|tip|share the cost)\b/i],
  ["compare-laptops", /\b(laptop|compare|which .* (buy|get))\b/i],
  ["what-can-you-do", /\b(what can you|who are you|what are you|help me understand|can you do)\b/i],
];

/** Pick a scripted reply for free text, or the honest fallback. */
export function replyFor(text) {
  const match = KEYWORDS.find(([, pattern]) => pattern.test(text));
  if (match) return REPLIES[match[0]];
  const wish = text.length > 60 ? `${text.slice(0, 57).trim()}…` : text;
  return {
    text: `Clark can't do that here. This page is a preview with scripted replies, so “${wish}” stays a wish for now. On your own computer, ClarkCant can.`,
    link: { href: "#open-source", label: "Get ClarkCant" },
  };
}
