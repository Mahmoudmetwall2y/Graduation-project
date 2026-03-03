# Quickstart: NovaHealth UI Design System

This guide explains how to leverage the new HUD aesthetic within the AscultiCor application.

## Core Tokens

The design system relies on a central palette of CSS variables defined in `/frontend/src/app/globals.css`. Do not hardcode standard Tailwind colors (like `bg-red-500`) for primary surfaces. 

Instead, use the HUD specific variables:

### Backgrounds & Surfaces
*   `--hud-bg-base`: The deep cosmic space background.
*   `--hud-surface-glass`: Translucent panel backgrounds (use with backdrop blur).

### Accents & Neon
*   `--hud-accent-cyan`: Primary interactive color (buttons, active tabs, OK status).
*   `--hud-accent-violet`: Secondary thematic color (ambient glows).
*   `--hud-warning-amber`: Needs attention.
*   `--hud-critical-red`: Errors, offline equipment.
*   `--hud-border`: Thin, low-opacity strokes delineating structure.

## Building a New Metric Card

To create a new panel on the dashboard that matches the design architecture:

```tsx
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricTile } from '@/components/ui/MetricTile';

export function ActivePatientCount({ count }) {
  return (
    <GlassCard glowVariant="primary">
      <MetricTile 
        title="Active Patients"
        value={count}
        subtitle="Monitored in last 24h"
        status="ok"
      />
    </GlassCard>
  );
}
```

## Typography Hierarchy

*   **Headers**: Use glowing `.gradient-text` for page titles.
*   **Data Points**: The `MetricTile` uses large, high-contrast text for the primary numerical `value` to ensure quick scanning, leaving the `title` slightly dimmer/smaller for taxonomy.
