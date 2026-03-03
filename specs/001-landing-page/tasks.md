# Tasks: Landing Page Redesign

**Input**: Design documents from `/specs/001-landing-page/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Verify existing project structure and locate `HeartVisualization3D` component

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create `frontend/src/app/dashboard/` directory
- [x] T003 Move existing dashboard component from `frontend/src/app/page.tsx` to `frontend/src/app/dashboard/page.tsx`
- [x] T004 Create an empty `frontend/src/app/page.tsx` to serve as the new root landing page

**Checkpoint**: Foundation ready - user story implementation can now begin. The root path is cleared and the dashboard is relocated.

---

## Phase 3: User Story 2 - Access Dashboard (Priority: P1) 🎯 MVP 1

**Goal**: As a user, I want to be able to navigate to the application dashboard from the landing page.

**Independent Test**: Can be fully tested by navigating to the dashboard route (`/dashboard`) from the root URL and verifying existing functionality remains intact.

### Implementation for User Story 2

- [x] T005 [US2] Fix relative imports in `frontend/src/app/dashboard/page.tsx` if any broke during the move
- [x] T006 [US2] Update any existing external Navigation/Header links (e.g. `TopBar.tsx`) to point to `/dashboard` instead of `/` where appropriate

**Checkpoint**: User Story 2 is fully functional. The dashboard works at `/dashboard`.

---

## Phase 4: User Story 1 - View Landing Page and Architecture (Priority: P1) 🎯 MVP 2

**Goal**: As a visitor, I want to see a polished, animated entry page with a 3D heart visualization and technical architecture overview.

**Independent Test**: Can be fully tested by navigating to the root URL (`/`) and verifying the presence of the split layout, 3D visualization, feature cards, and architecture section.

### Implementation for User Story 1

- [x] T007 [P] [US1] Implement Hero section (split layout) in `frontend/src/app/page.tsx` with name, tagline, and Primary/Secondary CTAs
- [x] T008 [P] [US1] Import and render the existing `HeartVisualization3D` dynamically (`ssr: false`) on the right side of the Hero section, providing a `glass-card` fallback
- [x] T009 [US1] Implement Feature cards section (3-6 cards) using `glass-card`/`hud-glass-panel` and lucide-react icons
- [x] T010 [US1] Implement Architecture section (`#architecture`), rendering a clean pipeline: ESP32 -> MQTT -> Inference -> Supabase -> Dashboard
- [x] T011 [US1] Implement "How to Start" section with 3 onboarding steps
- [x] T012 [US1] Implement Footer with necessary links

**Checkpoint**: At this point, both User Stories should work independently. The landing page has its content and links to the dashboard.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T013 [P] Add subtle animated background glow to `frontend/src/app/page.tsx` using `globals.css` gradients
- [x] T014 [P] Add staggered `fade-in`/`slide-up` animations on hero and feature cards using animation delays
- [x] T015 [P] Add a "pulse" or "scanline" overlay to the hero visualization/architecture nodes using existing keyframes
- [x] T016 [P] Ensure `prefers-reduced-motion` CSS media queries disable non-essential animations on the new landing page
- [x] T017 Verify accessibility: semantic headings and keyboard focus states are correct on buttons/links

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Can start immediately
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories.
- **User Stories (Phase 3 & 4)**: Must run sequentially. Relocating routing imports (US2) prevents breaking the app while building the frontend (US1).
- **Polish (Final Phase)**: Depends on User Story 1 being fully complete.

### Within Each User Story

- Core implementation (layouts) before specific dynamic imports and sections.
- Ensure styling relies STRICTLY on existing `globals.css` HUD tokens.

### Parallel Opportunities

- Within US1, the different sections (Hero, Features, Architecture, Footer) can technically be extracted into separate component files and worked on in parallel if modularized properly, but for this scale, combining them iteratively in `page.tsx` is sufficient.
- Polish tasks (T013 to T016) can be handled sequentially as a final CSS pass.
