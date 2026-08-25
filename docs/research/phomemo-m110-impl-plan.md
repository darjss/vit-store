# Implementation plan: M110 phone labels from admin (Bluefy-first)

**Goal:** From the existing orders list, select pending orders and print a **phone-number-only** label on a Phomemo M110 for TU packing — without Capacitor unless Bluefy fails a 30-label stress test.

**Protocol reference (btca-local):** `~/.btca/agent/sandbox/pyphomemo` @ `09617e3`  
Upstream: https://github.com/mkuhlmann/pyphomemo  
Related research: `docs/research/phomemo-m110-admin-printing.md`

**Out of scope for v1:** Capacitor, label designer, customer names, products on label, `labelPrintedAt`, separate print page, Web Bluetooth desktop polish beyond what falls out of the same module.

---

## Assumptions (explicit)

1. One packing admin on iPhone/iPad opens **admin.amerikvitamin.mn in Bluefy** (not Safari).
2. Primary label content is **customer phone only** (large type).
3. Batch print sits on the **orders list** next to the existing TU toolbar — not a new route.
4. Selection reuses **pending** checkboxes already used for TU send.
5. Physical label size will be measured before locking raster constants (pyphomemo default `40x30` mm is a **guess** until measured).
6. Dirty tree (`apps/storev2/src/lib/analytics.ts`, `.react-query-best-practices.md`, `stock.md`) stays off this branch.

---

## Success criteria

| Gate | Pass condition |
|------|----------------|
| G0 Hardware | Phomymo in Bluefy prints 1 → 5 → **30** labels on the shop M110 without stalls/dupes/half-prints |
| G1 Module | Offline: render phone string → PNG/canvas preview matches intended sticker; byte builders match pyphomemo |
| G2 One order | From admin (Bluefy): connect M110, print one selected order’s phone |
| G3 Batch | Select N pending (N≥5, then ~20–30): sequential print with progress; cancel mid-batch leaves clear printed vs remaining |
| G4 Types | `bun run --cwd apps/admin check-types` exit 0 |

---

## Phase 0 — Hardware proof (no vit-store code)

**Do this before any PR.**

1. Install [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055) on the packing iPhone/iPad.
2. Power M110; open https://phomymo.affordablemagic.net in Bluefy.
3. Connect → print one test label.
4. Stress: 1, then 5, then **30** sequential jobs (use Phomymo Print All / Print Selected if available).
5. Measure the physical die-cut: **width × height mm**, gap vs continuous vs mark.
6. Record advertised BLE name (e.g. `M110…` vs bare serial like `Q199…`).

**STOP if G0 fails.** Revisit Capacitor + `@capacitor-community/bluetooth-le` instead of continuing this plan’s transport.

**If G0 passes:** proceed. Transport = `navigator.bluetooth` only.

---

## Phase 1 — Tiny printer module inside admin

Do **not** create `packages/m110` yet. Keep everything under admin until a second consumer appears.

```text
apps/admin/src/lib/phomemo/
  constants.ts      # UUIDs, chunk size, delays, DPI, label mm (after measure)
  protocol.ts       # pure byte builders (port of pyphomemo protocol.py)
  raster.ts         # canvas → 1bpp packed bytes (phone text)
  web-bluetooth.ts  # connect / write / disconnect
  printer.ts        # M110Printer: structured print sequence
  batch.ts          # sequential jobs + cancel + per-order status
  index.ts          # createPrinter() / public types
```

### 1.1 Port protocol from pyphomemo (cite paths)

Source: `~/.btca/agent/sandbox/pyphomemo/src/pyphomemo/protocol.py`

| Constant / fn | Value / behavior |
|---------------|------------------|
| `SERVICE_UUID` | `0000ff00-0000-1000-8000-00805f9b34fb` |
| `WRITE_CHAR_UUID` | `0000ff02-…` |
| `NOTIFY_CHAR_UUID` | `0000ff03-…` |
| `PRINTER_WIDTH_PX` | 384 (full head); **label width may be smaller** |
| `PX_PER_MM` | 8 (203 dpi) |
| `CHUNK_SIZE` | 128 |
| `CHUNK_DELAY_S` | 0.02 |
| `cmd_speed` | `1b 4e 0d <01..05>` default `0x05` |
| `cmd_density` | `1b 4e 04 <01..0f>` default `0x0f` |
| `cmd_media` | `1f 11 <0a gaps \| 0b continuous \| 26 marks>` |
| `build_raster_header` | `1d 76 30 00` + widthBytes LE16 + height LE16 |
| `build_footer` | `1f f0 05 00 1f f0 03 00` |

**Critical geometry note** (from pyphomemo `CLAUDE.md`): a 40×30 mm label is **320×240** dots → **40 bytes/line**, not 48. Always set `width_bytes = widthPx / 8` from the measured label width capped at 384.

### 1.2 Port print *sequence* from `printer.py` (not one mega-chunk)

Source: `~/.btca/agent/sandbox/pyphomemo/src/pyphomemo/printer.py` (`print_raster`, delays)

```text
write speed          → sleep 30ms
write density        → sleep 30ms
write media          → sleep 30ms
write raster header
write raster in 128-byte chunks, 20ms between chunks
sleep 300ms
write footer
sleep 500ms
```

Merging into one undifferentiated chunked stream makes the M110 flash and discard the job (documented in that file’s module docstring).

Prefer **write-without-response** when the characteristic supports it; fall back to write-with-response (same as pyphomemo `_write`).

Notify subscribe is best-effort only.

### 1.3 Raster: phone-only canvas

Source ideas: `imaging.py` (`text_to_image` / `image_to_raster`) but **simpler**:

1. Create offscreen canvas at `labelWidthPx × labelHeightPx` (white).
2. Draw `String(customerPhone)` centered, large bold font (system or embedded Cyrillic-safe if needed — digits only for phone, so system font is fine).
3. Read `ImageData`, threshold to 1bpp, pack MSB-left, bit=1 black.
4. Invert/threshold carefully to match printer polarity (pyphomemo inverts before Pillow `"1"` so dark → set bit).

**Dry-run helper:** `downloadPreviewPng(phone)` or sandbox route for desktop Chromium without printing.

### 1.4 Web Bluetooth transport

```ts
type PrinterTransport = {
  connect(): Promise<void>
  disconnect(): Promise<void>
  write(data: Uint8Array): Promise<void>
  readonly connected: boolean
}
```

`WebBluetoothTransport`:

1. `navigator.bluetooth.requestDevice({ filters: [{ namePrefix: "M110" }, /* optional serial patterns */], optionalServices: [0xff00, …] })` — also accept devices advertising known Phomemo service UUIDs / bare serials per `models.identify_model` in pyphomemo `models.py`.
2. `gatt.connect()` → getPrimaryService(FF00) → getCharacteristic(FF02).
3. Persist `device.id` in `localStorage` if `getDevices()` works in Bluefy (nice-to-have; not a gate).
4. Clear errors when `navigator.bluetooth` missing (“Open this page in Bluefy”).

`M110Printer.print(raster, { widthBytes, height, speed?, density?, media? })` calls the delay-separated sequence via transport.

### 1.5 Batch runner

Mirror pyphomemo server’s single-worker queue idea (`server.py` `JobQueue._run`): **one job at a time**, never parallel GATT floods.

```ts
type JobStatus = "pending" | "printing" | "printed" | "failed" | "cancelled"

async function printPhones(
  printer: M110Printer,
  orders: { id: number; orderNumber: string; customerPhone: string }[],
  opts: { signal: AbortSignal; onProgress(p): void },
)
```

Between jobs: small pause (reuse footer delay or ~0.5–1s) so dual-mode BLE drop can settle (pyphomemo reconnect notes; Bluefy may keep the GATT session — validate in G0/G3).

On failure: mark that job failed, stop or offer resume remaining (v1: stop + keep status map is enough).

---

## Phase 2 — Orders list UI

Touch: `apps/admin/src/components/order/orders-list.tsx` (+ small dialog/hook).

### UX

On existing bottom toolbar when `selectedIds.size > 0`:

```text
[ Print phones ]   [ TU send ]   [ Self-shipped ]   [ Clear ]
```

- **Print phones** enabled when selection non-empty and not already printing.
- Click → if not connected, connect flow (browser picker) then run batch.
- Progress overlay / sheet: `Printing 7 / 23`, cancel, list failed order numbers.
- Do **not** change order status or call TU API from print.
- Do **not** add a separate `/print` route.

### Selection

v1: reuse pending-only, this-page selection (same as TU). Document that page size may need bumping for 20–30 (operator can raise `pageSize` or print page-by-page). Cross-page selection is a **follow-up** if packing complains — not a blocker for first merge.

### Connection chip (optional small)

`M110 · Connected` / `Connect printer` near toolbar when print feature is used. Keep minimal.

---

## Phase 3 — Config constants after measure

Lock in `constants.ts` after Phase 0:

```ts
export const LABEL_WIDTH_MM = /* measured */
export const LABEL_HEIGHT_MM = /* measured */
export const MEDIA = 0x0a /* or 0x0b / 0x26 */
export const LABEL_WIDTH_PX = min(roundMm(LABEL_WIDTH_MM), 384) // multiple of 8
export const LABEL_HEIGHT_PX = roundMm(LABEL_HEIGHT_MM)
```

Tune density/speed once a phone label looks right on paper.

---

## Phase 4 — Explicitly deferred

| Item | When |
|------|------|
| Capacitor transport | Only if G0/G3 fail on Bluefy |
| `labelPrintedAt` / print count | After daily use proves value |
| Cross-page selection | If pageSize=10 blocks packing |
| Rich labels (address, products) | If non-TU providers need them |
| `packages/m110` workspace package | Second consumer |
| Safari beacio extension | Alt if Bluefy unavailable; same Web BT code |

---

## Implementation order (PRs)

1. **PR0 (optional notes only):** Phase 0 results written into this file (label mm, Bluefy 30-ok).
2. **PR1:** `lib/phomemo/*` + sandbox/dev button or temporary detail “Print test” that prints one phone — no batch toolbar yet.
3. **PR2:** Batch “Print phones” on orders toolbar + progress/cancel.
4. **PR3 (later):** print audit fields / Capacitor fallback / selection improvements.

---

## File-level checklist (PR1+PR2)

- [ ] `apps/admin/src/lib/phomemo/constants.ts`
- [ ] `apps/admin/src/lib/phomemo/protocol.ts` — pure; unit-free; compare hex to `protocol.build_print_payload` dry dumps if useful
- [ ] `apps/admin/src/lib/phomemo/raster.ts`
- [ ] `apps/admin/src/lib/phomemo/web-bluetooth.ts`
- [ ] `apps/admin/src/lib/phomemo/printer.ts`
- [ ] `apps/admin/src/lib/phomemo/batch.ts`
- [ ] `apps/admin/src/lib/phomemo/index.ts`
- [ ] Wire `Print phones` in `orders-list.tsx` toolbar
- [ ] Feature-detect Bluetooth; Mongolian copy pointing at Bluefy when missing
- [ ] `bun run --cwd apps/admin check-types`

---

## Verification scripts / manual proofs

**No mock tests.** Proof is physical + browser.

```bash
# types only
bun run --cwd apps/admin check-types
```

**Manual G2:** Bluefy → admin → select 1 pending → Print phones → sticker shows correct phone.

**Manual G3:** select 5 then ~25 → progress completes; count stickers == N; cancel at 3 leaves 3 printed + rest pending in UI.

Optional desktop Chromium: same Web BT path for faster protocol iteration (if a BLE adapter is available).

---

## Mapping: pyphomemo → our TS

| pyphomemo | vit-store |
|-----------|-----------|
| `protocol.py` | `protocol.ts` + `constants.ts` |
| `imaging.text_to_raster` | `raster.ts` (phone-only canvas) |
| `printer.PhomemoPrinter` | `printer.ts` + `web-bluetooth.ts` |
| `server.JobQueue` sequential worker | `batch.ts` |
| `cli print-text --out` dry-run | canvas preview / PNG download |
| bleak reconnect / BlueZ dual-mode | observe under Bluefy; add inter-job delay; Capacitor later if needed |

Do **not** port FastAPI server, CLI, or Pillow. Do **not** copy GPL `phomemo-tools` source — only command bytes already documented in MIT pyphomemo.

---

## Operator runbook (after ship)

1. Open **Bluefy** (not Safari).
2. Go to `https://admin.amerikvitamin.mn`.
3. Log in as usual.
4. Orders → select pending → **Print phones** → pick M110 if asked.
5. Then **TU руу илгээх** as today.

---

## Open decisions (answer before PR2 if possible)

1. Exact label mm + media type (from Phase 0).
2. Phone formatting on sticker: raw digits vs spaced (`8811 9922`)?
3. After print, should selection clear automatically or stay for TU send? **Recommend: keep selection** so print → TU is one continuous gesture.
