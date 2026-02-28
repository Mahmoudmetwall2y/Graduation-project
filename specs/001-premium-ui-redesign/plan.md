# Implementation Plan: Premium UI Redesign

**Branch**: `001-premium-ui-redesign` | **Date**: 2026-02-28 | **Spec**: [spec.md](file:///d:/cardiosense-project/cardiosense/specs/001-premium-ui-redesign/spec.md)
**Input**: Feature specification from `/specs/001-premium-ui-redesign/spec.md`

## Summary

Redesign the AscultiCor frontend to a premium dark-only medical-tech aesthetic with React Three Fiber ambient 3D visuals (dashboard + empty states only), a unified design token system, consistent UI primitives, and polished microinteractions — while preserving all existing routes, workflows, and real-time monitoring.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 18+  
**Primary Dependencies**: Next.js 14, React 18, Tailwind CSS 3.3, Radix UI, Recharts, Supabase, Lucide React, React Three Fiber (NEW), Three.js (NEW)  
**Storage**: Supabase (unchanged)  
**Testing**: `npm run lint`, `npm run build`, manual browser (no test framework in project)  
**Target Platform**: Docker container → web browser (Chrome, Firefox, Edge)  
**Project Type**: Web application (Next.js App Router)  
**Performance Goals**: Dashboard load ≤ 10% regression, 3D lazy-loaded outside critical path  
**Constraints**: Dark-only theme, 3D on dashboard + empty states only, no chart/monitoring changes
**Scale/Scope**: ~15 files modified, 3 new files, 519-line globals.css rewrite

## Constitution Check

*The project constitution is an unfilled template — no gates defined. Proceeding.*

## Project Structure

### Documentation (this feature)

```text
specs/001-premium-ui-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output (complete)
├── data-model.md        # Phase 1 output (complete)
├── quickstart.md        # Phase 1 output (complete)
└── spec.md              # Feature specification
```

### Source Code (repository root)

```text
frontend/
├── src/app/
│   ├── globals.css              # MODIFY — dark-only tokens, new token categories
│   ├── layout.tsx               # MODIFY — remove ThemeProvider toggle dependency
│   ├── page.tsx                 # MODIFY — dashboard restyle + AmbientHeart
│   ├── components/
│   │   ├── Navbar.tsx           # MODIFY — remove theme toggle, apply tokens
│   │   ├── ThemeProvider.tsx    # MODIFY — simplify to dark-only
│   │   ├── ConfirmModal.tsx     # MODIFY — apply design tokens
│   │   ├── Skeleton.tsx         # MODIFY — apply design tokens
│   │   ├── Toast.tsx            # MODIFY — apply design tokens
│   │   ├── error-boundary.tsx   # MODIFY — minimal token application
│   │   └── 3d/                  # NEW directory
│   │       ├── AmbientHeart.tsx # NEW — R3F ambient heart component
│   │       └── FloatingShapes.tsx # NEW — R3F/CSS floating shapes
│   ├── auth/                    # MODIFY — apply tokens to login page
│   ├── devices/page.tsx         # MODIFY — apply tokens
│   ├── patients/page.tsx        # MODIFY — apply tokens
│   ├── sessions/page.tsx        # MODIFY — apply tokens
│   ├── session/[id]/page.tsx    # MODIFY — apply tokens, protect charts
│   ├── alerts/page.tsx          # MODIFY — apply tokens
│   ├── settings/page.tsx        # MODIFY — apply tokens
│   └── admin/page.tsx           # MODIFY — apply tokens
├── tailwind.config.js           # MODIFY — remove darkMode, add tokens
├── package.json                 # MODIFY — add R3F/three.js deps
└── DESIGN.md                    # NEW — design system documentation
```

**Structure Decision**: Existing Next.js App Router structure is preserved. New 3D components go in `components/3d/`. No new routes or pages.

## Implementation Phases

### Phase A: Foundation (Design Tokens + Theme)

**Files**: `globals.css`, `tailwind.config.js`, `ThemeProvider.tsx`, `Navbar.tsx`, `layout.tsx`

1. **globals.css**: Merge `.dark {}` tokens into `:root` (dark values become the only values). Remove light-mode `:root`. Add new token categories: `--motion-*`, `--blur-*`, `--glow-*`, `--elevation-*`. Update component classes to use new tokens.
2. **tailwind.config.js**: Remove `darkMode: ["class"]`. Add new animation keyframes (pulse-glow, float, breathe). Add new color entries for glow tokens.
3. **ThemeProvider.tsx**: Remove toggle logic. Always apply `dark` class. Simplify to a thin wrapper.
4. **Navbar.tsx**: Remove the theme toggle button/icon. Apply new token-based styling to sidebar.
5. **layout.tsx**: No structural changes; just verify it still works with simplified ThemeProvider.

**Test checklist**: App loads in dark mode only, sidebar renders, all routes navigate correctly.

### Phase B: UI Primitives Polish

**Files**: `ConfirmModal.tsx`, `Skeleton.tsx`, `Toast.tsx`, `error-boundary.tsx`

1. Update each component to use design token CSS variables instead of hardcoded colors.
2. Add microinteraction utilities: hover lift, glow on focus, smooth transitions.
3. Ensure all components have visible focus states.

**Test checklist**: Open a modal, trigger a toast, see a skeleton loader — all render with premium dark styling.

### Phase C: Page-by-Page Restyle

**Files**: All page files (dashboard, devices, patients, sessions, session detail, alerts, settings, admin, auth)

1. **Dashboard (`page.tsx`)**: Restyle KPI stat cards with premium card tokens. Upgrade typography hierarchy. Add glow borders. Preserve Recharts integration untouched.
2. **Devices, Patients, Sessions**: Apply card surface tokens, hover animations, typography scale.
3. **Session Detail**: Apply tokens carefully — charts and real-time monitoring must remain unchanged.
4. **Alerts, Settings, Admin**: Apply consistent token styling.
5. **Auth (Login)**: Apply dark-only styling to the login page.

**Test checklist**: Navigate every page, verify premium look, confirm data still loads, test hover effects on cards/buttons, verify charts are unaffected.

### Phase D: 3D Ambient Visuals

**Files**: `package.json`, `components/3d/AmbientHeart.tsx`, `components/3d/FloatingShapes.tsx`, `page.tsx` (dashboard)

1. Install `@react-three/fiber`, `@react-three/drei`, `three`, `@types/three`.
2. Create `AmbientHeart.tsx`: Abstract heart-like 3D form, breathing pulse animation, quality tiers, `prefers-reduced-motion` support, WebGL fallback to SVG.
3. Create `FloatingShapes.tsx`: Slow-drifting organic shapes, parallax, reduced-motion support.
4. Integrate `AmbientHeart` into dashboard header via `dynamic(() => import(...), { ssr: false })`.
5. Add `FloatingShapes` to empty state blocks across pages.

**Test checklist**: Dashboard shows pulsing 3D heart, empty states show floating shapes, enable reduced-motion in OS → animations stop, disable WebGL → SVG fallback renders.

### Phase E: Documentation + Verification

**Files**: `DESIGN.md`

1. Create `DESIGN.md` documenting tokens, typography scale, 3D zones (allowed/forbidden), accessibility behavior, performance strategy.
2. Run `npm run lint` and `npm run build` to verify no regressions.
3. Manual browser test across all routes.
4. Test with `prefers-reduced-motion: reduce`.

**Test checklist**: Build passes, lint passes, all routes work, 3D is lazy-loaded, reduced-motion works, DESIGN.md is comprehensive.

## Risk Areas

| Risk | Mitigation |
|------|-----------|
| R3F bundle size (~150KB gz) | Dynamic import with `ssr: false`; lazy-loaded after page interactive |
| Breaking Recharts styles | Do not touch chart containers; only style surrounding cards |
| ThemeProvider removal ripple | Search all `useTheme()` callsites before removing toggle |
| Tailwind `dark:` prefixes break | After removing darkMode config, search for all `dark:` prefixes in codebase and remove them |
| WebGL unavailable on some clients | SVG fallback renders when WebGL context fails |

## Complexity Tracking

No constitution violations to justify.
