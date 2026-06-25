---
name: Amerik Vitamin Storefront
description: Mongolian e-commerce storefront for US-imported vitamins and supplements. Neo-brutalist, mobile-first, conversion-obsessed.
colors:
  background: "#fcfcfc"
  foreground: "#0b0b0b"
  card: "#ffffff"
  card-foreground: "#0b0b0b"
  popover: "#ffffff"
  popover-foreground: "#0b0b0b"
  primary: "#ffe362"
  primary-foreground: "#0b0b0b"
  secondary: "#0b0b0b"
  secondary-foreground: "#fcfcfc"
  muted: "#eeeeee"
  muted-foreground: "#555555"
  accent: "#ffe362"
  accent-foreground: "#0b0b0b"
  destructive: "#e7000b"
  destructive-foreground: "#fcfcfc"
  error: "#ffaebe"
  error-foreground: "#0b0b0b"
  success: "#bcfc73"
  success-foreground: "#0b0b0b"
  info: "#30ffff"
  info-foreground: "#0b0b0b"
  warning: "#ffd92c"
  warning-foreground: "#0b0b0b"
  border: "#0b0b0b"
  input: "#e5e5e5"
  ring: "#0b0b0b"
  chart-1: "#ffe362"
  chart-2: "#d1a84b"
  chart-3: "#a19200"
  chart-4: "#e7cb80"
  chart-5: "#877100"
typography:
  display:
    fontFamily: '"Space Grotesk", "Space Grotesk Fallback", system-ui, sans-serif'
    fontSize: "clamp(2rem, 8vw, 4rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.04em"
    textTransform: "uppercase"
  headline:
    fontFamily: '"Space Grotesk", "Space Grotesk Fallback", system-ui, sans-serif'
    fontSize: "clamp(1.5rem, 4vw, 2.5rem)"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    textTransform: "uppercase"
  title:
    fontFamily: '"Space Grotesk", "Space Grotesk Fallback", system-ui, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    textTransform: "uppercase"
  body:
    fontFamily: '"Space Grotesk", "Space Grotesk Fallback", system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: '"Space Grotesk", "Space Grotesk Fallback", system-ui, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.1em"
    textTransform: "uppercase"
  mono:
    fontFamily: '"Geist Mono", "Geist Mono Fallback", monospace'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  none: "0px"
  sm: "0px"
  md: "0px"
  lg: "0px"
  xl: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-outline-hover:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.none}"
    padding: "16px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.none}"
    padding: "4px 12px"
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.none}"
    padding: "4px 12px"
---

# Amerik Vitamin — Design System

## Overview

Amerik Vitamin's storefront is a **neo-brutalist, editorial e-commerce interface** designed for 99% mobile traffic. Every decision prioritizes conversion: fast scanability, thumb-reachable CTAs, and zero decorative friction. The visual language combines warm, playful energy (a butter-yellow accent, heavy uppercase typography) with uncompromising structural clarity (sharp corners, thick black borders, hard offset shadows).

The design system is implemented in Tailwind CSS v4 with OKLCH color tokens, though the canonical palette is documented below in both OKLCH and hex for compatibility.

**Two files govern all visual output:**
- `apps/storev2/src/styles/global.css` — Tailwind theme tokens, base styles, shadow utilities, and keyframe animations.
- `apps/storev2/components.json` — shadcn/ui registry configuration.

### Key Design Decisions

- **Mobile-first, always.** Desktop is a wider version of the mobile layout, never a separate experience.
- **Borders are structure, not decoration.** 2px–4px black borders separate every container, card, and section.
- **Shadows are hard offsets.** No soft Gaussian blur. Every shadow is a solid-color offset (2px–12px) that creates a "stamped" physical depth.
- **All corners are sharp.** `border-radius: 0` everywhere. No pills, no rounded buttons, no soft edges.
- **Typography screams confidence.** Space Grotesk at `font-weight: 900` with tight tracking and uppercase is the default voice. Body text stays bold (`font-weight: 500+`) even at small sizes.

---

## Colors

### Primary Palette

| Token | OKLCH | Hex | Usage |
|-------|-------|-----|-------|
| **Background** | `oklch(0.99 0 0)` | `#fcfcfc` | Page background, lightest surface |
| **Foreground** | `oklch(0.15 0 0)` | `#0b0b0b` | Primary text, borders, icons |
| **Primary** | `oklch(0.92 0.15 95)` | `#ffe362` | CTAs, hero accents, brand highlight, active states |
| **Primary Foreground** | `oklch(0.15 0 0)` | `#0b0b0b` | Text on primary backgrounds |
| **Secondary** | `oklch(0.15 0 0)` | `#0b0b0b` | Inverse surfaces (dark buttons, footer bands) |
| **Secondary Foreground** | `oklch(0.99 0 0)` | `#fcfcfc` | Text on secondary backgrounds |

### Supporting Palette

| Token | OKLCH | Hex | Usage |
|-------|-------|-----|-------|
| **Muted** | `oklch(0.95 0 0)` | `#eeeeee` | Subtle backgrounds, disabled states |
| **Muted Foreground** | `oklch(0.45 0 0)` | `#555555` | Secondary text, labels, captions |
| **Accent** | `oklch(0.92 0.15 95)` | `#ffe362` | Same as primary; used for hover highlights, focus rings |
| **Accent Foreground** | `oklch(0.15 0 0)` | `#0b0b0b` | Text on accent backgrounds |
| **Destructive** | `oklch(0.577 0.245 27.325)` | `#e7000b` | Errors, remove actions, stock-out badges |
| **Destructive Foreground** | `oklch(0.99 0 0)` | `#fcfcfc` | Text on destructive backgrounds |
| **Error** | `oklch(0.92 0.18 15)` | `#ffaebe` | Soft error backgrounds, invalid input states |
| **Error Foreground** | `oklch(0.15 0 0)` | `#0b0b0b` | Text on error backgrounds |
| **Success** | `oklch(0.92 0.18 130)` | `#bcfc73` | Success states, restock confirmations |
| **Success Foreground** | `oklch(0.15 0 0)` | `#0b0b0b` | Text on success backgrounds |
| **Info** | `oklch(0.92 0.15 200)` | `#30ffff` | Informational accents |
| **Info Foreground** | `oklch(0.15 0 0)` | `#0b0b0b` | Text on info backgrounds |
| **Warning** | `oklch(0.92 0.18 85)` | `#ffd92c` | Warning accents |
| **Warning Foreground** | `oklch(0.15 0 0)` | `#0b0b0b` | Text on warning backgrounds |
| **Border** | `oklch(0.15 0 0)` | `#0b0b0b` | All structural borders (cards, inputs, sections) |
| **Input** | `oklch(0.922 0 0)` | `#e5e5e5` | Form field backgrounds |
| **Ring** | `oklch(0.15 0 0)` | `#0b0b0b` | Focus outlines |

### Product Card Backgrounds

A cycling palette of 24 bright, pastel, and neon colors used as product card/image backgrounds. These inject playfulness and help products feel distinct at a glance:

`#FFE066`, `#FFF991`, `#FFD84D`, `#FFEE88`, `#FFB5E8`, `#B4F8C8`, `#FFC6A5`, `#FFABAB`, `#FFF5BA`, `#E7FFAC`, `#CAFFBF`, `#A0C4FF`, `#D4A5FF`, `#FFD6E8`, `#B9FBC0`, `#FDFFB6`, `#FBE4FF`, `#C4FAF8`, `#FFE5B4`, `#E8F3D6`, `#FFD1DC`, `#D6E9FF`, `#FFCCE5`, `#F5E6CC`

### Color Strategy

**Committed palette with warm dominance.** The warm yellow primary carries ~30% of interactive surface area. Black/white neutrals carry the rest. No secondary brand color competes for attention. This is intentionally simple: a Mongolian shopper scrolling at speed must instantly recognize "this is a button" or "this is on sale."

### Theme

**Light mode only.** The physical scene: a person scrolling on their phone in bright daylight, on public transit, or in a well-lit room. Light surfaces with high-contrast black text maximize legibility in these conditions. Dark mode is not implemented.

---

## Typography

### Font Stack

- **Primary:** `Space Grotesk`, `Space Grotesk Fallback`, `system-ui`, `sans-serif`
- **Monospace:** `Geist Mono`, `Geist Mono Fallback`, `monospace`

Space Grotesk is loaded via Google Fonts. The "Fallback" fonts are auto-generated subset fallbacks for FOUT reduction.

### Type Scale

| Role | Size | Weight | Line Height | Letter Spacing | Transform |
|------|------|--------|-------------|----------------|-----------|
| **Display** | `clamp(2rem, 8vw, 4rem)` | 900 | 0.95 | `-0.04em` | uppercase |
| **Headline** | `clamp(1.5rem, 4vw, 2.5rem)` | 900 | 1.1 | `-0.02em` | uppercase |
| **Title** | `1.25rem` (20px) | 900 | 1.2 | `-0.01em` | uppercase |
| **Body** | `1rem` (16px) | 500 | 1.6 | normal | none |
| **Small** | `0.875rem` (14px) | 700 | 1.5 | normal | none |
| **Label** | `0.75rem` (12px) | 900 | 1 | `0.1em` | uppercase |
| **Caption** | `0.625rem` (10px) | 700–900 | 1.2 | `0.05em`–`0.25em` | uppercase |

### Hierarchy Rules

- **Weight contrast drives hierarchy, not just size.** Labels are tiny (`10px`) but `font-black` with wide tracking, making them as visually loud as body paragraphs.
- **Uppercase is structural, not decorative.** Section headers, buttons, badges, labels, and navigation links are always uppercase. Body text and product descriptions stay sentence-case for readability.
- **Line length is capped at `65ch` for body text.** Headlines can break arbitrarily; they are sized to fit mobile widths without overflow.

---

## Elevation

No soft shadows. Elevation is expressed through **hard offset box-shadows** that simulate a physical stamp or cut-paper layer. All shadows use the border color (`#0b0b0b`) as the offset color.

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-hard-sm` | `2px 2px 0 0 var(--color-border)` | Badges, small icons, hover lifts |
| `shadow-hard` | `4px 4px 0 0 var(--color-border)` | Cards, section containers, default elevation |
| `shadow-hard-lg` | `8px 8px 0 0 var(--color-border)` | Hero images, featured product cards, modals |
| `shadow-hard-xl` | `12px 12px 0 0 var(--color-border)` | Maximum elevation, rarely used |
| `shadow-hard-reverse` | `-4px 4px 0 0 var(--color-border)` | Decorative asymmetry, left-offset depth |

### Shadow Interaction Pattern

On hover/press, shadows **compress and shift** to simulate physical depression:

- **Default:** `shadow-[6px_6px_0_0_#000]`
- **Hover:** `shadow-[3px_3px_0_0_#000]` + `translate(3px, 3px)`
- **Active/Pressed:** `shadow-none` + `translate(4px, 4px)`

This applies to buttons, cards, and interactive badges.

### No Border Radius

`border-radius: 0` globally. All components — buttons, inputs, cards, modals, badges — have sharp corners. This is non-negotiable for the neo-brutalist identity.

---

## Components

### Button

The workhorse interactive element. Always uppercase, always bold, always sharp.

**Base styling:**
- `border-3 border-black`
- `shadow-[6px_6px_0_0_#000]` (or `#fff` for secondary variant)
- `font-black uppercase tracking-wide`
- `active:translate-x-[4px] active:translate-y-[4px] active:shadow-none`
- Hover compresses shadow to `3px 3px` and translates `3px, 3px`

**Variants:**
- **Default:** `bg-primary text-primary-foreground`
- **Destructive:** `bg-destructive text-destructive-foreground`
- **Outline:** `bg-white text-black` → hover inverts to `bg-black text-white`
- **Secondary:** `bg-secondary text-secondary-foreground` with white shadow
- **Ghost:** no border, no shadow; hover applies muted background
- **Link:** no border, no shadow; underlined text

**Sizes:**
- **Default:** `h-12 md:h-14 px-6 md:px-8`
- **Small:** `h-10 px-4`
- **Large:** `h-16 px-10`
- **Icon:** `size-12`

### Card

- `border-4 border-black`
- `bg-card text-card-foreground`
- `shadow-[8px_8px_0_0_#000]`
- `transition-all` for hover shadow compression
- **Header:** `border-b-4 border-black p-6 md:p-8`
- **Content:** `p-6 md:p-8 pt-0`
- **Footer:** `p-6 pt-0`

Cards are used sparingly. The homepage hero uses a split-grid layout where products sit inside bordered cells rather than floating cards.

### Input (TextField)

- `border-3 border-black bg-white`
- `shadow-[6px_6px_0_0_#000]`
- `h-12 md:h-14 px-4 md:px-5`
- `text-base md:text-lg font-bold`
- Focus: `shadow-[8px_8px_0_0_#000] translate(-2px, -2px) ring-4 ring-ring`
- Invalid: red border + red shadow

Labels are `font-black uppercase tracking-wider`. Error messages follow the same style in `text-destructive`.

### Badge

- `border-2 border-black px-3 py-1`
- `shadow-[2px_2px_0_0_#000]` (white shadow for secondary)
- `text-xs font-black uppercase tracking-wide`
- Hover lifts shadow to `3px 3px` and shifts `-1px, -1px` (opposite direction for "pop" effect)

**Variants:** default, secondary, outline, success, warning, error.

### Product Card

The core merchandising component. Two forms exist:

**Server-rendered (Astro):**
- `border-2 border-border bg-card`
- Image area: colored background from `productColors` palette + `object-contain` product image
- Content area: brand label (`8px uppercase`), product name (`11px md:text-xs bold line-clamp-2`), price + add-to-cart row (`border-t-2`)
- `active:shadow-hard-sm`

**Client-rendered (Solid):**
- Same structure with reactive add-to-cart and image carousel.

### Select

⚠️ **Inconsistency noted:** The Select component uses `rounded-md` and `border border-input`, breaking the global sharp-corner system. It should be refactored to `border-2 border-black rounded-none` to match the rest of the interface.

### Toast

Solid-positioned, non-blocking notifications. Uses the same hard-border/sharp-corner language.

### Sheet / Drawer

Mobile navigation and cart drawer. Slides from left or bottom with a `border-r-2` or `border-t-2` treatment.

---

## Do's and Don'ts

### Do

- **Do** use `border-border` (2px black) for structural divisions between sections.
- **Do** pair every interactive element with a hard shadow that compresses on press.
- **Do** keep mobile touch targets at least `44×44dp`.
- **Do** use the product color palette (`productColors`) for image backgrounds — it injects personality and helps scanability.
- **Do** respect `prefers-reduced-motion` by disabling float/wiggle animations.
- **Do** use `font-black` and uppercase for any element that needs to feel like a "label" — even at `10px`.
- **Do** cap body text at `65ch` line length for readability.

### Don't

- **Don't** introduce border radius. No pills, no rounded corners, no soft edges. Zero is the only radius.
- **Don't** use soft drop shadows (`box-shadow: 0 4px 6px rgba(0,0,0,0.1)`). Always use hard offset shadows.
- **Don't** use gradient text (`background-clip: text`). Use a single solid color. Emphasis comes from weight and size.
- **Don't** use side-stripe borders (`border-left: 4px solid primary`) as card accents. Use full borders, background tints, or icons.
- **Don't** create identical card grids with "icon + heading + text" repeated endlessly. Vary layout rhythm.
- **Don't** default to modals for secondary actions. Use inline, progressive, or bottom-sheet alternatives first.
- **Don't** use em dashes in copy. Use commas, colons, or periods.
- **Don't** add decorative illustrations or background patterns that don't serve conversion. The subtle grid overlay (`40px linear-gradient` at 10% opacity) is the only background texture allowed.
- **Don't** create nested cards. A card inside a card is always wrong.

---

## Known Inconsistencies

1. **Select component uses `rounded-md`.** Refactor to `rounded-none` for system consistency.
2. **Select uses `border border-input` instead of `border-2 border-black` or `border-3 border-black`.**
3. **Some components hardcode `#000` for shadows while others use `var(--color-border)`** (`#0b0b0b`). Unify to `var(--color-border)` so theme changes propagate.
4. **Starwind CSS config exists but its CSS file is entirely commented out.** The active token system lives in `global.css` only.
5. **Button uses `border-3` while Card uses `border-4` and product cards use `border-2`.** This is intentional hierarchy (buttons = 3px, cards = 4px, cells = 2px), but should be documented in component specs to avoid drift.