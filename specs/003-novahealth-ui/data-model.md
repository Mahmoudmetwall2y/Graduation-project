# Data Model & Components: NovaHealth UI

This document outlines the UI component entities required for the HUD layout. Since this is purely a presentation-layer overhaul, it models React components rather than database schemas.

## Core UI Entities

### 1. The Global Shell (`AppShellHUD`)

*   **Description**: Wraps the entire Next.js application dictating the screen bounds and the ambient background.
*   **Properties**:
    *   `sidebarExpanded?`: boolean (controls navigation drawer width)
    *   `motionEnabled?`: boolean (inherits from `prefers-reduced-motion`)
*   **Behavior**: Contains the starfield/particle background layer. Pins the `TopBar` to the top edge and the `Sidebar` to the left edge. Renders `children` in a central scrollable frame.

### 2. Glass Container (`GlassCard`)

*   **Description**: The foundational primitive for all dashboard widgets.
*   **Properties**:
    *   `elevation?`: 1 | 2 | 3 (determines blur intensity and shadow drop)
    *   `glowVariant?`: 'primary' | 'secondary' | 'warning' | 'critical' (dictates border highlight)
    *   `className?`: string (for layout overrides)
*   **Behavior**: Applies `var(--hud-surface-glass)` styling with `backdrop-filter: blur()`.

### 3. Dashboard Tile (`MetricTile`)

*   **Description**: A standardized display unit for high-level numbers (Active Sessions, Total Devices).
*   **Properties**:
    *   `title`: string
    *   `value`: number | string
    *   `subtitle?`: string
    *   `status?`: 'ok' | 'attention' | 'critical'
    *   `icon?`: ReactNode
*   **Relationships**: Wraps itself in a `GlassCard`. Can optionally embed a `StatusChip`.

### 4. Categorized Status Indicator (`StatusChip`)

*   **Description**: A small pill displaying system state (e.g. 'Connected', 'Monitoring', 'Offline').
*   **Properties**:
    *   `type`: 'ok' | 'monitoring' | 'warning' | 'critical'
    *   `label`: string
*   **Behavior**: Adopts the defined neon colors (cyan/teal, violet, amber, red).

### 5. Ambient Hero (`CardiacVisualization`)

*   **Description**: The central anatomical wireframe figure.
*   **Properties**:
    *   `isScanning?`: boolean (adds CSS pulse layer over the SVG)
    *   `qualityMetric?`: number (% representing signal integrity placeholder)
*   **Behavior**: Non-blocking. Executes CSS transformations continuously unless restricted by reduced motion.
