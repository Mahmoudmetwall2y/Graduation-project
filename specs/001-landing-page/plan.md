# Implementation Plan: Landing Page Redesign

**Branch**: `001-landing-page` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-landing-page/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Create a new animated, polished landing page at `/` utilizing the existing Next.js 14 and Tailwind setup, strictly adhering to the current HUD/glass design tokens (`globals.css`) and reusing the `HeartVisualization3D` component. Simultaneously, relocate the existing dashboard implementation from `/` to the `/dashboard` route without functional changes.

## Technical Context

**Language/Version**: TypeScript / React 18  
**Primary Dependencies**: Next.js 14 (App Router), Tailwind CSS, lucide-react, react-three-fiber  
**Storage**: Supabase (Existing, no changes required for UI redesign)  
**Testing**: Manual Visual Verification / Lighthouse Accessibility Tooling  
**Target Platform**: Web Browsers (Mobile/Desktop responsive)  
**Project Type**: web-application  
**Performance Goals**: 60fps animations for 3D/CSS transitions, Fast root page load (LCP)  
**Constraints**: **NO new animation libraries** (e.g., framer-motion forbidden), use existing CSS animations (`fadeIn`, `slideUp`, `shimmer`), exact color tokens from HUD design system. Accessibility: reduced-motion support.  
**Scale/Scope**: 2 main route files, potentially 1-2 new UI component files.  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **UI Implementation**: Ensures visual consistency and performance without bloating dependencies.
- **Simplicity / YAGNI**: No new libraries introduced. Heavy reuse of existing CSS and 3D components.

*Status: **PASSED**.*

## Project Structure

### Documentation (this feature)

```text
specs/001-landing-page/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command) (Empty, N/A)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx (NEW: Landing Page)
│   │   └── dashboard/
│   │       └── page.tsx (MOVED: Existing root page to here)
│   └── components/
│       └── landing/ (OPTIONAL: Subcomponents for Hero, Features, Architecture if needed for clean code)
```

**Structure Decision**: Web application structure. The primary application is Next.js. We are introducing a new root route and moving the existing dashboard down one level.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations.*
