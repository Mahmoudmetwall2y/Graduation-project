# CSS Contracts: NovaHealth UI

This document dictates the interface contracts between the top-level `globals.css` style tokens and the individual React UI components.

## Target Platform: Browser CSS Variables

To achieve the HUD visual hierarchy, React components **MUST NOT** override primary structural visual configurations through hardcoded RGB/HEX values. They **MUST** consume dynamic CSS variables mapped at the `:root` level. 

### The Token Contract

1.  **Background Elements** will subscribe to `var(--hud-bg-base)`. Backgrounds must utilize solid opacity except when intentionally overlaying interactive starfields/particles.
2.  **Translucent Panels** will subscribe to `var(--hud-surface-glass)`. Any component acting as a structural container (like `<GlassCard>`) must apply an explicit backdrop-filter blur mapping to `blur-md` (12px) or `blur-lg` (16px) class configurations in Tailwind alongside a standard 1px `var(--hud-border)`.
3.  **Alerting & States** (`StatusChip`, `HUDButton`) will bind strictly to:
    *   `var(--hud-accent-cyan)`
    *   `var(--hud-accent-violet)`
    *   `var(--hud-warning-amber)`
    *   `var(--hud-critical-red)`

## Violations
Using standard `.bg-blue-500` or `#FF0000` text inside a foundational primitive like `MetricCard` breaks the contract. Colors must be inherited organically utilizing `text-[var(--hud-accent-cyan)]` or similarly mapped Tailwind classes.
