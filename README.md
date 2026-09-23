# ClarkCant website

The official site for [ClarkCant](https://github.com/digitopvn/clarkcant), the open-source AI agent you just talk to.

Static HTML, CSS and ES modules. No dependencies, no build step.

```bash
npm start          # http://127.0.0.1:4321 (PORT=… to change)
npm run deploy     # copy public files to dist/ and publish to Cloudflare Pages (project: clarkcant)
npm run og         # re-render assets/img/og-image.png from scripts/og-card.html (needs npm start + Chrome)
```

Live at https://clarkcant.cc (also https://clarkcant.pages.dev). Only `index.html`, `404.html` and `assets/` are published. `404.html` uses root-absolute paths, so serve the site from a domain root; if the domain changes, update `og:image` in `index.html`.

## Layout

| Path | What it owns |
|---|---|
| `index.html` | All page content and section order |
| `assets/css/tokens.css` | Type scale, spacing, motion, light/dark palettes |
| `assets/css/*.css` | One file per concern: base, orb, conversation, widgets, hero, story, sections |
| `assets/js/orb/` | The Orb: shader ported from the product's `orb-shader.ts`, renderer, mount/scheduling |
| `assets/js/widgets/` | The four live in-reply widgets (timer, bill split, comparison, file results) |
| `assets/js/scripted-replies.js` | Every scripted reply the hero composer and gallery can show |
| `assets/js/*.js` | One module per section behaviour; `main.js` wires them up |

## Rules this site keeps

- **Honest by default.** Replies are scripted and labelled as such; example data is made up and says so; the status card mirrors the repo README. No invented numbers, users, quotes or partners.
- **The Orb is the only loud thing.** Everything else stays calm in both themes.
- **Theme:** system by default; the header toggle cycles system → light → dark (stored in `localStorage` as `cc-theme`).
- **Motion:** `prefers-reduced-motion` stops loops and draws still Orb frames.
- **Microphone:** the voice demo reads loudness only, in the browser, and stops when the section leaves view.

When the product ships something new, update the status card in `index.html` (`#open-source`) and, if relevant, `scripted-replies.js`.
