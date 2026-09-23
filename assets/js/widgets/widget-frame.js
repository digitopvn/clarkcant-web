/**
 * Shared frame for every widget Clark replies with: a quiet header naming what it is, a body,
 * and an optional footer that says where the data came from. Honest provenance is part of the
 * frame, so no widget can forget it.
 */

export const ICONS = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
  timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.2 1.6M9.5 2.5h5"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  compare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

/** Small DOM helper: el("div", {class: "x"}, child, "text"). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function widgetFrame({ icon, title, meta, body, foot, label }) {
  return el(
    "section",
    { class: "widget", "aria-label": label || title },
    el("header", { class: "widget__head" }, el("span", { html: ICONS[icon] || "" }), el("span", {}, title), meta && el("span", { class: "mono" }, meta)),
    el("div", { class: "widget__body" }, body),
    foot && el("footer", { class: "widget__foot" }, foot),
  );
}
