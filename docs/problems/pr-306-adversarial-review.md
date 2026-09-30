# PR #306 adversarial review

Branch: `fix/khan-facebook-ios-handoff` vs `origin/main`
Files: `qpay-button.tsx`, `analytics.ts`, `bank-logos.ts`, `docs/problems/khan-bank-facebook-ios-handoff.md`
`deeplink-handoff.ts` is listed as related. The PR does not touch it.

## 1. Verdict

**REWORK.** This stops the four-tap Khan loop on one page, but it does it by bolting a Khan+Facebook special case onto a general bank-handoff panel instead of changing the default recovery model.

Do not merge this shape. Keep the retry-loop intent. Delete the extra flags, helpers, and layer leaks.

## 2. First-principles attack

Production fact from the problem doc: QPay invoice creation works. When Khan actually opens, payments succeed. Storefront cannot see Facebook's scheme-routing decision. The observed failure is "tap, stay visible 8s, recovery sheet, same Khan tile still there."

This PR does not change that model. Customer still taps Khan first. Still waits eight seconds. Only then does the UI hide Khan, force QR, and mention Facebook. The recovery contract is unchanged for every other bank and every other browser. `watchHandoff` still has one timeout and one failed path.

That is a bandaid on the retry loop, not a fix of the dead-scheme problem.

**Did we add a Khan+Facebook special case into a general bank-handoff component?** Yes. `QpayPaymentPanel` already owns a uniform handoff lifecycle (`idle → opening → opened | failed`) and one recovery sheet. The PR adds `recoveryVariant: "generic" | "khan_facebook"`, `hideKhanInFacebook`, `khanFacebookRecovery()`, `bankLinks()` filtering, grid copy, and three ternary strings in the sheet. All gated by `isFacebookIosBrowser() && isKhanBank(...)`.

**Are `recoveryVariant` and `hideKhanInFacebook` two flags for one fact?** Almost. On `no_handoff` they are set together. Then they diverge:

- `hideKhanInFacebook` is sticky for the page (grid filter + banner).
- `recoveryVariant` is reset to `"generic"` on `returned_unpaid`.
- The sheet reads `recoveryVariant`. The banner reads `hideKhanInFacebook`.

One failed Khan tap in Facebook now needs two signals, a derived helper, and a filter. The real fact is "this bank just failed handoff." `HandoffState.failed` already carries `bank`.

**Is `isKhanBank` in `bank-logos.ts` the right layer?** No. That file maps QPay names to local PNG paths. `KHAN_BANK_KEYS` duplicates the three Khan keys already in `BANK_LOGOS`. Payment policy (which tile to hide) leaked into a logo table because that was the nearest name-normalizer.

**Is `isFacebookIosBrowser` leaking payment policy into `analytics.ts`?** Yes. `detectInAppBrowser()` already exists for PostHog properties. The new export is unused by any tracker. Its comment names Khan Bank handoff. Payment UX is now importing a UA helper from the analytics module. Wrong owner. `deeplink-handoff.ts` already documents social-app webviews; that is the closer home if UA must live anywhere, and even that is optional if recovery stops caring which host app failed.

**Is hiding Khan after first failure the first-principles fix?** No. First principles for a scheme the storefront cannot route:

1. Do not keep offering a scheme that just failed. That is general, not Khan-only.
2. Prefer QR (or transfer) as the lead path in environments where custom schemes are known-unreliable, instead of spending eight seconds proving it again.
3. Universal links / `https` handoff / "Open in Safari" are the actual ways to beat Facebook IAB. Those are QPay/Khan/Facebook, not a Solid flag. This PR does not attempt them, which is honest, but then the storefront-side fix should be the smallest general recovery change, not a vendor special case.

Hiding Khan _up front_ in Facebook iOS is also not first principles. The same table shows 6 of 19 Facebook taps did handoff. Pre-hiding would throw away working Khan opens. The PR at least waits for one observed failure. That part is defensible. The special-case architecture around it is not.

**Could the same UX be: on any `no_handoff`, name the bank, open QR, stop re-offering that bank?** Yes. That deletes `recoveryVariant`, `hideKhanInFacebook`, `khanFacebookRecovery`, `isKhanBank`, and `isFacebookIosBrowser`. Copy becomes `{bank} нээгдсэнгүй`. If you still want Facebook in the sentence, interpolate `detectInAppBrowser()` into the existing description. You do not need a variant enum for one string.

The four-tap replay would still be fixed. Sono or TDB failing the same way would get the same treatment instead of becoming the next special case.

## 3. Overengineering / extra state / extra helpers

For "after one dead Khan tap in Facebook iOS, don't show Khan again and show QR," the PR adds:

| Piece                           | Needed?                                      |
| ------------------------------- | -------------------------------------------- |
| `recoveryVariant` union         | No. Sheet copy can use `handoff().bank`      |
| `hideKhanInFacebook`            | No. `failedBanks` or filter `handoff().bank` |
| `khanFacebookRecovery()`        | Identity wrapper around the union            |
| `bankLinks()`                   | One filter on failed bank names is enough    |
| `isKhanBank` + `KHAN_BANK_KEYS` | Feature predicate in the logo map            |
| `isFacebookIosBrowser`          | Payment policy in analytics                  |

`setShowQr(true)` on the special-case fail duplicates what "QR код уншуулах" already does, and generic `no_handoff` still does not auto-open QR. Inconsistent.

Hide is in-memory only. Remount the panel (continue-unpaid sheet, navigation, refresh) and Khan comes back. The problem doc's returning customer on the same Payment would still see Khan after a remount. The PR documents "rest of that page" as if that were the product boundary. It is an accident of `createSignal`.

A senior engineer would call this overcomplicated. The file grew 482 → 513 lines, but the real cost is two new modes in an already busy click handler, not the line count.

## 4. Code-judo alternative that deletes concepts

Change the default `no_handoff` path in `QpayPaymentPanel` only:

1. `HandoffState.failed(bank)` already names the bank.
2. Keep a `Set` or list of banks that failed handoff this session. Filter `invoiceData().urls` with that.
3. On `onFailed`: set recovery reason, `setShowQr(true)`, do not re-offer that bank.
4. Sheet title/description use `handoff().bank`. Dismiss copy stays "Өөр банк сонгох" for every failed handoff, not only Khan+Facebook.
5. Leave `analytics.ts` and `bank-logos.ts` alone.
6. Leave `deeplink-handoff.ts` alone unless you are changing timeout or detection, which this PR is not.

That is the same customer-visible loop fix without a Facebook policy object.

Optional later, separate from this PR: in Facebook IAB, lead the panel with QR and de-emphasize custom-scheme tiles. That is a default-path change, not a post-failure variant. Do not mix it into this retry-loop patch.

## 5. Incidental churn

`qpay-button.tsx` is a 337-line diff, +183/−154. `git diff --ignore-all-space --ignore-blank-lines` on that file is 146 lines. Most of the 337 is reindenting the entire `return` JSX (wrap in `<>`, extra indent on every line) plus import reorder (`WorkingStatus` moved) and `checkQpayPayment.mutate` argument formatting.

That wrapping was not required to add a filter and two strings. It makes the behavioral change hard to review and violates surgical change.

The 204-line problem doc is useful evidence. Mixing "current storefront behavior" that already describes the new hide-Khan path into the same file as the diagnosis makes the doc a changelog of the PR. Fine as notes. Not a substitute for a smaller code change.

No file crosses 1000 lines. Size is not the issue. Spaghetti growth is.

## 6. What is actually load-bearing and should stay

- Stop putting the failed bank back on the grid after `no_handoff`. That is the actual loop fix. Keep it, generalize it.
- Auto-showing QR after a dead tap. Keep it, for every bank.
- Naming the failed bank in the recovery sheet. `HandoffState.failed` already has the name.
- The problem doc's evidence (PostHog table, replay, non-causes, observation boundary). Keep that.
- Not claiming storefront can fix Facebook routing. The doc already says it cannot. The code should match that humility: recover generally, do not encode Khan×Facebook as a type.

## 7. Bottom line for the parent to tell the user

This PR treats a general recovery-loop bug as a Khan-in-Facebook feature. After one dead tap, hide that bank and show QR. Do that for every bank. Delete `recoveryVariant`, `hideKhanInFacebook`, `isKhanBank`, and `isFacebookIosBrowser`. Do not reindent the whole panel to land a filter. Facebook-specific copy is optional string interpolation, not a second recovery mode.

Hiding Khan only after an 8s wait is a reasonable storefront-side compromise given 6/19 Facebook taps still work. Encoding that compromise as two flags and two leaked helpers is the part that should not ship.
