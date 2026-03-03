# Phase 0 Research: NovaHealth UI Architecture

## Research Topic: Best Practices for Continuous Ambient Animations in Next.js (Hero Visualization)

**Context:** The spec demands a central "Cardiac HUD Visualization" running on a continuous, purely aesthetic loop that does not attempt to bind to live telemetry datastreams. It must respect `prefers-reduced-motion` and stay highly performant (avoiding main-thread blocking).

### Decision: 2D Canvas/SVG Hybrid with React Refs
We will build `CardiacVisualization.tsx` as a purely client-side component (`'use client'`) relying on CSS keyframes for scanlines and a lightweight SVG wireframe for the heart. 

### Rationale:
1.  **Performance overhead:** Importing `react-three-fiber` and 3D models exclusively for a background asset violates the lightweight constraint.
2.  **Hydration:** Rendering an SVG guarantees instant paint time on load without waiting for complex WebGL contexts to initialize.
3.  **Accessibility:** CSS animations can be trivially paused and hidden using Tailwind's `motion-reduce:animate-none` utility classes compared to writing custom Javascript requestAnimationFrame teardowns.

### Alternatives considered:
*   **Three.js / React-Three-Fiber**: Rejected due to high bundle size overhead and potential performance degradation on lower-end medical tablets/phones just for an ambient background.
*   **Lottie Files**: Rejcted because they are notoriously difficult to dynamically re-style with CSS variable tokens (e.g. changing the neon cyan glow hue based on themes).

---

## Research Topic: Tailwind CSS vs. CSS Modules for Glassmorphism Tokens

**Context:** We must establish `--hud-bg-base`, `hud-surface-glass`, `hud-border`, etc.

### Decision: Global CSS Variables exposed via Tailwind arbitrary values
We will map native CSS variables in `globals.css` to the `:root` pseudo-class.

### Rationale:
Provides maximum flexibility. We can do `bg-[var(--hud-surface-glass)]` in Tailwind or configure `tailwind.config.ts` while allowing standard CSS classes (like `.glass-card`) to leverage the raw variables for complex, multi-layered box-shadows.

### Alternatives considered:
*   **CSS Modules**: Rejected because the project is already heavily anchored in global Tailwind utility classes.
*   **Strict Tailwind Config extensions**: Difficult to share complex layered glassmorphism definitions purely through `tailwind.config.ts` without making the class strings unreadable.
