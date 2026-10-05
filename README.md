# ClarkCant website

The official site for [ClarkCant](https://github.com/digitopvn/clarkcant), the open-source AI agent you just talk to.

The landing page and existing docs remain static. The technical blog uses Astro
on a scoped Cloudflare Worker, D1 revisions/auth/surveys and R2 media. Publishing
is for invited members only, so it is documented here rather than in the public docs.

```bash
corepack pnpm install --frozen-lockfile
# Keep the pinned ClarkCant checkout in ../clarkcant, or set CLARKCANT_SOURCE.
corepack pnpm build:widgets
corepack pnpm db:local
corepack pnpm dev       # http://127.0.0.1:4322
corepack pnpm verify
```

Use Node 22.19+ and Corepack pnpm. Widget builds bundle the canonical renderer
from the pinned ClarkCant checkout (see CI), not a copied renderer. Production
configuration is `wrangler.production.jsonc`; local data uses `wrangler.jsonc`.
Stop a running dev server before rebuilding its output on Windows.

Cloudflare operations use the [`cf` CLI](https://blog.cloudflare.com/cloudflare-cf-cli-launch/);
see [AGENTS.md](AGENTS.md) for the command map and the steps that still
go through Wrangler until `cf` supports them.

The existing Pages deploy still owns the landing page/docs. The blog Worker
owns only the routes listed in its production configuration. Do not deploy the
server directory to Pages. `build:static` produces `public/`; the blog build
produces `dist/client` and `dist/server`.

## Deployment and credentials

Create a GitHub OAuth App with homepage `https://clarkcant.cc/blog/` and callback
`https://clarkcant.cc/auth/callback`. Store its two credentials from hidden
input so they never land in shell history, a commit or chat:

```sh
read -rs VALUE && corepack pnpm exec cf workers secrets update GITHUB_CLIENT_ID --worker clarkcant-blog --type secret_text --text "$VALUE"; unset VALUE
read -rs VALUE && corepack pnpm exec cf workers secrets update GITHUB_CLIENT_SECRET --worker clarkcant-blog --type secret_text --text "$VALUE"; unset VALUE
```

`OWNER_GITHUB_ID` is the numeric GitHub ID of the bootstrap owner. Other members
are invited in Studio. Local development can use a separate OAuth App pointing
at `http://127.0.0.1:4322/auth/callback` and ignored `.dev.vars` bindings.
Without OAuth configuration, login fails closed with 503; public reading works.

Before migrations, record a D1 Time Travel bookmark and keep it private; it is
the restore point (`cf d1 time-travel restore <database-id> --bookmark <bookmark>`).
Applied migrations are immutable. The production database ID is in
`wrangler.production.jsonc`. Then:

```sh
corepack pnpm exec cf d1 time-travel get-bookmark <database-id>
corepack pnpm exec cf d1 migrations apply <database-id>
corepack pnpm deploy
```

The optional blog deployment CI needs a separate `CLOUDFLARE_BLOG_API_TOKEN` with
Worker script/routes, D1 and R2 permissions. The existing Pages token is not
assumed to have those rights. Migration backup/application is an explicit
operator prerequisite, not an automatic destructive pipeline step. Roll back
code using Cloudflare Worker versions; restore an article through History.
Never import browser test fixtures into production.

For browser tests, build, run `corepack pnpm db:seed:browser` (writes ignored
temporary credentials and applies them to **local** D1 only), then serve the build with
`wrangler dev --config dist/server/wrangler.json --persist-to <checkout>/.wrangler/state --port 4322`.
Run `corepack pnpm test:e2e`. Tests use Edge locally or Chromium in CI. The
temporary credentials are ignored and expire after two hours.

## Vận hành (Tiếng Việt)

Landing page và tài liệu hiện có vẫn là nội dung tĩnh trên Pages. Blog dùng
Astro/Worker, D1 cho phiên bản, quyền truy cập và khảo sát, R2 cho media. Chỉ các
route trong `wrangler.production.jsonc` chuyển vào Worker. Không đưa thư mục
server lên Pages. Dùng Node 22.19+, Corepack pnpm và checkout ClarkCant tại commit
đã ghim trong CI ở `../clarkcant` hoặc biến `CLARKCANT_SOURCE`; widget dùng renderer
chuẩn, không sao chép. Dừng dev server trước khi build lại trên Windows. Thao tác
Cloudflare dùng CLI `cf`; xem `AGENTS.md` cho bảng lệnh và các bước còn tạm qua Wrangler.

Chạy lần lượt các lệnh install, build:widgets, db:local, dev và verify phía trên.
Tạo GitHub OAuth App với homepage `https://clarkcant.cc/blog/`, callback
`https://clarkcant.cc/auth/callback`. Lưu Client ID và Client Secret bằng hai lệnh
`cf workers secrets update` phía trên qua input ẩn; không ghi secret vào lệnh, commit
hay chat. `OWNER_GITHUB_ID` là ID số của chủ quản trị; mời thành viên khác trong
Studio. Local dùng app riêng với callback `http://127.0.0.1:4322/auth/callback`
và `.dev.vars` đã bị bỏ qua bởi Git. Thiếu cấu hình OAuth thì đăng nhập trả 503,
nhưng vẫn đọc được bài công khai.

Trước migration, lấy bookmark D1 Time Travel làm điểm khôi phục và giữ riêng tư.
Migration đã áp dụng là bất biến. Sau đó chạy migration và deploy như
trên. CI blog tùy chọn cần `CLOUDFLARE_BLOG_API_TOKEN` có quyền Worker/routes, D1,
R2; không giả định token Pages có quyền đó. Người vận hành sao lưu và áp dụng
migration trước khi triển khai. Rollback mã bằng phiên bản Worker; khôi phục bài
qua History. Tuyệt đối không nhập dữ liệu kiểm thử vào production.

Kiểm thử trình duyệt: build, chạy `corepack pnpm db:seed:browser` để nạp thông tin
test vào D1 **local**, khởi động `wrangler dev` bằng config trong
`dist/server` với `--persist-to <checkout>/.wrangler/state --port 4322`, rồi chạy
`corepack pnpm test:e2e`. Edge được dùng cục bộ, Chromium trên CI. Thông tin xác
thực kiểm thử bị bỏ qua bởi Git và hết hạn sau hai giờ. Quy trình OAuth thật với
ChatGPT/Claude cần kiểm chứng riêng sau khi cấu hình app; kiểm thử SDK không thay
thế bước đó.

## Layout

| Path | What it owns |
|---|---|
| `index.html` | All page content and section order |
| `docs/` | Developer docs in English (default): overview, REST & SSE, MCP, WebSocket, CLI |
| `vi/docs/` | The same pages in Vietnamese, one file per English page |
| `assets/css/tokens.css` | Type scale, spacing, motion, light/dark palettes |
| `assets/css/*.css` | One file per concern: base, orb, conversation, widgets, hero, story, sections, docs |
| `assets/js/orb/` | The Orb: shader ported from the product's `orb-shader.ts`, renderer, mount/scheduling |
| `assets/js/widgets/` | The four live in-reply widgets (timer, bill split, comparison, file results) |
| `assets/js/scripted-replies.js` | Every scripted reply the hero composer and gallery can show |
| `assets/js/*.js` | One module per section behaviour; `main.js` wires them up (`docs.js` for the docs pages) |

## Rules this site keeps

- **Honest by default.** Replies are scripted and labelled as such; example data is made up and says so; the status card mirrors the repo README. No invented numbers, users, quotes or partners.
- **The Orb is the only loud thing.** Everything else stays calm in both themes.
- **Theme:** system by default; the header toggle cycles system → light → dark (stored in `localStorage` as `cc-theme`).
- **Motion:** `prefers-reduced-motion` stops loops and draws still Orb frames.
- **Microphone:** the voice demo reads loudness only, in the browser, and stops when the section leaves view.
- **Docs are bilingual.** English is the default at `docs/`; every page has a Vietnamese twin at `vi/docs/` with the same file name, full diacritics, a language switch and `hreflang` alternates. Change both in the same commit. Code samples are identical in both languages and must match the product's interface contract exactly: routes, fields, frames, flags and environment variables. Use `<token>` placeholders, never real-looking secrets, and never document an interface the product does not ship.

When the product ships something new, update the status card in `index.html` (`#open-source`), the docs under `docs/` and `vi/docs/` when an open interface changed, and, if relevant, `scripted-replies.js`.
