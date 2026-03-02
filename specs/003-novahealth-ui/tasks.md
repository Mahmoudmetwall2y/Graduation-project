---
description: "Task list for NovaHealth UI Restyle implementation"
---

# Tasks: NovaHealth UI Redesign

**Input**: Design documents from `/specs/003-novahealth-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/css-tokens.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Update `frontend/src/app/globals.css` to include the foundational HUD CSS variable tokens defined in the design spec.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core UI primitive components that must exist before the page layouts are constructed.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create the `frontend/src/components/ui/GlassCard.tsx` container primitive utilizing the `--hud-surface-glass` tokens and varying blur elevations.
- [x] T003 Create the `frontend/src/components/ui/StatusChip.tsx` component supporting the neon OK/Monitoring/Warning/Critical states.
- [x] T004 Create the `frontend/src/components/ui/MetricTile.tsx` component.
- [x] T005 Create the dark-themed tabular row elements in `frontend/src/components/ui/DataListRows.tsx`.

**Checkpoint**: Foundation ready ✅

---

## Phase 3: User Story 1 - Live Session Monitoring (Priority: P1) 🎯 MVP

**Goal**: Deliver the high-contrast dashboard with the central Cardiac Hero and the 6 peripheral ambient metric strips.

### Implementation for User Story 1

- [x] T006 [US1] Create the ambient animation hero component at `frontend/src/components/ui/CardiacVisualization.tsx` using a lightweight SVG looping approach.
- [x] T007 [US1] Refactor `frontend/src/app/page.tsx` layout into the 12-col HUD grid.
- [x] T008 [US1] Replace the 6 top structural metric cards inside `frontend/src/app/page.tsx` utilizing `MetricTile` and `GlassCard`.
- [x] T009 [US1] Refactor the "Recent Sessions" and "Session Overview" lists on `frontend/src/app/page.tsx` utilizing `DataListRows` and `StatusChip`.

**Checkpoint**: User Story 1 fully functional ✅

---

## Phase 4: User Story 2 - Navigation and Information Architecture (Priority: P2)

**Goal**: Seamlessly transition users between routes using the new pill-style TopBar and the neon-collapsed Sidebar.

### Implementation for User Story 2

- [x] T010 [US2] Create `frontend/src/components/layout/TopBar.tsx` encapsulating the top pill-tab navigation design.
- [x] T011 [US2] Refactor `frontend/src/app/components/Navbar.tsx` to include icon-left grouped items with cyan glowing active states.
- [x] T012 [US2] Refactor `frontend/src/app/layout.tsx` to inject the updated `Sidebar` and new `TopBar` into the global `AppShellHUD` layout wrapper.

**Checkpoint**: Navigation flows complete ✅

---

## Phase 5: User Story 3 - Accessible Motion and Visuals (Priority: P3)

**Goal**: Safely respect users with accessibility boundaries without compromising the ambient HUD aesthetic.

### Implementation for User Story 3

- [x] T013 [US3] Ensure `frontend/src/app/globals.css` keyframe animations are wrapped in a `@media (prefers-reduced-motion: reduce)` boundary.
- [x] T014 [US3] Audit `frontend/src/components/ui/CardiacVisualization.tsx` to ensure `animate-none` fallbacks exist for the motion-safe context.

**Checkpoint**: Accessibility complete ✅

---

## Phase 6: Polish & Page Propagations

**Purpose**: Propagating the approved UI layout iteratively throughout the secondary dashboard views.

- [x] T015 [P] Apply Glass UI wrappers to `frontend/src/app/patients/page.tsx`.
- [x] T016 [P] Apply Glass UI wrappers and `StatusChip` to `frontend/src/app/devices/page.tsx`.
- [x] T017 [P] Apply UI to `frontend/src/app/sessions/page.tsx`.
- [x] T018 [P] Apply UI to `frontend/src/app/alerts/page.tsx`.
- [x] T019 Run local build verification check in the UI `frontend/` layer using `npm run build`.

**Build Result**: ✅ Exit code 0 — All 16 pages compiled successfully.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: ✅ Complete.
- **Foundational (Phase 2)**: ✅ Complete.
- **User Stories (Phase 3+)**: ✅ Complete.
- **Polish (Final Phase)**: ✅ Complete. Build verified.
