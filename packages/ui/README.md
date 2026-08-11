# @vit/ui — shared Solid UI primitives

Small Solid package extracted from the storefront (`apps/storev2/src/components/ui`,
Kobalte 0.13 + Tailwind v4). Admin and storefront consume the same primitives;
this is one component set, not two.

## What it is

- Kobalte underneath (button, text-field, select, combobox, dialog, dropdown-menu,
  tabs, toast, skeleton). Drawer is Kobalte Dialog styled as a bottom sheet /
  side sheet.
- Tokens from the approved admin prototype (`plans/admin-v2-ui-prototype/index.html`):
  cream canvas, white surfaces, warm ink, butter primary `#f2be22`, status tones
  lavender / apricot / coral / lemon / warm gray. **Status never uses blue or green.**
- Every interactive control: 44px minimum touch target by default, visible
  `:focus-visible` ring, disabled / loading / error states, reduced-motion
  handling (`.ui-enter-*` animations turn off under `prefers-reduced-motion`).
- Form-field semantics: each input family ships label, description and error
  parts wired through Kobalte (aria-describedby, aria-invalid).

## Exports

`Button`, `IconButton`, `Input`, `Field`, `Select`, `Combobox`, `Dialog`,
`Drawer`, `Menu`, `Tabs`, `Toast` (+ `Toaster`, `showToast`, `showToastPromise`),
`Badge`, `Skeleton`, `EmptyState`, `InlineAlert`, `FormSection`.

Also exported: `cn` (clsx + tailwind-merge), `buttonVariants`, `badgeVariants`,
`inlineAlertVariants`, and every part's props type.

## Consuming in an app

```sh
bun add @vit/ui
```

Import the tokens in your app's global CSS (Tailwind v4 required):

```css
@import "@vit/ui/styles.css";
```

Tailwind must scan the package source for utility class names. In the same CSS
file, relative to your app's css file:

```css
@source "../../../packages/ui/src";
```

The `@theme` block in `tokens.css` maps the palette to utilities:
`bg-butter`, `text-ink`, `border-rule`, `shadow-card`, `rounded-ui`, `outline-ring`,
plus `--ui-*` custom properties on `:root` for plain CSS. The admin stage comes
ready-made: apply `.ui-stage` to `<body>` for canvas + warm hue washes + dither
dots + Onest font stack + ink text.

## Usage

```tsx
import { Badge, Button, Field, Input, showToast } from "@vit/ui";

<Button onClick={() => showToast({ title: "Хадгаллаа", variant: "success" })}>
  Хадгалах
</Button>

<Field label="Нэр" error={error()}>
  <Input placeholder="Барааны нэр" />
</Field>

<Badge tone="lavender" icon={<CheckCircleIcon />}>Хүргэлтэд</Badge>
```

See `src/examples/usage-demo.tsx` for a route-free component exercising every
export (it is typechecked with the package but is not part of the public API).

## Design rules (from the prototype + UI skills)

- Butter is the only primary voice; secondaries are surface/ghost. Coral is for
  destructive only.
- Status pills: text + icon, never colour alone.
- Buttons: `rounded-ui` (10px), 48px default height, `active:scale-[0.96]`,
  140ms `--ui-ease-out` transitions, lift shadow only on butter primary.
- Focus ring: 2px `--color-ring` (deep butter), 2px offset.
- Reduced motion: enter animations and the spinner freeze; content appears
  immediately. Static cues never depend on motion.
- Inputs stay at 16px (`text-base`) so iOS does not zoom the page.

## Build / check

```sh
bun run --filter @vit/ui check-types   # tsc --noEmit
bun run --filter @vit/ui build         # tsdown → dist/ (proof artifact)
```

The package is source-exported (like `@vit/shared`): consumers import
`@vit/ui` straight from `src/`; `dist/` is a build proof.

## Integrator notes

- `packages/ui/package.json` is committed. Root `package.json` needs **no** edit
  (the `packages/*` workspaces glob already covers it). Run `bun install` once
  to register the workspace in `bun.lock`.
- Manifest edits for the integrator are captured in
  `plans/admin-v2-patches/ui-manifest.patch`.
