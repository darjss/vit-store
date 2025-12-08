# Neobrutalist Design Guidelines

This document serves as the source of truth for the VitStore aesthetic. Follow these guidelines strictly to maintain the cohesive, high-energy Neobrutalist look.

## Core Philosophy

**"Raw, Bold, and Unapologetic."**

Our design rejects the soft, polished, "premium" look of standard e-commerce sites. We embrace high contrast, hard edges, and a sense of organized chaos. It should feel like a digital zine or a brutalist poster come to life.

### The Golden Rules
1.  **No Softness**: Banish all `rounded-lg`, `shadow-sm`, and soft gradients. Everything must be sharp (`rounded-none`) and hard.
2.  **High Contrast**: Text is always absolute black (`text-foreground`) on white or absolute white on black.
3.  **Borders Everywhere**: Elements don't just float; they are contained. Use `border-2` or `border-4` with `border-border` (black) to define space.
4.  **Mobile First & Thumb-Friendly**: On mobile, we scroll **horizontally** for collections. Vertical space is precious.

## Design Tokens & Usage

### Colors
Do not use hex codes. Use the semantic Tailwind classes.
-   **`bg-background` / `text-foreground`**: The canvas. Stark white and stark black.
-   **`bg-primary`**: The "Pop". Use for main actions (CTAs), highlights, and active states.
-   **`bg-secondary`**: The "Anchor". Use for solid black blocks or inverted sections.
-   **`bg-muted`**: The "Subtle". Use for secondary backgrounds to add depth without breaking the high-contrast rule.

### Typography
-   **Headings**: Must be **UPPERCASE**, **Black Weight** (`font-black`), and **Tight** (`tracking-tighter`). They should feel like they are shouting.
-   **Body**: Keep it legible but bold. Use `font-medium` or `font-bold` more often than `font-normal`.

### Shadows & Depth
We use "Hard Shadows" to create a sticker-like or pop-out effect.
-   **Default**: `shadow-hard` (The go-to for cards and buttons).
-   **Interaction**: On hover, move the element *up* (`-translate-y-1`) to increase the shadow gap. On click, remove the shadow and translate *down* to simulate a physical button press.

## Component Guidelines

### 1. Buttons & CTAs
*   **Do**: Use `border-2`, `uppercase`, `font-bold`, and `shadow-hard`.
*   **Do**: Make them look like physical blocks.
*   **Don't**: Use subtle hover states. The hover should be a physical movement or a sharp color swap (e.g., White -> Primary).

### 2. Cards (Products, Categories)
*   **Do**: Enclose content in a hard border.
*   **Do**: Use `bg-card` (white) as the base.
*   **Do**: On hover, reveal a `bg-primary` layer or a pattern underneath/behind the content.
*   **Don't**: Let images float without a border. Even images get a border.

### 3. Layouts
*   **Mobile**: **Horizontal Scroll is King.**
    *   Use `flex overflow-x-auto snap-x` for lists of items (categories, products).
    *   This preserves vertical flow and feels app-like.
*   **Desktop**: **Bento Grids.**
    *   Use CSS Grid to create dense, magazine-like layouts.
    *   Vary cell sizes (`col-span-2`, `row-span-2`) to break monotony.

### 4. Motion & Interaction
*   **Marquees**: Use them to create constant kinetic energy. They frame sections and announce promos.
*   **Wiggle & Float**: Use `.animate-wiggle` or `.animate-float` on decorative elements (stickers, badges) to make the page feel "alive".
*   **Hover**: Every interactive element must react instantly and visibly.

## "The Vibe Check"
Before finalizing a component, ask:
*   *Is it bold enough?*
*   *Are the borders thick enough?*
*   *Did I accidentally use a pastel color? (If yes, remove it).*
*   *Does it look good on a phone?*
