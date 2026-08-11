# Admin V2 — UI prototype

Throwaway prototype answering: *what should the admin look like?* Three structurally
different variants of the dashboard, all on the same real data, switchable in the
browser. Built with the `prototype` skill (UI branch).

## Run

```sh
bun serve.ts
# open http://localhost:4173 — switch variants with the bottom bar or ← →
```

## Variants

- **A — Удирдлагын төв (Command center):** warm sidebar + bottom nav, coral
  work-queue hero with linked counts, order cards with product thumbnails, low-stock panel.
- **B — Шуурхай жагсаалт (Triage agenda):** no header; a dark "next action" strip
  (no duplicated metrics), glance cards, order cards as a live state demo — press the
  primary button to advance the status chain (payment verify → prep → ship → delivered),
  product cards with hover tooltips and ••• action menus, and a legend of card actions.
  Mobile-first.
- **C — Хүснэгт самбар (Ledger desk):** dense metric tiles, tab navigation, full
  scan-able tables with status pills. Desktop density.

## Data

`data.json` is real data dumped straight from the production database
(`ecom_vit_*` tables) via `dump-data.ts`, which builds the same connection URL the
repo's own scripts use (`DIRECT_DB_URL` or `PLANETSCALE_*` from `.env`). No backend
is involved at render time — the page only reads the JSON.

To refresh the data: `bun scripts/dump-admin-prototype-data.ts data.json` from a checkout that has `.env` and
`node_modules` (the dump needs the `postgres` driver).

## Capture

This prototype is a primary source. When a variant wins, fold it into
`apps/admin-v2` (Track 2/3 of `plans/admin-v1-solid-rewrite.md`) and keep this
folder on the branch as the record. Do not copy the prototype markup into
production as-is.
