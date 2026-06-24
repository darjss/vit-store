# Temp Design Doc — AI Video Filter Control UI

## Overview

A comic / pop-art styled control dashboard for a real-time AI video filter app. Heavy black outlines, high-contrast yellow accents, and chunky offset shadows give it a playful, toy-like feel.

---

## Design System

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | White (#ffffff) | Panel / input backgrounds |
| `--primary` | Bright yellow (#FFC107) | Active states, primary CTAs, highlights |
| `--primary-light` | Pale yellow (#FFE082) | Disabled / inactive primary buttons |
| `--ink` | Near-black (#111111) | Text, borders, shadows |
| `--shadow-offset` | Yellow (#FFC107) | Hard offset shadow layer |
| `--panel-shadow` | Black (#111111) | Top-right/bottom hard shadow |

### Typography

- Font: A rounded, bold sans-serif (suggest **Fredoka**, **Nunito Black**, or **Comic Neue Bold**).
- All-caps labels for section headers (`FILTER`, `CONTROLS`).
- Sentence-case for controls and buttons (`Start AI`, `Stop AI`).
- Monospace or slab-serif for numeric readouts (`60 fps`, `2.3`, `35`).

### Shape & Layout

- Thick black borders: ~2–3px solid.
- Slight rounded corners: ~4–6px for buttons, inputs, panels.
- Hard offset shadow: panels and buttons have a 4–6px offset shadow in yellow or black, creating a 2.5D sticker look.
- Generous padding inside panels and buttons.

---

## Screen 1 — Camera Control Bar

A compact horizontal toolbar across the top of the viewport.

```
[ 60 fps ]  CAMERA  [ Live Streamer CAP 4K (07ca:1113) ▼ ]  [ ] Finger frame  [ ] Wipe away  [✓] Split screen  [ Snapshot ]
```

### Elements

| Element | Type | State |
|---------|------|-------|
| `60 fps` | Badge / pill | Static indicator |
| `CAMERA` | Label | Plain text, bold uppercase |
| `Live Streamer CAP 4K (07ca:1113)` | Dropdown | Single-select, shows active camera |
| `Finger frame` | Checkbox | Unchecked |
| `Wipe away` | Checkbox | Unchecked |
| `Split screen` | Checkbox | **Checked**, filled yellow with checkmark |
| `Snapshot` | Button | **Primary**, yellow fill, black border |

### Notes
- Dropdown and inputs share the same thick black border.
- Checked items use a yellow-filled box with a dark checkmark.
- `Snapshot` is the primary action and should trigger a still-image capture.

---

## Screen 2 — Filter & Controls Panel

Two side-by-side cards on a white background.

---

### Left Card — FILTER

**Header:** small yellow square + `FILTER` (bold uppercase).

**Top actions:**

| Button | Style | Purpose |
|--------|-------|---------|
| `Start AI` | Pale yellow fill, black border | Begin AI processing |
| `Stop AI` | Bright yellow fill, black border | Halt AI processing |

**Style grid:** 3-column button grid of one-click filter presets.

```
[ Play-Doh ]   [ The Simpsons ]*  [ Toy Story ]
[ LEGO ]       [ Bodybuilder ]    [ X-Ray ]
[ Oil Painting][ Watercolor ]     [ Cyberpunk ]
[ Claymation ] [ Woman ]
```

- `The Simpsons` is the **selected** preset: bright yellow fill.
- All other presets are white fill with black border.
- Clicking a preset toggles the active style.

---

### Right Card — CONTROLS

**Header:** small yellow square + `CONTROLS`.

| Control | Type | Default | Range / Notes |
|---------|------|---------|---------------|
| `Prompt` | Text input with bullet prefix | Empty | Free-text prompt field |
| `Steps` | Slider + numeric badge | `3` | Integer |
| `Feedback` | Slider + numeric badge | `1` | Integer |
| `Schedule Mu` | Slider + numeric badge | `2.3` | Float |
| `Seed` | Slider + numeric badge | `35` | Integer |
| `Send interval (ms)` | Slider + numeric badge | `120` | Integer, milliseconds |
| `Auto-stop (s, 0 = never)` | Slider + numeric badge | `0` | Integer, seconds; `0` disables auto-stop |

#### Slider Spec

- Track: light gray fill.
- Active/filled portion: solid black.
- Thumb: solid black circle.
- Current value shown in a small yellow badge to the right.

---

## Behavior Notes

- `Start AI` / `Stop AI` should reflect processing state; disable or dim the opposite button while active if appropriate.
- Style presets in the grid should show a single active selection (radio behavior).
- `Split screen` likely compares original vs. filtered feed.
- `Snapshot` should save the current frame.
- Sliders update numerical badges in real time.

---

## Assets to Produce

1. Custom checkbox with thick border, yellow checked state.
2. Custom slider: gray track, black fill, black thumb, yellow value badge.
3. Thick-outline dropdown with a small chevron icon.
4. Yellow sticker-style primary button component.
5. White outline secondary button component.

---

## Open Questions

- What font is actually in use? (Fallback: Fredoka / Nunito.)
- Should `Stop AI` be disabled when not running?
- Is `Schedule Mu` a typo for `Scheduler Mu` / `CFG`? Confirm domain naming.
- Do prompts accept plain text or structured tags?
