# Phomemo M110 printing from the admin dashboard

**Question:** Is Capacitor + `@capacitor-community/bluetooth-le` + a standalone TS printer module a sound way to batch-print shipping labels from `apps/admin` to a real M110?

**Verdict (updated 2026-08-25): Web Bluetooth via Bluefy first; Capacitor only if batch fails.**

For **one packing admin** on iPhone/iPad, ship the existing HTTPS admin through a Web-BLE browser (Bluefy) or Safari+extension (beacio/WebBLE) before building a Capacitor IPA. Safari still has no Web Bluetooth. Capacitor remains the fallback if Bluefy cannot sustain ~30 sequential M110 raster jobs.

Still true from the first pass: do not over-build the printer package; measure label stock; fix selection UX; defer `labelPrintedAt`; prove hardware before orders UI.

### Amendment — Bluefy / WebBLE before Capacitor

**Why this beats Capacitor for n=1**

- Zero Apple Developer / Xcode / TestFlight / OAuth-origin work.
- Admin stays the Cloudflare Vite SPA. Printer code is plain `navigator.bluetooth`.
- Precedent: commercial BLE web apps (e.g. Storz & Bickel) tell iOS users to open their site in Bluefy or WebBLE.

**Bluefy** ([App Store](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)): free iOS/iPadOS browser that exposes Web Bluetooth to HTTPS pages. Still updated (e.g. 3.9.3). Staff workflow becomes “open admin in Bluefy, not Safari.”

**beacio / iOSWebBLE**: Safari extension + companion app that polyfills `navigator.bluetooth`. Keep Safari if preferred; still a third-party native install.

**Pre-repo proof (do this before any vit-store code)**

1. Install Bluefy on the packing phone.
2. Power M110.
3. Open [Phomymo](https://phomymo.affordablemagic.net) in Bluefy.
4. Connect → print one test label.
5. Stress: 1 → 5 → **30** sequential prints (raster-heavy writes, not a heart-rate toggle).

Pass → build `WebBluetoothTransport` + order label renderer + batch UI in admin.  
Fail (drops, stalls, half-prints) → Capacitor + `@capacitor-community/bluetooth-le` as originally planned.

**Architecture shift**

```text
preferred:  admin HTTPS → Bluefy → navigator.bluetooth → M110
fallback:   Capacitor shell → bluetooth-le → CoreBluetooth → M110
```

Transport interface stays; do not invent Capacitor until Bluefy fails the 30-label gate.

**Caveats to keep**

- Third-party browser/extension is an ops dependency (updates, App Store availability, quirks).
- Google login / cookies must work inside Bluefy (usually fine for HTTPS same site; verify once).
- PWA “Add to Home Screen” from Safari is not the packing entrypoint — bookmark Bluefy → admin URL.
- Label size, Cyrillic font, selection-across-pages, and print-audit still apply after the BLE gate passes.

**Dirty tree when this note was written (2026-08-25):**

- modified: `apps/storev2/src/lib/analytics.ts`
- untracked: `.react-query-best-practices.md`, `stock.md`

Do not mix those into a printing branch.

---

## 1. Project structure

This is a Bun workspace. Apps live under `apps/*`, shared packages under `packages/*`. Root `package.json` workspaces are `apps/*` and `packages/*`.

**Admin dashboard.** `apps/admin`. React 19, Vite 6, TanStack Router, TanStack Query, tRPC to the Cloudflare server. Not Solid. Not Next. Not Capacitor. There is no `capacitor.config.*`, no `ios/` tree, no BLE dependency.

**Storefront.** `apps/storev2` (Astro SSR on Cloudflare). Irrelevant to this printer.

**API / DB.** `packages/api` (Drizzle schema, tRPC routers, queries). `apps/server` (Hono Worker).

**Domain glossary.** Root `CONTEXT.md`. Admin staff are **Users**. Buyers are **Customers** (phone-identified). No ADR in `docs/adr/` mentions printers, labels, or Capacitor.

Impeccable / design work for the dashboard uses `IMPECCABLE_CONTEXT_DIR=apps/admin` per `AGENTS.md`. That is UI polish, not BLE.

---

## 2. Orders: schema and list UI

### Schema (`packages/api/src/db/schema.ts`)

`ecom_vit_order` has:

- `orderNumber` (8-char, unique)
- `customerPhone` (FK to customer phone, integer)
- `status` (`created` | `pending` | `shipped` | `delivered` | `cancelled` | `refunded`)
- `address` (varchar 256, required)
- `addressZoneId` (nullable until admin dispatch)
- `deliveryProvider` (`tu-delivery` | `self` | `avidaa` | `pick-up`)
- `total`, `notes`, timestamps, `deletedAt`

There is **no** `labelPrintedAt`, print count, or label-layout column. Customer rows have phone, address, Facebook/Instagram usernames. **No legal name.** Label copy cannot invent a name. Phone + address + order number is what you have. `notes` is optional and often useful on a packing sticker.

Line items are `ecom_vit_order_detail` (product, quantity, price). Product `name` is English catalog text in practice; Mongolian names live elsewhere on products if present, not on the order row.

### List payload (`packages/api/src/lib/utils.ts` `shapeOrderResults`)

Paginated cards already get: id, orderNumber, customerPhone (string), status, total, notes, address, addressZoneId, dates, deliveryProvider, products (`name`, `quantity`, `productId`, `price`, `imageUrl`), paymentStatus/provider/number.

That is enough to raster a delivery label without a new fetch, except you still need to **choose which fields fit the physical sticker**. A 40×30 mm die-cut will not hold a 256-char address plus three product names.

### UI (`apps/admin/src/components/order/orders-list.tsx`, `order-card.tsx`)

- Grid of cards. Each card already **copies the address to the clipboard**. That is the Print Master workaround in the product.
- Checkbox selection exists, but **only `status === "pending"`**, and only for **TU batch ship** / "marked self-shipped". Selection is **this page only**. Changing page, filters, or sort **clears** selection.
- Default page size is `PRODUCT_PER_PAGE` = **10** (`packages/shared/src/constants.ts`). A 20–30 order packing session is 3 pages. A print batch that reuses the current checkbox will silently miss orders off-page.
- Default list filter is `"active"` (`created` is hidden unless you opt in). Packing labels are probably for paid/`pending` orders. Do not glue print to the TU send button.

Detail page (`apps/admin/src/routes/_dash/orders.$id.tsx`) also copies address. Same fields, one order.

---

## 3. Label size

**Not documented in this repo.**

Searched `CONTEXT.md`, `docs/adr/`, GitHub issues on `darjss/vit-store`, and `stock.md`. `stock.md` is a handwritten restock list ("Dr best glucosamine 360 sh…"). It is not printer media.

pyphomemo’s CLI default is **40×30 mm** (`README.md` in https://github.com/mkuhlmann/pyphomemo). phomymo’s M-series presets include 40×30, 50×30, 30×40, and more (`src/web/constants.js` `M_SERIES_LABEL_SIZES`). phomemo-tools CUPS examples use `w30h20` as a media name, not a claim about this shop’s stock.

**Must-change:** measure the roll in the warehouse (width × height, gap vs continuous) and lock that in code as a constant. Wrong media type (`0x0a` gaps vs `0x0b` continuous vs `0x26` marks) eats labels or drifts. Do not pick 40×30 because a Python README did.

M110 print head in both BLE references is **384 dots wide** (48 bytes/line). Height in dots is `mm * dpi`. Confirm DPI on the unit (commonly 203). Raster geometry follows the head, then you crop/scale to the die-cut.

Mongolian Cyrillic on a 1-bit thermal bitmap needs a **font you embed and draw to canvas**. The printer has no TTF. Latin-only raster fonts will tofu the address.

---

## 4. Deployment model

**Admin today**

- Vite SPA, `vite-plugin-pwa` (`apps/admin/vite.config.ts`): name `vit-admin`, `registerType: "autoUpdate"`.
- Alchemy `Vite("dashboard")` (`apps/admin/alchemy.run.ts`) → Cloudflare static assets.
- Prod host: `admin.amerikvitamin.mn`. Staging: `admin-staging.amerikvitamin.mn`.
- API: `VITE_SERVER_URL` + cookie session (`admin_session`). tRPC fetch uses `credentials: "include"` and sets `Origin: window.location.origin` (`apps/admin/src/utils/trpc.ts`).
- Server CORS is an env list `CORS_ORIGIN` (`apps/server/src/index.ts`). Cookie is `httpOnly`, `secure`, `sameSite: "None"`, optional `DOMAIN` (`packages/api/src/lib/session/index.ts`). Login is **Google OAuth** (`apps/server/src/routes/auth.ts`).

**Native does not exist.** The PWA does not get Web Bluetooth on iOS. Safari still does not implement it. phomymo’s own README says iOS is not supported for that reason.

**Hosting implications**

1. Keep shipping the Cloudflare dashboard. Desktop Chrome and the existing PWA stay the default admin. Capacitor is an extra iOS binary for the packing iPhones/iPads, not a replacement for Alchemy deploy.
2. If the iOS app **bundles** the Vite `dist`, you have two artifacts (Worker assets + IPA). Fine. Native plugins work. OAuth redirect / cookie `Origin` become `capacitor://localhost` or `https://localhost` unless you set Capacitor `server.hostname` / `iosScheme`. You **must** add those origins to `CORS_ORIGIN` and Google’s authorized redirect URIs. Do not assume `admin.amerikvitamin.mn` cookies attach to a `capacitor://` origin.
3. If the iOS app **loads** `https://admin.amerikvitamin.mn` in WKWebView (`server.url`), cookies and CORS stay as today, and you still inject Capacitor for BLE. Apple review guideline **2.5.2** wants apps self-contained and not downloading code that *changes functionality*. A thin wrapper that fetches the live SPA on every launch is the riskier review story. Guideline **4.2** also rejects empty website shells. BLE printing is the native capability that makes a shell defensible, but only if the binary actually contains that path, not "open Safari".
4. The PWA service worker (`autoUpdate`) inside WKWebView is a footgun (stale JS, plugin mismatch). Disable the SW in the native shell or do not register it when `Capacitor.isNativePlatform()`.

**Recommended for this repo:** keep Alchemy as the source of truth for web admin. Capacitor iOS app **bundles** a known admin build (or a Capacitor live-update channel you control), talks to the same `VITE_SERVER_URL`, and uses BLE only in native. Do not make Cloudflare "serve Capacitor". Workers cannot talk to the printer.

---

## 5. Protocol references (cloned under `~/.btca/agent/sandbox`)

| Repo | License | What it actually is | Use for vit-store |
|---|---|---|---|
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo) | **ISC** (`package.json`) | Browser label designer. **Web Bluetooth**, not Capacitor. README: Chrome/Edge, **not Safari/iOS**. | Protocol + chunking + dither. Do not vendor the designer UI. |
| [mkuhlmann/pyphomemo](https://github.com/mkuhlmann/pyphomemo) | (see that repo) | Python CLI/server. Documents that GATT UUIDs and 128-byte chunks came from phomymo. | Cleanest write-up of the M110 job layout. Reimplement in TS, do not ship Python. |
| [vivier/phomemo-tools](https://github.com/vivier/phomemo-tools) | **GPL-3.0** | Linux CUPS/USB/rfcomm. USB packet dump for M110 header/block/footer. | Read the README §5 for bytes. **Do not copy `rastertopm110.py` into this MIT/ISC-ish monorepo.** |

**BLE UUIDs (agree across phomymo + pyphomemo):**

- Service `0xFF00` → `0000ff00-0000-1000-8000-00805f9b34fb`
- Write `0xFF02` → `0000ff02-0000-1000-8000-00805f9b34fb` (prefer write-without-response; phomymo falls back to write-with-response)
- Notify `0xFF03` → `0000ff03-0000-1000-8000-00805f9b34fb` (best-effort)

phomymo also tries `0xFFE0`, `0xAE30`, and an ISSC UUID for other models. Start with FF00 on *this* M110, discover characteristics at connect, do not hard-fail if notify is missing.

**Job bytes (pyphomemo `protocol.py`, phomemo-tools README §5):**

```
speed    1b 4e 0d <01..05>
density  1b 4e 04 <01..0f>
media    1f 11 <0a gaps | 0b continuous | 26 marks>
raster   1d 76 30 00 <widthBytes LE16> <lines LE16> <1bpp MSB-left, 1=black>
footer   1f f0 05 00 1f f0 03 00
```

Payload is sent in **128-byte GATT chunks** with ~20 ms delay (`CHUNK_SIZE` / `CHUNK_DELAY_MS` in phomymo `constants.js`). `@capacitor-community/bluetooth-le` exposes `writeWithoutResponse` and notes max write length is **MTU − 3**. Cap the chunk to `min(128, mtu-3)`.

**Hardware gotcha (pyphomemo `printer.py` / `CLAUDE.md`):** the M110 is dual-mode. After a job it can drop BLE briefly. Immediate reconnect-by-MAC on BlueZ hits `br-connection-profile-unavailable`. On iOS the `deviceId` is a **UUID**, not a MAC. Persist that id. Wait and retry instead of assuming a stuck printer.

**Still verify on the shop’s printer:** advertised name, actual service list, write property, media type, and whether 128-byte chunks stall on iOS. Clone agreement is not a substitute for one successful print.

---

## 6. Capacitor + iOS BLE realism

Plugin docs (cloned [capacitor-community/bluetooth-le](https://github.com/capacitor-community/bluetooth-le) `README.md`):

- iOS needs `NSBluetoothAlwaysUsageDescription` or the app **crashes** on use.
- `bluetooth-central` in `UIBackgroundModes` is **only** if you print with the app backgrounded. Packing 20–30 labels is a **foreground** task. **Do not request background BLE.** Apple 2.5.4 is picky about unused background modes, and you do not need them.
- **Simulator has no BLE.** `initialize` rejects with "BLE unsupported". First milestone is a physical iPhone/iPad + physical M110.
- After the user denies Bluetooth on first `initialize`, iOS will not prompt again from the plugin. Surface Settings. Document that.
- `writeWithoutResponse` exists on iOS. Use it for the raster stream.

**App Store / distribution (this is a staff admin, not a customer app):**

- Public App Store for `admin.amerikvitamin.mn` is the wrong product. Unlisted or Custom (Apple Business Manager) fits employee tools. TestFlight is the right **first** distribution (internal testers), not a forever store.
- Apple still reviews Custom/unlisted apps. Provide a **sanitized Google login** (or a review account) so reviewers can reach the print screen without production order PII. Guideline language: Custom Apps need a way for Apple to sign in.
- Bluetooth usage string must say you talk to a **label printer**, not a generic "interact with BLE devices" paste from the plugin README.
- Guideline 2.5.2 argues against a WKWebView that downloads the entire dashboard as new executable JS. Bundle the SPA or use a review-safe update story.
- iPad: same binary, same BLE. Confirm the M110 pairs with both devices you actually pack on.

Web Bluetooth in the Capacitor plugin’s **web** implementation does not help iOS. Native iOS path is mandatory.

---

## 7. What in the plan is sound vs what must change

**Keep**

- Stay on the React admin. Do not rewrite the dashboard.
- Capacitor iOS shell + `@capacitor-community/bluetooth-le`. Not Web Bluetooth alone.
- First milestone: one test bitmap on real hardware, then batch.
- Raster and GATT on the device. Server never sees printer bytes.

**Change**

1. **Do not start with a grand `packages/printer` of transports.** One module that builds a 1bpp buffer and writes BLE chunks is enough. USB/CUPS/Web Bluetooth can wait. YAGNI.
2. **Do not put print on the existing pending-only TU toolbar.** Add a separate "print labels" action. Allow print for the statuses you actually pack (likely paid/`pending`, maybe `shipped`). Selection must survive pagination or print from an explicit id list, not `Set` on page 1 of 10.
3. **Do not add `labelPrintedAt` in the first PR.** After hardware works, add a nullable timestamp (or print-event row) with an idempotent mutation: set only if null, explicit reprint. Do not overload `status` or TU `delivery_dispatch.fingerprint`.
4. **Measure label stock** before raster layout. Defaulting to 40×30 mm is a guess from pyphomemo, not this warehouse.
5. **Embed a Cyrillic-capable font** and draw via canvas/OffscreenCanvas. Address is Mongolian.
6. **Treat iOS as a second deploy:** Xcode, Apple Developer, TestFlight, Info.plist, OAuth redirects, CORS. Alchemy stays. Capacitor does not replace Cloudflare.
7. **Do not copy GPL** `phomemo-tools` filters. Reimplement from documented command bytes + ISC phomymo/pyphomemo behavior.
8. **Skip `UIBackgroundModes` bluetooth-central.**
9. **Disable PWA SW in native.**
10. **Plan reconnect + per-label failure** for a 20–30 job (queue, pause, reprint one). Dual-mode drop after a job is documented.
11. **Customer has no name.** Labels are phone + address + `#orderNumber` ± notes ± short product line.
12. **Google OAuth + cookie origin** for the Capacitor origin is a blocker until proven, same class as BLE.

**Reject-parts (do not do)**

- Replacing Print Master with a **browser-only** flow on iPhone Safari.
- A Worker-side "print proxy".
- Shipping a public App Store "Vit Admin" that is just the website.
- Coupling "printed" to "shipped to TU".
- Porting phomymo’s full designer (CSV, multi-label rolls, PM-241 USB) into this admin.

---

## 8. Recommended sequence for this repo

Assumptions: one M110, one packing iPhone or iPad, labels already bought, Google login already works in Safari on `admin.amerikvitamin.mn`.

1. **Photograph and measure** the actual sticker (mm, gap/continuous). Write the numbers into the printer module as constants. Verify: caliper or pack label vs `M_SERIES_LABEL_SIZES` keys.
2. **Spike, no admin UI.** New `apps/admin` Capacitor iOS project (or `apps/admin-ios` only if you refuse to pollute the Vite app with `ios/`). Bare screen: scan, connect, send a hardcoded 384-wide test raster (black bar + "TEST"). Verify: paper comes out on a **physical** device. Simulator cannot pass this gate.
3. **Auth in that WKWebView.** Login with the existing Google flow. Verify: `auth.me` succeeds, `getPaginatedOrders` returns. Fix CORS / redirect / cookie domain until it does.
4. **Raster one real order** from `getOrderById` (number, phone, address) with the measured size and a Cyrillic font. Verify: readable sticker vs Print Master output.
5. **Batch of 3, then 20.** Sequential jobs, delay, reconnect-on-drop, per-item error. Verify: no skipped/duplicated physical labels in a counted stack.
6. **Orders UI.** Independent multi-select (cross-page or "print these ids"), preview, progress. Reuse card data. Do not hide TU send.
7. **Server `labelPrintedAt`** (or print events) + confirm-after-hardware-success + reprint. Verify: refresh still shows printed; two staff cannot silently double-print without confirm.
8. **TestFlight** to the packing phones. Keep Cloudflare admin unchanged for everyone else.

Success for milestone 1 is a photo of a real M110 label from the Capacitor app, not a passing `check-types`.

---

## 9. Risks / blockers (ranked)

1. **Hardware protocol on iOS GATT** (chunk size, write-without-response, dual-mode drop). Software cannot close this without the printer in the room.
2. **OAuth + cookies in Capacitor** vs current `admin.amerikvitamin.mn` origin.
3. **Unknown physical label size / media type.**
4. **Cyrillic raster quality** on ~40 mm stock.
5. **Apple distribution** (developer account, review login, unlisted vs TestFlight). Not a code issue, still a calendar issue.
6. **Selection UX** as written today cannot select 20–30 orders across pages.
7. **GPL contamination** if someone pastes `phomemo-tools` Python into `packages/`.
8. **PWA service worker** fighting a native plugin bundle.

---

## Sources

- `/home/darjs/dev/vit-store/apps/admin/package.json`, `vite.config.ts`, `alchemy.run.ts`, `src/utils/trpc.ts`, `src/components/order/orders-list.tsx`, `order-card.tsx`
- `/home/darjs/dev/vit-store/packages/api/src/db/schema.ts`, `src/lib/utils.ts`, `src/lib/session/index.ts`, `src/queries/orders.ts`
- `/home/darjs/dev/vit-store/packages/shared/src/constants.ts`
- `/home/darjs/dev/vit-store/apps/server/src/index.ts`, `src/routes/auth.ts`
- `/home/darjs/dev/vit-store/CONTEXT.md`
- Local clones: `~/.btca/agent/sandbox/phomymo`, `pyphomemo`, `phomemo-tools`, `bluetooth-le`
- https://github.com/transcriptionstream/phomymo
- https://github.com/mkuhlmann/pyphomemo
- https://github.com/vivier/phomemo-tools
- https://github.com/capacitor-community/bluetooth-le
- https://developer.apple.com/app-store/review/guidelines/ (2.5.2, 2.5.4, 4.2)
- https://developer.apple.com/support/unlisted-app-distribution/
