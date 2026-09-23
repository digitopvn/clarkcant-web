/**
 * File search results, the way Clark's read-only search reports them: the matches, where they
 * are, and just enough of the matching text to tell them apart. Expand a row to see the excerpt.
 */

import { el, widgetFrame } from "./widget-frame.js";

const RESULTS = [
  {
    name: "Studio lease — signed.pdf",
    where: "Documents / Contracts",
    when: "14 Mar",
    tag: "Signed",
    excerpt: "…this Agreement is signed by both parties on 14 March 2026 and takes effect on 1 April…",
  },
  {
    name: "Freelance agreement v3.docx",
    where: "Downloads",
    when: "9 Mar",
    excerpt: "…the Contractor will deliver the first milestone within thirty (30) days of signing…",
  },
  {
    name: "Lease draft (unsigned).pdf",
    where: "Desktop",
    when: "2 Mar",
    excerpt: "…SIGNATURE: ____________  DATE: ____________…",
  },
];

export function createFileResultsWidget() {
  const list = el("ul", { class: "files" });
  RESULTS.forEach((file, i) => {
    const excerpt = el("p", { class: "files__excerpt", id: `excerpt-${Math.random().toString(36).slice(2, 8)}` }, file.excerpt);
    excerpt.hidden = i !== 0;
    const row = el(
      "button",
      { type: "button", class: "files__row", "aria-expanded": String(i === 0), "aria-controls": excerpt.id },
      el("span", { class: "files__icon", "aria-hidden": "true" }, file.name.endsWith(".pdf") ? "PDF" : "DOC"),
      el("span", { class: "files__text" }, el("span", { class: "files__name" }, file.name), el("span", { class: "files__where" }, `${file.where} · ${file.when}`)),
      file.tag && el("span", { class: "files__tag" }, file.tag),
    );
    row.addEventListener("click", () => {
      const open = row.getAttribute("aria-expanded") !== "true";
      row.setAttribute("aria-expanded", String(open));
      excerpt.hidden = !open;
    });
    list.append(el("li", {}, row, excerpt));
  });

  return widgetFrame({
    icon: "search", title: "Searched your files", meta: "read-only", body: list,
    foot: "Nothing was moved or changed. Only the matching lines were read.",
  });
}
