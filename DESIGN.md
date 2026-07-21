---
name: Amerik Vitamin Storefront
description: Mongolian mobile-first storefront for US-imported vitamins and supplements. A warm sorbet counter run by a shopkeeper who knows every flavor.
colors:
  background: "oklch(0.98 0.012 90)"
  foreground: "oklch(0.28 0.02 60)"
  card: "oklch(0.995 0.008 95)"
  card-foreground: "oklch(0.28 0.02 60)"
  popover: "oklch(0.995 0.008 95)"
  popover-foreground: "oklch(0.28 0.02 60)"
  primary: "oklch(0.9 0.14 95)"
  primary-deep: "oklch(0.8 0.13 92)"
  primary-foreground: "oklch(0.28 0.02 60)"
  secondary: "oklch(0.28 0.02 60)"
  secondary-foreground: "oklch(0.98 0.012 90)"
  muted: "oklch(0.955 0.01 90)"
  muted-foreground: "oklch(0.48 0.025 70)"
  accent: "oklch(0.9 0.14 95)"
  accent-foreground: "oklch(0.28 0.02 60)"
  destructive: "oklch(0.68 0.14 30)"
  destructive-foreground: "oklch(0.98 0.012 90)"
  sale: "oklch(0.68 0.14 30)"
  sale-foreground: "oklch(0.98 0.012 90)"
  error: "oklch(0.93 0.04 15)"
  error-foreground: "oklch(0.28 0.02 60)"
  success: "oklch(0.88 0.1 150)"
  success-foreground: "oklch(0.28 0.02 60)"
  info: "oklch(0.9 0.06 235)"
  info-foreground: "oklch(0.28 0.02 60)"
  warning: "oklch(0.9 0.12 85)"
  warning-foreground: "oklch(0.28 0.02 60)"
  border: "oklch(0.88 0.02 85)"
  input: "oklch(0.93 0.012 88)"
  ring: "oklch(0.75 0.12 95)"
  cocoa: "oklch(0.35 0.05 50)"
  sand: "oklch(0.88 0.03 60)"
  wash-peach: "oklch(0.9 0.06 45)"
  wash-blush: "oklch(0.91 0.05 10)"
  wash-mint: "oklch(0.93 0.06 160)"
  wash-sky: "oklch(0.92 0.05 230)"
  wash-lilac: "oklch(0.9 0.05 300)"
  wash-lemon: "oklch(0.95 0.08 100)"
  wash-sage: "oklch(0.92 0.04 130)"
  wash-apricot: "oklch(0.92 0.07 70)"
typography:
  display:
    fontFamily: '"Unbounded Variable", "Unbounded", "Onest Variable", system-ui, sans-serif'
    fontSize: "clamp(1.9rem, 6vw, 3.2rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: '"Unbounded Variable", "Unbounded", "Onest Variable", system-ui, sans-serif'
    fontSize: "clamp(1.4rem, 4vw, 2.1rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: '"Unbounded Variable", "Unbounded", "Onest Variable", system-ui, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  body:
    fontFamily: '"Onest Variable", "Onest", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: '"Onest Variable", "Onest", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.05em"
  mono:
    fontFamily: '"Geist Mono", "Geist Mono Fallback", ui-monospace, monospace'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  2xl: "1.5rem"
  full: "9999px"
spacing:
  section-sm: "1.5rem"
  section-md: "2.5rem"
  section-lg: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-dark:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  badge-sticker:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  badge-sale:
    backgroundColor: "{colors.sale}"
    textColor: "{colors.sale-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
    height: "48px"
  add-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    height: "44px"
    width: "44px"
---

# Design System: Amerik Vitamin Storefront

## 1. Overview

**Creative North Star: "The Sorbet Counter"**

Amerik Vitamin is a bright ice-cream counter run by a shopkeeper who knows every flavor by heart. The canvas is warm cream, never sterile white. Categories arrive as soft sorbet washes, each keyed to meaning so a returning customer learns the room by color. There is exactly one butter-yellow voice for "buy this," and it is the warmest, most physical thing on the screen. This honors PRODUCT.md's brand of a "confident local shopkeeper who knows their stock inside-out," rendered in warmth and personality without sacrificing the clarity a shopper scrolling at speed needs.

The system is chunky and springy: soft at rest, physical on press. Surfaces sit on quiet ambient shadows. Buttons are full pills that lift when you reach for them and depress when you commit. Sorbet washes tint product cards and hero frames. Motion follows an Emil Kowalski doctrine: custom ease-out curves, transform and opacity and filter only, entrances that rise gently through `@starting-style`, and exits that leave faster than they arrive. One deliberate bounce is sanctioned, the hero authenticity sticker, and it exists precisely because everything else is calm. This is a redesign away from the old neo-brutalist system: the hard black 2px to 4px borders, the sharp zero-radius corners, the stamped offset shadows on everything, and the all-uppercase Space Grotesk screaming are all retired. Warmth replaces aggression.

This is a mobile-first surface. 99% of traffic is a thumb on a phone, so touch targets stay at 44 by 44dp minimum, CTAs stay thumb-reachable, and every animation respects `prefers-reduced-motion`. It explicitly rejects the "generic minimalist black-and-white shadcn/ui lookalike," the "cold, clinical pharmacy or medical-supply website," the "templated Shopify storefront with stock photography and generic trust badges," and the "overly corporate supplement brand that buries products in lifestyle fluff."

**Key Characteristics:**
- Warm cream canvas (`oklch(0.98 0.012 90)`), never cold white.
- One butter-yellow CTA voice; category meaning carried by eight sorbet washes.
- Full pill corners and generous 12px to 24px radii; sharp corners are forbidden.
- Hybrid elevation: soft ambient shadows by default, a 2px butter "lift" on CTAs, hard Neopop "stamps" reserved for stickers and the card "+" only.
- Unbounded display over Onest body; sentence case everywhere.
- Emil-style motion: ease-out curves, transform and opacity only, one sanctioned bounce.

## 2. Colors: The Sorbet Palette

A warm cream stage lit by a single butter spotlight, with eight sorbet washes standing in for the flavors on the counter.

### Primary
- **Butter** (`oklch(0.9 0.14 95)`): The one CTA voice. Primary buttons, the hero add-to-products button, the round product-card "+", active navigation, and the logo tile. This is the only saturated warm accent that says "act."
- **Butter Deep** (`oklch(0.8 0.13 92)`): Never a fill. It is the solid 2px underline color beneath every butter CTA (`shadow-lift`) and the loading-bar progress color. It is the shadow butter casts.

### Secondary
- **Espresso** (`oklch(0.28 0.02 60)`): The ink. All body and heading text, icons, and the fill of the dark button variant and footer bands. Warm near-black, never a true `#000`.

### Tertiary: The Washes
Eight low-chroma sorbet tints used as product-card image backgrounds, hero frames, and category surfaces. They are keyed to category, never chosen at random (see The Wash Rule).
- **Peach** (`oklch(0.9 0.06 45)`), **Blush** (`oklch(0.91 0.05 10)`), **Mint** (`oklch(0.93 0.06 160)`), **Sky** (`oklch(0.92 0.05 230)`), **Lilac** (`oklch(0.9 0.05 300)`), **Lemon** (`oklch(0.95 0.08 100)`), **Sage** (`oklch(0.92 0.04 130)`), **Apricot** (`oklch(0.92 0.07 70)`).

### Neutral
- **Warm Cream** (`oklch(0.98 0.012 90)`): The page canvas. Every screen sits on this warm ground.
- **Card** (`oklch(0.995 0.008 95)`): The near-white surface of cards, popovers, and inputs, one step brighter than the canvas.
- **Muted** (`oklch(0.955 0.01 90)`): Subtle fills, ghost-button hover, disabled states.
- **Muted Foreground** (`oklch(0.48 0.025 70)`): Secondary text, brand labels, captions, delivery microcopy.
- **Border** (`oklch(0.88 0.02 85)`): The default hairline divider between sections, cards, and inputs. Warm and quiet, never black.
- **Cocoa** (`oklch(0.35 0.05 50)`): The Neopop outline color. The 2px border and offset-shadow color on stickers and the card "+" button, and the source of every subtle pattern tint.
- **Sand** (`oklch(0.88 0.03 60)`): The soft Neopop offset color for the largest stamp (`shadow-pop-sand`).
- **Ring** (`oklch(0.75 0.12 95)`): Focus outlines, a butter-adjacent glow.

### Semantic
- **Coral** (`oklch(0.68 0.14 30)`): Sale chips and destructive actions share this one warm red (`destructive` and `sale` are the same value). Nothing else may use it.
- **Success** (`oklch(0.88 0.1 150)`), **Warning** (`oklch(0.9 0.12 85)`), **Info** (`oklch(0.9 0.06 235)`), **Error** (`oklch(0.93 0.04 15)`): Restock confirmation, low-stock badge, informational accents, and invalid-input backgrounds respectively. All sit in the same low-chroma sorbet register so semantic states never scream.

### Named Rules
**The Wash Rule.** Washes are keyed to category, never random. A card's wash comes from `washFor(categoryId)` in `apps/storev2/src/lib/wash.ts`, a stable hash into the eight-color `WASH_ORDER`. The same category is always the same flavor across the whole store. Never hardcode a wash, cycle them decoratively, or pick one to "look nice." Meaning is the point.

**The One Voice Rule.** Butter is the only "buy" voice. If two butter CTAs compete in one viewport, one of them is wrong. Everything else that is interactive but not the primary action is a card-surface or ghost treatment, never butter.

**The Coral Lock Rule.** Coral (`oklch(0.68 0.14 30)`) is reserved for sale and destructive only. Never use it for emphasis, decoration, or a second accent. Its rarity is what makes a `-20%` chip read instantly.

## 3. Typography

**Display Font:** Unbounded Variable (with Onest Variable, system-ui fallback). Cyrillic-capable, which is non-negotiable for Mongolian copy.
**Body Font:** Onest Variable (with Onest, system-ui, sans-serif).
**Label/Mono Font:** Geist Mono (with Geist Mono Fallback, ui-monospace) for the rare numeric or code context.

**Character:** Unbounded is a rounded, friendly geometric display face that carries the shopkeeper's personality in headings and prices. Onest is a clean, warm humanist sans that keeps body copy and UI calm and legible on a small screen. The pairing is playful up top, quiet in the paragraph.

### Hierarchy
- **Display / H1** (Unbounded, 600, `clamp(1.9rem, 6vw, 3.2rem)`, line-height 1.1, `-0.01em`): Hero headline and page titles. One per screen.
- **Headline / H2** (Unbounded, 600, `clamp(1.4rem, 4vw, 2.1rem)`, line-height 1.15, `-0.01em`): Section headers ("Онцлох", "Шинэ ирсэн").
- **Title / H3** (Unbounded, 600, `1.25rem`, line-height 1.25, `-0.005em`): Card titles, subsection headers.
- **Body** (Onest, 500, `1rem`, line-height 1.6): Product descriptions, paragraphs. Medium weight is the resting body weight; body never drops below 500.
- **Price** (Unbounded, 700, `1rem` base, `-0.01em`): Prices wear the display face at bold weight so they read as confident and countable.
- **Label** (Onest, 600, `0.75rem`, `0.05em`): Brand tags, kickers, metadata. This is the largest size allowed to go uppercase (see The Sentence Case Rule).

### Named Rules
**The Sentence Case Rule.** Sentence case everywhere. Headings, buttons, and product names are sentence case. Uppercase is permitted only for tracked labels at 12px (`0.75rem`) and under, with positive letter-spacing (`0.05em` and up). The old all-caps `font-black` shouting is retired; loudness now comes from the Unbounded face and size, not from caps-lock.

**The Display-For-Meaning Rule.** Unbounded is reserved for headings and prices, the two things a shopper scans for. Do not set body copy, form labels, or long strings in Unbounded; that is Onest's job. If a whole paragraph is in the display face, it is wrong.

## 4. Elevation

Hybrid by design. Surfaces rest on soft, diffuse ambient shadows tinted with the warm ink hue (`oklch(0.3 0.02 60)`), the way objects sit under a warm shop light. Butter CTAs get a physical solid 2px "lift" that grows to 4px on hover, simulating a real key you can press. Hard Neopop offset "stamps" using cocoa and sand exist, but they are rationed to three specific elements. Nothing here uses a cold black drop shadow or a stamped offset on a card.

### Shadow Vocabulary
- **shadow-soft-sm** (`box-shadow: 0 1px 2px oklch(0.3 0.02 60 / 0.08)`): The lightest rest state. Icon buttons, small chips, the logo tile.
- **shadow-soft** (`box-shadow: 0 2px 6px oklch(0.3 0.02 60 / 0.1)`): The default card and container elevation at rest.
- **shadow-soft-lg** (`box-shadow: 0 8px 24px oklch(0.3 0.02 60 / 0.12)`): Card hover, hero frame, popover and dropdown surfaces.
- **shadow-soft-xl** (`box-shadow: 0 12px 32px oklch(0.3 0.02 60 / 0.14)`): The deepest ambient step, for overlays and sheets.
- **shadow-lift** (`box-shadow: 0 2px 0 0 var(--color-primary-deep)`): The butter CTA rest state, a solid Butter Deep underline.
- **shadow-lift-lg** (`box-shadow: 0 4px 0 0 var(--color-primary-deep)`): The butter CTA hover state, paired with a 2px upward translate.
- **shadow-pop-sm** (`box-shadow: 2px 2px 0 0 var(--color-cocoa)`): The small cocoa stamp. Sticker badges and the product-card "+".
- **shadow-pop** (`box-shadow: 3px 3px 0 0 var(--color-cocoa)`): The medium cocoa stamp.
- **shadow-pop-sand** (`box-shadow: 4px 4px 0 0 var(--color-sand)`): The largest, softest stamp in sand.

### Named Rules
**The Stamp Rule.** Hard Neopop offset shadows (`shadow-pop-*`) are reserved for sticker badges, sale chips, and the product-card "+" button. Nowhere else. A card, an input, a section, or a plain button that wears a hard offset stamp is a bug. Default elevation is always a soft ambient shadow.

**The Lift Rule.** Only butter CTAs lift. `shadow-lift` and its hover growth to `shadow-lift-lg` belong exclusively to the primary action. On press the CTA translates back to zero and drops the shadow, so committing feels like pressing a real key. Do not apply lift to secondary, ghost, or dark buttons; those use soft ambient shadows.

## 5. Components

For each component: a character line, then shape, color, states, and distinctive behavior. Every interactive element shares one motion contract: `transition-duration: 140ms` on a `--ease-out` curve, and `active:scale(0.97)` on press. Chunky and springy: soft at rest, physical on press.

### Buttons
- **Shape:** Full pill (`rounded-full`, `9999px`). Default height 48px (`h-12`), padded `px-6`; large is 56px (`h-14`), small is 40px (`h-10`), icon is a 44px circle.
- **Primary (butter):** `bg-primary` on `text-primary-foreground`, resting on `shadow-lift`. Hover translates up 2px and grows to `shadow-lift-lg`. Active returns to `translateY(0)`, drops to `shadow-none`, and scales to 0.97. This is the physical key.
- **Secondary / Outline:** `bg-card` with a hairline `border-border` and `shadow-soft-sm`. Hover fills `bg-muted` and deepens to `shadow-soft`. No lift.
- **Dark:** `bg-secondary` (Espresso) on cream text, `shadow-soft`, hover lifts via `-translate-y-[2px]` and `shadow-soft-lg`. For high-contrast secondary actions.
- **Destructive:** `bg-destructive` (Coral) on cream, same soft-lift motion as dark.
- **Ghost:** No border, no shadow; hover applies `bg-muted`. **Link:** underlined text only.
- **Weight and case:** `font-semibold`, sentence case. Never uppercase, never `font-black`.

### Chips / Badges
- **Style:** Full pill (`rounded-full`), `px-3 py-1`, `text-xs font-semibold`, 140ms color transition. Sentence case except tiny tracked labels.
- **default:** `bg-primary`. **secondary:** `bg-secondary`. **outline:** `bg-card` + `border-border`. **success / warning / error / info:** the matching low-chroma semantic fill.
- **sale:** `bg-sale` (Coral) on cream, used as the discount chip, often rotated `-2deg` and stamped with `shadow-pop-sm`.
- **sticker:** `bg-card` with a 2px `border-cocoa` and `shadow-pop-sm`, `font-bold`. The one badge that wears the hard stamp on purpose (see The Stamp Rule).

### Cards / Containers
- **Corner Style:** Generous rounding. Cards use `rounded-2xl` (1.5rem); product cards use `rounded-2xl`; the hero frame uses `rounded-3xl`.
- **Background:** `bg-card` on `text-card-foreground`. Product-card image areas take a category wash behind the image.
- **Shadow Strategy:** `shadow-soft` at rest, `shadow-soft-lg` on hover (see Elevation). Product cards also translate up 3px on hover.
- **Border:** A single hairline `border-border`. Never a thick or black border.
- **Internal Padding:** `p-6 md:p-8` for content cards; `p-3` for the compact product card. Header divides with a hairline `border-b border-border`.

### Inputs / Fields
- **Style:** `bg-card` with a hairline `border-border`, `rounded-xl` (1.25rem), 48px tall (`h-12`), `px-4`, `font-medium`. Transitions border, box-shadow, and background over 140ms.
- **Focus:** `focus-visible:ring-2 ring-ring` plus a `border-cocoa/50` shift. A calm warm glow, no jump.
- **Error / Invalid:** `border-destructive`, `bg-error/60` tint, and `text-destructive`, with a `ring-destructive/40` focus ring.
- **Labels:** `text-xs font-semibold tracking-wide`, sentence case.

### Select / Dropdown
- **Trigger:** identical to the input (`h-12`, `rounded-xl`, `border-border`, `bg-card`, 140ms), with a right-aligned expand-up-down icon at 50% opacity.
- **Content:** `rounded-xl` panel, `bg-popover`, hairline `border-border`, `shadow-soft-lg`, with a fade-in animation. Items are `rounded-lg`, highlight to `bg-muted` on focus.

### Navigation (Header)
- **Style:** Sticky top bar, `bg-background` with `backdrop-blur-md` where supported, divided by a hairline `border-b border-border`. The logo is a butter `rounded-xl` tile with `shadow-soft-sm`.
- **Controls:** 44px circular icon buttons (`rounded-full`), hover `bg-muted`, `active:scale-[0.94]` on an `--ease-out-quart` curve. Mobile menu and cart open as sheets.

### Product Card (Signature)
The core merchandising unit. `rounded-2xl` card, hairline border, `shadow-soft`. The image sits on its category wash (`WASH_BG[washFor(categoryId)]`); on hover the whole card lifts 3px to `shadow-soft-lg` and the image scales to 1.05. Sale and stock badges pin to the corners. The bottom row pairs an Unbounded price against the round butter "+" button. Out-of-stock desaturates the wash and image.

### Card Add Button (Signature)
The round butter "+", the card's single Neopop element. A 44px `rounded-full` butter circle with a 1px `border-cocoa` and `shadow-pop-sm`. On press it translates 2px into its own shadow (`active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`), the one place the interface feels like a physical stamp. After adding, it morphs to a success check via a blur crossfade.

### Hero Authenticity Sticker (Signature)
A `-rotate-3` cream pill with a 2px `border-cocoa` and `shadow-pop-sm`, reading "100% genuine." It is the only element allowed to bounce (see The One Bounce Rule).

### Named Rules
**The Chunky-And-Springy Rule.** Every interactive element is soft at rest and physical on press: `active:scale(0.97)`, 140ms, `--ease-out`. Full pill or generously rounded, never sharp. If a control does not respond to a press, it feels dead and is wrong.

**The One Bounce Rule.** Exactly one overshoot bounce exists in the whole system: the hero authenticity sticker's entrance (`sticker-pop`, `cubic-bezier(0.34, 1.56, 0.64, 1)`, 450ms). It is deliberate brand personality, sanctioned precisely because everything else uses non-overshooting ease-out curves. Never add a second bounce; a springy CTA, a bouncing modal, or a wobbling card breaks the contract. All other entrances use `enter-fade` / `enter-rise` / `enter-scale` with `stagger-1` through `stagger-8`, transform and opacity only, and exits leave faster than entrances arrive.

## 6. Do's and Don'ts

### Do:
- **Do** sit every screen on the warm cream canvas (`oklch(0.98 0.012 90)`), never on cold white.
- **Do** derive product and category surface color from `washFor(categoryId)`. Washes are keyed to category, never random.
- **Do** keep butter (`oklch(0.9 0.14 95)`) as the single "buy" voice; give the primary CTA `shadow-lift` and let it lift on hover, press on active.
- **Do** reserve hard Neopop stamps (`shadow-pop-*`) for sticker badges, sale chips, and the product-card "+" only. Everything else rests on soft ambient shadows.
- **Do** write sentence case everywhere; reserve uppercase for tracked labels at 12px and under.
- **Do** set headings and prices in Unbounded, body and UI in Onest.
- **Do** use one motion contract for interactive elements: 140ms, `--ease-out`, `active:scale(0.97)`.
- **Do** keep touch targets at 44 by 44dp minimum and respect `prefers-reduced-motion`.
- **Do** show price, stock status, brand origin, and delivery info upfront; trust is earned by real information, not badges.

### Don't:
- **Don't** ship a generic minimalist black-and-white shadcn/ui lookalike. Warm cream, sorbet washes, and Unbounded are the antidote.
- **Don't** make it feel like a cold, clinical pharmacy or medical-supply website. Warmth is a requirement, not a garnish.
- **Don't** look like a templated Shopify storefront with stock photography and generic trust badges. Use real product imagery and show real delivery and origin facts.
- **Don't** bury products in lifestyle fluff like an overly corporate supplement brand. Conversion is the only metric; if an element does not help someone buy faster, it is clutter.
- **Don't** revive the retired neo-brutalist system: no sharp zero-radius corners, no thick 2px to 4px black borders, no stamped offset shadows on cards, no all-uppercase `font-black` shouting.
- **Don't** use a true black (`#000`) or a cold gray. Ink is warm Espresso (`oklch(0.28 0.02 60)`); borders are warm (`oklch(0.88 0.02 85)`).
- **Don't** use coral for anything but sale and destructive. No second accent may compete with butter.
- **Don't** add a second bounce. The hero sticker is the only sanctioned overshoot.
- **Don't** use gradient text or `background-clip: text`. Emphasis comes from the display face, weight, and size.
- **Don't** use side-stripe borders (`border-left: 4px solid`) as card accents. Use a full hairline, a wash tint, or an icon.
- **Don't** animate anything but transform, opacity, and filter, and never let an animation slow the mobile scroll.
- **Don't** use em dashes in copy. Use commas, colons, or periods.
