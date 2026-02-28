# Data Model: Premium UI Redesign

**Branch**: `001-premium-ui-redesign` | **Date**: 2026-02-28

> This feature does not introduce or modify database entities, API contracts, or persistent data models. The redesign is purely a frontend visual layer change. This document describes the **design token schema** and **component data structures** that constitute the "model" for this feature.

## Design Token Schema

Tokens are CSS custom properties defined in `globals.css` `:root`, consumed via Tailwind theme extension.

### Color Tokens

| Token | Purpose | Format |
|-------|---------|--------|
| `--background` | Page background | HSL |
| `--foreground` | Default text | HSL |
| `--card` | Card surface | HSL |
| `--card-foreground` | Card text | HSL |
| `--primary` | Brand action color (teal) | HSL |
| `--destructive` | Danger/delete actions | HSL |
| `--muted` | Subdued backgrounds | HSL |
| `--muted-foreground` | Secondary text | HSL |
| `--border` | Default border | HSL |
| `--ring` | Focus ring | HSL |
| `--glow-primary` | Hover/focus glow (teal) | HSL+alpha |
| `--glow-accent` | Accent glow (blue) | HSL+alpha |
| `--glow-danger` | Danger glow (red) | HSL+alpha |

### Elevation Tokens

| Token | Usage |
|-------|-------|
| `--shadow-soft` | Subtle element shadow |
| `--shadow-card` | Card surface shadow |
| `--shadow-elevated` | Modal/dropdown shadow |
| `--shadow-glow` | Glow effect shadow |

### Motion Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--motion-duration-fast` | 150ms | Button press, hover |
| `--motion-duration-normal` | 250ms | Card transitions, tabs |
| `--motion-duration-slow` | 400ms | Modal open/close, page transitions |
| `--motion-easing-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | Bounce effects |
| `--motion-easing-smooth` | cubic-bezier(0.4, 0, 0.2, 1) | Standard transitions |

### Blur Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--blur-glass` | 16px | Glass card backdrop |
| `--blur-heavy` | 32px | Modal overlay |
| `--blur-subtle` | 8px | Dropdown hover |

## Component State Model: AmbientHeart

```
Props:
  qualityTier: 'low' | 'medium' | 'high' (default: 'medium')

Internal State:
  isReducedMotion: boolean (from prefers-reduced-motion media query)
  isWebGLAvailable: boolean (from renderer capability test)

Behavior:
  if (!isWebGLAvailable) → render static SVG fallback
  if (isReducedMotion) → render static 3D frame (no animation)
  else → render animated R3F scene with breathing pulse

Placement: Dashboard header only (z-index: 0, pointer-events: none)
```

## Component State Model: FloatingShapes

```
Props:
  density: number (default: 5, max: 12)

Internal State:
  isReducedMotion: boolean

Behavior:
  if (isReducedMotion) → render static positioned shapes
  else → render slow-drifting shapes with parallax

Placement: Empty state screens only (absolute positioned, pointer-events: none)
```

## UI Primitive Variants

| Primitive | Variants | Sizes | States |
|-----------|----------|-------|--------|
| Button | primary, secondary, danger, ghost, outline | sm, md, lg | default, hover, pressed, focus, disabled |
| Card | default, elevated, glass | — | default, hover |
| Badge | success, warning, danger, info, neutral | sm, md | — |
| Tabs | default | — | active, inactive, hover |
| Modal | default | sm, md, lg | open, closing |
| Toast | success, error, warning, info | — | entering, visible, exiting |
| Skeleton | default | — | loading |
| EmptyState | default (with optional FloatingShapes) | — | — |
