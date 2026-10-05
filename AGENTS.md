# Agent notes

Read `README.md` first for the stack, local setup and deployment order.

## Cloudflare: use `cf`, not `wrangler`

Use the [`cf` CLI](https://blog.cloudflare.com/cloudflare-cf-cli-launch/) (devDependency
`cf`, run as `corepack pnpm exec cf …`) for every Cloudflare operation. Do not add new
`wrangler` commands to scripts, workflows or docs.

Discover commands with `cf cli search "<task>"`, then `<command> --help`. Keep search
queries anonymous: describe the action and resource type, never names, IDs, domains or
tokens. Some commands appear in search but are not implemented yet, and their `--help`
prints the root help. Check that before you rely on one.

| Task | Command |
| --- | --- |
| Apply D1 migrations (production) | `cf d1 migrations apply <database-id>` |
| Apply D1 migrations (local) | `corepack pnpm db:local` |
| Seed local D1 for browser tests | `corepack pnpm db:seed:browser` |
| Create a migration | `cf d1 migrations create "<what it does>"` |
| Restore point before a migration | `cf d1 time-travel get-bookmark <database-id>` |
| Restore D1 | `cf d1 time-travel restore <database-id> --bookmark <bookmark>` |
| Set a Worker secret | `cf workers secrets update <NAME> --worker clarkcant-blog --type secret_text --text "$VALUE"` (read `VALUE` with `read -rs`) |
| List Worker secrets | `cf workers secrets list --worker clarkcant-blog` |

D1 commands take the database ID, not its name. Production's ID is in
`wrangler.production.jsonc`. The local ID is the fixed UUID
`00000000-0000-4000-8000-000000000000` in `wrangler.jsonc`. Local commands pass
`--local --persist-to .wrangler/state`, the same state the Astro adapter and
`wrangler dev` read. Without that flag, `cf` writes to `~/.config/cloudflare/state`
and the site never sees it. `cf d1 query --local` is not implemented, so local SQL
goes through `cf d1 migrations apply` with its own `--dir` and `--table`, as
`db:seed:browser` does.

Local `cf` commands load `scripts/cf-local-exit-preload.cjs` (see the `db:*`
scripts). `cf` 1.0.0-beta.12 never disposes its local Miniflare, and the
dev-registry file watcher then keeps Node running forever on Linux CI. Keep the
preload on any new local `cf` command until a `cf` release fixes this.

## Where Wrangler is still required

These are the only steps that use Wrangler. Each one stays until `cf` can do it.
Re-check them when you upgrade `cf` or `@astrojs/cloudflare`, and move each one to
`cf` once it works.

- **Blog Worker deploy** (`pnpm deploy`, `.github/workflows/deploy-blog.yml`).
  `cf deploy` needs the Build Output Specification in `.cloudflare/output/v0`, and the
  Astro adapter does not emit it. Forcing it through `@cloudflare/vite-plugin` fails,
  because the adapter uses `experimental.prerenderWorker` and that is not yet
  supported together with `experimental.newConfig`. Last checked with
  `cf` 1.0.0-beta.12 and `@astrojs/cloudflare` 14.3.3.
- **Serving the built Worker for browser tests** (`wrangler dev --config
  dist/server/wrangler.json` in `playwright.config.ts`). `cf dev` runs the
  framework's dev server and does not serve the build output, so it cannot stand
  in here.
- **Landing and docs Pages deploy** (`.github/workflows/deploy.yml`, through
  `cloudflare/wrangler-action`). `cf pages deploy` refuses legacy Pages projects and
  points to `cf deploy` on Workers. Moving off it means migrating the `clarkcant`
  Pages project to Workers static assets, which is a separate change.

Wrangler also stays installed because `@astrojs/cloudflare` declares it as a peer
dependency for builds and `astro dev`.
