# Research: Premium UI Redesign

**Branch**: `001-premium-ui-redesign` | **Date**: 2026-02-28

## R1: React Three Fiber for Decorative 3D

**Decision**: Use `@react-three/fiber` + `@react-three/drei` for the AmbientHeart and FloatingShapes components.

**Rationale**: User explicitly chose Option A (real WebGL 3D) for richer visual depth. R3F integrates natively with React's component model, supports `Suspense` for lazy-loading, and provides declarative scene composition.

**Alternatives considered**:
- CSS/SVG faux-3D: lightweight but limited to flat gradients/blur; insufficient for authentic 3D heart geometry
- Hybrid (CSS default + R3F behind flag): adds complexity without clear benefit if R3F is always desired

**Implementation notes**:
- Dynamic import: `const AmbientHeart = dynamic(() => import('./AmbientHeart'), { ssr: false })`
- Bundle: R3F + three.js adds ~150KB gzipped. Since it's lazy-loaded and only used on dashboard + empty states, this won't affect initial page load.
- Fallback: If WebGL is unavailable, render a static SVG gradient orb.
- `prefers-reduced-motion`: pause all animation, render static geometry frame.

## R2: Dark-Only Theme Strategy

**Decision**: Remove light mode entirely. Design around a single dark medical-tech aesthetic.

**Rationale**: User chose Option B. A single theme simplifies the token layer, eliminates dual-palette maintenance, and lets the 3D visuals (glow, bloom) look their best on dark backgrounds.

**Alternatives considered**:
- Keep both (A): doubles token definitions, increases testing surface
- Dark-first with light fallback (C): still requires maintaining two palettes

**Implementation notes**:
- `ThemeProvider.tsx`: Simplify to always apply `dark` class. Remove toggle logic. Keep the provider for potential future re-introduction.
- `globals.css`: Merge the `.dark {}` block into `:root` and remove the light-mode `:root` tokens. Remove all `.dark .class` overrides (use the dark values as defaults).
- `tailwind.config.js`: Remove `darkMode: ["class"]` (no longer needed since there's only one theme).
- `Navbar.tsx`: Remove the theme toggle button.

## R3: 3D Placement — Dashboard + Empty States Only

**Decision**: AmbientHeart appears only in the dashboard header. FloatingShapes appears only on empty state screens.

**Rationale**: User chose Option B. Limiting 3D to high-visual-impact zones prevents visual fatigue on data-dense pages and limits GPU usage.

**Alternatives considered**:
- Every page (A): visual fatigue, GPU overhead
- Dashboard + Patients + Devices (C): still adds GPU work on list pages

**Implementation notes**:
- Dashboard (`page.tsx`): Add `<AmbientHeart />` to the header section, positioned absolutely behind the title.
- Empty states: Wrap each page's empty state block with `<FloatingShapes />` as a background.
- No 3D on: Patients list, Devices list, Sessions list, Alerts, Settings, Session detail, Admin.

## R4: Design Token Architecture

**Decision**: Consolidate all design tokens into a single `:root` block in `globals.css` using CSS custom properties (HSL format). Extend Tailwind theme to consume these tokens.

**Rationale**: The existing codebase already uses this pattern (shadcn-style HSL tokens mapped to Tailwind). We just need to:
1. Collapse light+dark into dark-only `:root`
2. Add new token categories: elevation, blur, motion, spacing scale
3. Ensure every component class uses tokens, never hardcoded values

**New token categories to add**:
- `--elevation-*`: card, modal, dropdown, toast (shadow + border combo)
- `--blur-*`: glass, heavy, subtle
- `--motion-*`: duration-fast (150ms), duration-normal (250ms), duration-slow (400ms), easing-spring, easing-smooth
- `--space-*`: section, card-padding, header-gap (using existing Tailwind spacing where possible)
- `--glow-*`: primary, accent, danger (for hover/focus glows)

## R5: Existing Component Inventory (Files to Touch)

| Component | File | Impact |
|-----------|------|--------|
| App Shell | `layout.tsx` | Remove ThemeProvider toggle, keep structure |
| Navbar/Sidebar | `components/Navbar.tsx` | Remove theme toggle, apply new tokens |
| ThemeProvider | `components/ThemeProvider.tsx` | Simplify to dark-only |
| ConfirmModal | `components/ConfirmModal.tsx` | Apply new card tokens |
| Skeleton | `components/Skeleton.tsx` | Apply new skeleton shimmer tokens |
| Toast | `components/Toast.tsx` | Apply new toast tokens |
| ErrorBoundary | `components/error-boundary.tsx` | Minimal — apply tokens |
| Dashboard | `page.tsx` | Major — add AmbientHeart, restyle KPI cards |
| Devices | `devices/page.tsx` | Apply tokens, restyle cards |
| Patients | `patients/page.tsx` | Apply tokens, restyle cards |
| Sessions | `sessions/page.tsx` | Apply tokens, restyle list |
| Session Detail | `session/[id]/page.tsx` | Apply tokens, protect charts |
| Alerts | `alerts/page.tsx` | Apply tokens |
| Settings | `settings/page.tsx` | Apply tokens |
| Admin | `admin/page.tsx` | Apply tokens |
| Login | `auth/login/page.tsx` | Apply tokens |
| Global Styles | `globals.css` | Major — collapse to dark-only, add tokens |
| Tailwind Config | `tailwind.config.js` | Remove darkMode, add new color/animation entries |
| **NEW** AmbientHeart | `components/3d/AmbientHeart.tsx` | New R3F component |
| **NEW** FloatingShapes | `components/3d/FloatingShapes.tsx` | New R3F/CSS component |
| **NEW** DESIGN.md | `DESIGN.md` | Documentation |
