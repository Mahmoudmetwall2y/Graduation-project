# Feature Specification: Premium UI Redesign with Ambient 3D Visuals

**Feature Branch**: `001-premium-ui-redesign`  
**Created**: 2026-02-28  
**Status**: Draft  
**Input**: User description: "Redesign the entire in-app UI to look more premium using subtle 3D heart/medical-tech shapes, modern motion, refined visual system, microinteractions, and scroll/hover polish while maintaining the same information architecture and workflows"

## Clarifications

### Session 2026-02-28

- Q: What 3D implementation approach should be used for ambient visuals? → A: React Three Fiber (real WebGL 3D) for richer depth and authentic 3D rendering of decorative elements.
- Q: Should the redesign keep the current light/dark theme toggle or change the theme strategy? → A: Dark-only — remove light mode entirely and design exclusively around a dark medical-tech aesthetic.
- Q: Which pages should display 3D ambient visuals? → A: Dashboard header and empty state screens only. All other pages (Patients, Devices, Sessions, Alerts, Settings) stay clean without 3D elements.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clinician Notices Premium Visual Upgrade (Priority: P1)

A clinician opens the AscultiCor dashboard after the redesign. They immediately notice a cleaner, more modern interface with improved depth, typography hierarchy, and subtle ambient visuals. The sidebar, page layout, KPI cards, charts, and tables all feel cohesive and "premium." All existing workflows (viewing sessions, patients, devices, alerts) remain identical in behavior — only the visual presentation has improved.

**Why this priority**: The core value of this feature is visual elevation. If the upgrade is not obvious at first glance, the feature has failed.

**Independent Test**: Navigate through every section of the app (Dashboard, Patients, Devices, Sessions, Alerts, Settings) and confirm that the visual upgrade is immediately noticeable while all data and interactions remain functional.

**Acceptance Scenarios**:

1. **Given** a logged-in user on the dashboard, **When** they view the KPI cards and charts, **Then** they see improved card surfaces (layered shadows, glow edges, stronger typography hierarchy) and charts remain fully legible and interactive.
2. **Given** a user navigating between pages, **When** they visit Patients, Devices, Sessions, and Alerts, **Then** each page has consistent premium styling (tokens, spacing, card depth, motion) with no visual regressions.
3. **Given** a user on any page, **When** they hover over interactive elements (buttons, cards, rows), **Then** they see smooth, polished microinteractions (hover lift, subtle glow, pressed states) that feel cohesive.

---

### User Story 2 - Ambient 3D Visuals Enhance Atmosphere (Priority: P2)

A user sees subtle, decorative 3D heart/medical-tech shapes in the dashboard header area and on empty state screens. These visuals create a unique, branded atmosphere without obstructing any data, charts, or controls. Other pages (Patients, Devices, Sessions, Alerts, Settings) remain clean.

**Why this priority**: The 3D/ambient visuals are the "differentiator" that makes the app feel distinct, but they are less critical than the foundational design system upgrade.

**Independent Test**: Navigate to areas where ambient visuals appear and confirm they are decorative only, never overlap interactive elements, and can be disabled.

**Acceptance Scenarios**:

1. **Given** a user on the dashboard, **When** they view the header area, **Then** they see an ambient heart-like shape with a slow breathing/pulse animation that does not block any text, buttons, or charts.
2. **Given** a user with `prefers-reduced-motion` enabled, **When** they load any page with 3D visuals, **Then** the 3D element renders as a static shape or is hidden entirely.
3. **Given** a user on a low-end device, **When** the app detects limited GPU capability, **Then** the 3D visuals degrade gracefully to a simpler CSS/SVG fallback or do not render.
4. **Given** a user interacting with any page element near an ambient visual, **When** they click, type, or drag, **Then** the ambient visual has `pointer-events: none` and never intercepts user interaction.

---

### User Story 3 - Design System Consistency Across All Screens (Priority: P1)

All UI primitives (Button, Card, Badge/Status pill, Tabs, Modal, Toast, Skeleton, EmptyState) follow a single design system with defined tokens (colors, gradients, radii, elevation, blur, borders, typography scale, motion timings). Styles are never ad-hoc — every element uses the shared token layer.

**Why this priority**: Without a consistent token/primitive layer, the visual upgrade will feel patchwork rather than cohesive. This is the foundation that makes everything else work.

**Independent Test**: Inspect any UI element across any screen and confirm it uses design tokens (CSS variables or theme extension) rather than hardcoded values.

**Acceptance Scenarios**:

1. **Given** any card in the app (KPI, patient, device, session), **When** it is rendered, **Then** it uses shared card surface tokens (shadow, border-radius, background, border) from the design system.
2. **Given** any button or interactive element, **When** it is rendered and interacted with, **Then** it follows the shared motion timing tokens (hover duration, scale factor, easing curve).
3. **Given** anywhere typography appears, **When** it is rendered, **Then** it follows the defined typography scale (section headers are large and bold, body text is compact, supporting text is muted).

---

### User Story 4 - Responsive and Accessible Experience (Priority: P2)

All redesigned elements work correctly on various screen sizes and for users with assistive technology. Sidebar collapse behavior is preserved. Keyboard navigation, focus states, and contrast ratios meet accessibility standards.

**Why this priority**: Accessibility and responsiveness are non-negotiable but do not drive the primary visual upgrade objective.

**Independent Test**: Resize the browser to mobile/tablet widths and navigate with keyboard only, confirming all elements are reachable and visible.

**Acceptance Scenarios**:

1. **Given** a user on a tablet or phone-sized viewport, **When** the sidebar collapses, **Then** all page content reflows correctly and remains usable.
2. **Given** a keyboard-only user, **When** they tab through any page, **Then** every interactive element has a visible focus ring and can be activated.
3. **Given** a user viewing any screen, **When** they inspect the interface, **Then** all text meets WCAG AA contrast ratios against the dark background.

---

### User Story 5 - No Performance Regressions (Priority: P1)

The dashboard and all pages load as fast as before (or faster). 3D assets are lazy-loaded and do not block initial page render. The Lighthouse performance score does not drop below its pre-redesign baseline.

**Why this priority**: A visually premium app that feels slow undermines user trust, especially in a clinical context where real-time monitoring is critical.

**Independent Test**: Measure initial page load time on the dashboard before and after the redesign, confirming no regression above a defined threshold.

**Acceptance Scenarios**:

1. **Given** a user loading the dashboard for the first time, **When** the page renders, **Then** the critical content (KPI cards, chart, session list) appears within the same timeframe as the pre-redesign baseline.
2. **Given** a page with 3D ambient visuals, **When** the 3D component is lazy-loaded, **Then** it does not appear in the critical rendering path and does not delay page interactivity.
3. **Given** a real-time monitoring session in progress, **When** live data streams into the chart, **Then** the chart updates remain smooth with no frame drops introduced by the redesign.

---

### Edge Cases

- What happens when a very long patient name or device name overflows a redesigned card — does the card gracefully truncate?
- What happens on a browser that doesn't support `backdrop-filter` (glassmorphism) — is there a solid-color fallback?
- What happens when a user loads the dashboard with JavaScript disabled — does the page still render meaningful content?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST maintain all existing routes, navigation, and page structure unchanged (sidebar layout, routing, section order).
- **FR-002**: System MUST introduce a design token layer (CSS custom properties) defining a dark-only color palette, gradients, border radii, elevation/shadows, blur levels, borders, typography scale, and motion timings. Light mode will be removed entirely.
- **FR-003**: All existing UI primitives (Button, Card, Badge, Tabs, Modal/Drawer, Toast, Skeleton, EmptyState) MUST be refactored to use the shared design tokens instead of ad-hoc styles.
- **FR-004**: System MUST implement premium card surfaces with soft glow edges, subtle inner borders, and layered shadows across all card-based layouts.
- **FR-005**: System MUST implement a stronger typography hierarchy: large, bold section headers; compact clinical body text; muted supporting text.
- **FR-006**: System MUST add consistent microinteractions: hover states (lift/glow), pressed states, focus rings, and disabled states for all interactive elements.
- **FR-007**: System MUST provide a reusable `AmbientHeart` (or `HeartOrb`) component using React Three Fiber that renders an abstract, non-anatomical heart-like 3D form with a slow breathing/pulse animation, placed exclusively in the dashboard header area and empty state screens. It MUST NOT appear on Patients, Devices, Sessions, Alerts, or Settings pages.
- **FR-008**: The `AmbientHeart` component MUST have `pointer-events: none`, be `aria-hidden`, and MUST NOT obscure charts, tables, or any critical clinical data.
- **FR-009**: The `AmbientHeart` component MUST respect `prefers-reduced-motion` by rendering as a static shape or being hidden.
- **FR-010**: 3D/ambient visuals MUST be implemented with React Three Fiber, MUST support quality tiers (low/medium/high via geometry complexity and shader detail), and MUST be lazy-loaded (dynamic import) so they do not block initial page render or add to the critical bundle.
- **FR-011**: System MUST provide a lightweight `FloatingShapes` background system for subtle parallax effects, used exclusively on empty state screens (e.g., when a list has no items) to fill visual space.
- **FR-012**: Charts and real-time monitoring views MUST NOT be visually altered in any way that reduces legibility or disrupts live data rendering.
- **FR-013**: All redesigned elements MUST support responsive layouts and the existing sidebar collapse behavior.
- **FR-014**: All interactive elements MUST have visible keyboard focus states and meet WCAG AA contrast ratios.
- **FR-015**: A `DESIGN.md` document MUST be created in the repository documenting: tokens and typography scale, where 3D is allowed vs. forbidden, accessibility and reduced-motion behavior, and performance/lazy-load strategy.

### Key Entities

- **Design Token**: A named value (color, spacing, shadow, radius, timing) used consistently throughout the UI. Key attributes: name, value, category (color/spacing/motion/elevation), light/dark mode variants.
- **AmbientHeart Component**: A decorative 3D/faux-3D visual element. Key attributes: quality tier, animation state, visibility preference, placement zone.
- **UI Primitive**: A reusable component (Button, Card, Badge, etc.) that consumes design tokens. Key attributes: variants (primary/secondary/danger/ghost), sizes, states (default/hover/pressed/focus/disabled).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Visual upgrade is immediately noticeable to first-time viewers — at least 4 out of 5 new viewers rate the interface as "premium" or "modern" in a brief survey.
- **SC-002**: All existing user workflows (login, view dashboard, manage patients/devices/sessions, review alerts, change settings) complete successfully with no functional regressions.
- **SC-003**: Dashboard initial load time does not increase by more than 10% compared to the pre-redesign baseline.
- **SC-004**: 3D ambient visuals load asynchronously and do not appear in the critical rendering path — time to first interactive paint is unaffected.
- **SC-005**: 100% of interactive elements have visible keyboard focus states and meet WCAG AA contrast requirements.
- **SC-006**: Users with `prefers-reduced-motion` see no distracting animations — all motion is either static or disabled.
- **SC-007**: Real-time monitoring charts maintain their existing frame rate with no visible jank introduced by the redesign.
- **SC-008**: All UI primitives across all screens consistently use the design token layer — zero ad-hoc hardcoded color, shadow, or spacing values in the redesigned components.
