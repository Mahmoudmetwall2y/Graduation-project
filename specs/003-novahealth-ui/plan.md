# Implementation Plan: NovaHealth UI Redesign

**Branch**: `003-novahealth-ui` | **Date**: 2026-03-01 | **Spec**: [specs/003-novahealth-ui/spec.md](file:///d:/cardiosense-project/cardiosense/specs/003-novahealth-ui/spec.md)
**Input**: Feature specification from `/specs/003-novahealth-ui/spec.md`

## Summary

This feature comprehensively overhauls the AscultiCor UI (Next.js Application) to match the "NovaHealth" HUD aesthetic. It incorporates a dark cosmic theme, translucent glass panels, neon accent borders, and a central anatomical visualization while strictly preserving the existing page routing, dashboard semantics, and backend data capabilities. 

## Technical Context

**Language/Version**: TypeScript / Node.js
**Primary Dependencies**: Next.js (App Router), React, Tailwind CSS, Recharts, Lucide React
**Storage**: N/A (UI-layer refactor only; depends on existing Supabase backend)
**Testing**: Local Next.js build verification (`npm run build`)
**Target Platform**: Desktop, Mobile, and Tablet Browsers
**Project Type**: Next.js Web Application
**Performance Goals**: 60fps animations; zero render blocking on the main HUD hero
**Constraints**: Zero breaking backend/state changes; Must respect `prefers-reduced-motion`; Must meet WCAG AA contrast (4.5:1) for glass accents.
**Scale/Scope**: ~15 UI components affected; ~5 core page routes completely visually overhauled.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Zero Breaking Changes**: PASS. All API integrations and backend bindings remain untouched.
- **Component Reusability**: PASS. Architecture relies heavily on scalable `GlassCard` and `StatusChip` primitives.

## Project Structure

### Documentation (this feature)

```text
specs/003-novahealth-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 design modeling
├── quickstart.md        # Instructions for the user
└── contracts/           # CSS boundary contracts
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── app/
│   │   ├── globals.css              # Core Design Tokens
│   │   ├── layout.tsx               # AppShellHUD + TopBar
│   │   ├── page.tsx                 # 12-col Dashboard Grid
│   │   ├── patients/page.tsx
│   │   ├── devices/page.tsx
│   │   ├── sessions/page.tsx
│   │   └── alerts/page.tsx
│   └── components/
│       ├── layout/
│       │   ├── Sidebar.tsx
│       │   └── TopBar.tsx           # NEW contextual pill nav
│       └── ui/
│           ├── GlassCard.tsx        # Base Container
│           ├── HUDButton.tsx        # Neon interactions
│           ├── StatusChip.tsx       # State indicator
│           ├── MetricTile.tsx       # Dashboard Stat
│           ├── DataListRows.tsx     # Session Table Override
│           └── CardiacVisualization.tsx # Center Hero Panel
```

**Structure Decision**: Selected the Web Application (Frontend) structure, mapping directly onto the Next.js `app` and `components` directories already established in AscultiCor. 

## Complexity Tracking

There are no constitution violations or egregious complexities. The CSS variable token architecture ensures global style scaling without bloat.
