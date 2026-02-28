# Tasks: Premium UI Redesign with Ambient 3D Visuals

**Input**: Design documents from `/specs/001-premium-ui-redesign/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Tests**: No test framework in project — verification is via `npm run lint`, `npm run build`, and manual browser checks.

**Organization**: Tasks grouped by user story. US1 (Visual Upgrade) and US3 (Design System) are combined as P1 foundation. US2 (3D Visuals), US4 (Accessibility), US5 (Performance) follow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths relative to `frontend/src/app/`

---

## Phase 1: Setup

**Purpose**: Install new dependencies and prepare project structure

- [x] T001 Install React Three Fiber dependencies: `npm install @react-three/fiber @react-three/drei three` and `npm install -D @types/three` in `frontend/`
- [x] T002 [P] Create `frontend/src/app/components/3d/` directory for 3D components
- [x] T003 [P] Create `frontend/DESIGN.md` skeleton with section headings (Tokens, Typography, 3D Zones, Accessibility, Performance)

---

## Phase 2: Foundational — Dark-Only Token System

**Purpose**: Collapse light/dark tokens to dark-only and extend the design token layer. MUST complete before any page restyling.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Merge `.dark {}` token block into `:root` in `frontend/src/app/globals.css` — dark values become the only values. Remove the light-mode `:root` color tokens. Keep `:root` font and gradient tokens.
- [x] T005 Add new token categories to `:root` in `frontend/src/app/globals.css`: `--motion-duration-fast` (150ms), `--motion-duration-normal` (250ms), `--motion-duration-slow` (400ms), `--motion-easing-spring`, `--motion-easing-smooth`, `--blur-glass` (16px), `--blur-heavy` (32px), `--blur-subtle` (8px), `--glow-primary`, `--glow-accent`, `--glow-danger`
- [x] T006 Remove all `.dark .class-name` overrides in `frontend/src/app/globals.css` — fold dark-specific styles into the base class definitions
- [x] T007 Update `frontend/tailwind.config.js`: remove `darkMode: ["class"]`, add new keyframes (`pulse-glow`, `float`, `breathe`), add new animation entries, add glow color tokens
- [x] T008 Simplify `frontend/src/app/components/ThemeProvider.tsx` to always apply `dark` class, remove toggle logic, keep provider wrapper for future extensibility
- [x] T009 Remove theme toggle button/icon from `frontend/src/app/components/Navbar.tsx` — search for `useTheme` and `toggleTheme` references and remove the toggle UI element
- [x] T010 Search all files for `dark:` Tailwind prefix usage — remove all `dark:` prefixes since dark is now the only mode (use the non-prefixed class instead)
- [x] T011 Run `npm run lint` and `npm run build` in `frontend/` to verify foundation compiles

**Checkpoint**: App renders in dark-only mode, no theme toggle visible, all tokens consolidated. Build passes.

---

## Phase 3: User Story 1+3 — Premium Visual Upgrade + Design System (Priority: P1) 🎯 MVP

**Goal**: Clinicians see an immediately noticeable premium visual upgrade. All UI primitives use the shared design token layer consistently.

**Independent Test**: Navigate every section (Dashboard, Patients, Devices, Sessions, Alerts, Settings). Visual upgrade is obvious. All data loads. Hover effects are smooth and consistent.

### Shared Primitives

- [x] T012 In `globals.css`, enhance/add shared `.premium-card` (glow border on hover + radial gradient pseudo-element) and `.hover-card` (subtle lift) component classes. All must use motion tokens.
- [x] T013 Refactor `frontend/src/app/components/ConfirmModal.tsx` — replace hardcoded rgba shadows with `var(--shadow-elevated)`, border with `border-white/[0.06]`
- [x] T014 Refactor `frontend/src/app/components/Skeleton.tsx` — replace hardcoded shimmer value with `rgba(255,255,255,0.06)` (dark-only)
- [x] T015 Refactor `frontend/src/app/components/Toast.tsx` — replace border colors with `border-white/[0.06]`, adjust toast-bar colors to match dark palette
- [x] T016 [P] Create reusable `<SectionCard>` wrapper component in `frontend/src/app/components/SectionCard.tsx` — wraps children in `premium-card` class, accepts optional `title` and `icon` props

### Dashboard

- [x] T017 Restyle dashboard header in `page.tsx` — use `font-display`, add subtle gradient glow behind icon block, upgrade `+ New Session` button to `btn-primary`
- [x] T018 Restyle dashboard KPI stat cards in `page.tsx` — switch to `stat-card` with `bg-card border-white/[0.06]`, add sparkline opacity, font-display for big numbers
- [x] T019 Restyle dashboard **Session Overview** and **Weekly Activity** sections — switch container to `premium-card`, add `section-header` prefix icon shimmer
- [x] T020 Restyle **Recent Sessions** list in `page.tsx` — switch container to `premium-card`, add `group-hover` icon scale, ensure `badge` classes match dark palette

### List Pages

- [x] T021 Restyle **Devices** list page (`frontend/src/app/devices/page.tsx`) — device cards to `border-white/[0.06]`, hover glow shadow, page header `font-display`
- [x] T022 Restyle **Patients** list page (`frontend/src/app/patients/page.tsx`) — patient cards to `border-white/[0.06]`, hover glow shadow, page header `font-display`
- [x] T023 Restyle **Sessions** list page (`frontend/src/app/sessions/page.tsx`) — session rows to use `list-row`, session table header to `table-header`, page header `font-display`
- [x] T024 Restyle **Alerts** page (`frontend/src/app/alerts/page.tsx`) — alert rows to use gradient accent bar, badge colors aligned with dark palette, page header `font-display`

### Detail & Utility Pages

- [x] T025 Restyle **Session Detail** page (`frontend/src/app/session/[id]/page.tsx`) — charts section to `premium-card`, predictions panel to glass card, breadcrumb to use accent color
- [x] T026 Restyle **Device Detail** page (`frontend/src/app/devices/[id]/page.tsx`) — device info card to `premium-card`, MQTT credentials panel to glass card, status indicators to `pulse-dot`
- [x] T027 Restyle **Settings** page (`frontend/src/app/settings/page.tsx`) — form sections to `premium-card`, input fields updated with `input-field` class, save button to `btn-primary`
- [x] T028 Restyle **New Session** page (`frontend/src/app/session/new/page.tsx`) — form to `premium-card`, device selector cards to `hover-card`, submit button to `btn-primary`

### Auth Page

- [x] T029 Restyle **Login** page (`frontend/src/app/auth/login/page.tsx`) — login card to glass-card with `--gradient-hero` background on full page, gradient text for branding

### Build Verification

- [x] T030 Run full `npm run build` — verify all pages compile with updated styles, no type or CSS errors

**Checkpoint**: Visual upgrade is obvious on every page. Design tokens are used consistently. Build passes. All existing data and workflows are intact.

---

## Phase 4: User Story 2 — Ambient 3D Visuals (Priority: P2)

**Goal**: Decorative 3D visuals on the dashboard header and empty state screens. WebGL-based with graceful fallback.

**Independent Test**: Dashboard shows pulsing 3D heart in header. Empty states show floating shapes. `prefers-reduced-motion` disables animation. WebGL unavailable → SVG fallback.

### 3D Components

- [x] T031 [US2] Create `frontend/src/app/components/3d/AmbientHeart.tsx` — React Three Fiber component: abstract heart-like 3D mesh, slow breathing/pulse animation, quality tiers prop (`low`/`medium`/`high`), `prefers-reduced-motion` → static frame, WebGL unavailable → SVG gradient orb fallback, `pointer-events: none`, `aria-hidden="true"`
- [x] T032 [US2] Create `frontend/src/app/components/3d/FloatingShapes.tsx` — Slow-drifting organic shapes (CSS/SVG or R3F), density prop, `prefers-reduced-motion` → static positions, `pointer-events: none`, `aria-hidden="true"`

### Integration

- [x] T033 [US2] Integrate AmbientHeart into dashboard header in `frontend/src/app/page.tsx` using `dynamic(() => import('./components/3d/AmbientHeart'), { ssr: false })` — position absolutely behind header title, z-index: 0
- [x] T034 [US2] Add FloatingShapes to empty state blocks across pages — wrap existing "no items" states in Devices, Patients, Sessions, and Alerts pages with FloatingShapes background. Use lazy dynamic import.

### Verification

- [x] T035 [US2] Run `npm run build` to verify 3D components compile (check for SSR issues with three.js)
- [x] T036 [US2] Manual browser test: verify dashboard header shows pulsing 3D heart, empty states show floating shapes. Test with OS reduced-motion setting enabled. Verify no interaction blocking.

**Checkpoint**: 3D visuals render on dashboard and empty states. Animations disable with reduced-motion. Build passes.

---

## Phase 5: User Story 4 — Responsive & Accessible Experience (Priority: P2)

**Goal**: All redesigned elements work across screen sizes, keyboard-navigable, WCAG AA contrast.

**Independent Test**: Resize browser to mobile/tablet widths — sidebar collapses, content reflows. Navigate with Tab key — every interactive element has a visible focus ring.

- [x] T037 [P] [US4] Audit all interactive elements across all pages for visible keyboard focus states — add `focus-visible:ring-2 focus-visible:ring-ring` where missing
- [x] T038 [P] [US4] Verify WCAG AA contrast ratios for all text-on-dark-background combinations using dev tools or contrast checker — fix any failing pairs by adjusting `--muted-foreground` or `--text-soft` tokens
- [x] T039 [US4] Verify sidebar collapse behavior on tablet (≤1024px) and mobile (≤768px) viewports — confirm content reflows properly after redesign changes
- [x] T040 [US4] Verify 3D AmbientHeart has `aria-hidden="true"` and `role="presentation"` — screen readers should skip it entirely
- [x] T041 [US4] Manual browser test: resize to 768px and 1024px, tab through all pages, confirm focus rings visible and all elements reachable

**Checkpoint**: Keyboard navigation works on all pages, contrast passes WCAG AA, responsive layout intact.

---

## Phase 6: User Story 5 — No Performance Regressions (Priority: P1)

**Goal**: Dashboard loads as fast as before. 3D is lazy-loaded outside the critical path. Charts remain smooth.

**Independent Test**: Measure dashboard load time. Confirm R3F bundle is not in the main chunk. Live monitoring has no frame drops.

- [x] T042 [US5] Verify AmbientHeart is loaded via `next/dynamic` with `{ ssr: false }` in `frontend/src/app/page.tsx` — confirm it does NOT appear in the server bundle
- [x] T043 [US5] Verify FloatingShapes uses dynamic import — confirm lazy-loaded
- [x] T044 [US5] Run `npm run build` and check the build output: confirm `three` and `@react-three/*` are in a separate chunk, not in the main page bundle
- [x] T045 [US5] Manual browser test with DevTools Network tab: load dashboard, confirm 3D chunk loads AFTER initial page content is interactive
- [x] T046 [US5] If a session detail page with live monitoring is available, verify chart updates remain smooth (no jank from global CSS changes)

**Checkpoint**: Build output shows 3D in separate chunk. Dashboard load time within 10% of baseline.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cleanup, final validation

- [x] T047 [P] Complete `frontend/DESIGN.md` — document: full token list with values, typography scale (h1–h6 + body + caption sizes), 3D allowed zones (dashboard header, empty states) vs. forbidden zones (charts, live monitoring, data tables), accessibility behavior (reduced-motion, aria-hidden on 3D, focus states), performance strategy (lazy-load, dynamic import, SSR disabled for 3D)
- [x] T048 [P] Remove any unused CSS classes or dead code from `frontend/src/app/globals.css` left over from light-mode removal
- [x] T049 Run final `npm run lint` and `npm run build` — must pass with 0 errors
- [x] T050 Docker rebuild and test: `docker compose build --no-cache frontend && docker compose up -d frontend` — verify app works at http://localhost:3000
- [x] T051 Final manual browser walkthrough: login → dashboard (check 3D) → patients → devices → sessions → session detail → alerts → settings → admin. Verify premium styling, 3D, hover effects, focus states, and data integrity across all screens.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundation)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1+US3)**: Depends on Phase 2 — core visual upgrade
- **Phase 4 (US2)**: Depends on Phase 2 (can run in parallel with Phase 3)
- **Phase 5 (US4)**: Depends on Phase 3 (needs styled elements to audit)
- **Phase 6 (US5)**: Depends on Phase 4 (needs 3D to verify lazy-load)
- **Phase 7 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1+US3 (Visual + Tokens)**: Start after Phase 2 — no dependencies on other stories
- **US2 (3D Visuals)**: Start after Phase 2 — can proceed in parallel with US1
- **US4 (Accessibility)**: Needs US1 complete (restyled elements to audit)
- **US5 (Performance)**: Needs US2 complete (3D to verify lazy-load)

### Parallel Opportunities

Within Phase 3 (US1+US3):
- T013, T014, T015, T016 all edit different component files → can run in parallel
- T020, T021, T022, T023 all edit different page files → can run in parallel
- T024, T025, T026 all edit different page files → can run in parallel

Within Phase 5 (US4):
- T037, T038 audit different properties → can run in parallel

---

## Parallel Example: Phase 3 (US1+US3)

```text
# Batch 1 — Shared primitives (all different files):
T013: Update ConfirmModal.tsx
T014: Update Skeleton.tsx
T015: Update Toast.tsx
T016: Update error-boundary.tsx

# Batch 2 — List pages (all different files):
T020: Restyle devices/page.tsx
T021: Restyle patients/page.tsx
T022: Restyle sessions/page.tsx
T023: Restyle alerts/page.tsx

# Batch 3 — Detail pages (all different files):
T024: Restyle session/[id]/page.tsx
T025: Restyle settings/page.tsx
T026: Restyle admin/page.tsx
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3 Only)

1. Complete Phase 1: Setup (install deps)
2. Complete Phase 2: Foundation (dark-only tokens)
3. Complete Phase 3: US1+US3 (premium visual + design system)
4. **STOP and VALIDATE**: Every page should look premium, all data works
5. Deploy/demo if ready — this alone delivers the core visual upgrade

### Incremental Delivery

1. Setup + Foundation → token system ready
2. US1+US3 → visual upgrade on all pages → **MVP ✅**
3. US2 → add 3D ambient visuals → differentiation
4. US4 → accessibility audit → compliance
5. US5 → performance verification → production-ready
6. Polish → documentation + final cleanup

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps tasks to specific user stories for traceability
- Commit after each task or logical batch
- Stop at any checkpoint to validate independently
- CRITICAL: Never modify Recharts chart internals or real-time data rendering
- Total tasks: 51
