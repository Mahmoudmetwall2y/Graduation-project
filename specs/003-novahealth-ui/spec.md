# Feature Specification: NovaHealth UI Redesign

**Feature Branch**: `003-novahealth-ui`  
**Created**: 2026-03-01  
**Status**: Draft  
**Input**: User description: "Redesign AscultiCor UI to match NovaHealth aesthetic"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Live Session Monitoring (Priority: P1)

As a clinician, I want to monitor active patient cardiac sessions in a futuristic, high-contrast HUD interface so that I can quickly identify anomalies and analyze visualizations without visual fatigue.

**Why this priority**: The live dashboard is the most critical workflow for users, and the new visual hierarchy and aesthetics are most impactful here.

**Independent Test**: Can be independently verified by opening the Dashboard route and confirming the center anatomical visualization and surrounding metrics are present and styled correctly.

**Acceptance Scenarios**:

1. **Given** the dashboard is loaded, **When** reviewing the page, **Then** a central 3D/animated cardiac visualization is displayed prominently with relevant status callouts.
2. **Given** the dashboard is loaded, **When** reviewing the top metrics, **Then** exactly 6 glass-styled metric cards (Live Sessions, Connected Devices, AI Inferences, Clinical Alerts, Stream Latency, Offline > 1h) are displayed.

---

### User Story 2 - Navigation and Information Architecture (Priority: P2)

As a returning user, I want the navigation and layout structure to intuitively mirror my previous workflows while adopting the new pill-style and neon-highlighted aesthetic, so that I don't need to relearn how to find my patients or devices.

**Why this priority**: Ensuring users can navigate the application efficiently without getting lost is critical for usability and adoption of the redesign. 

**Independent Test**: Can be tested by navigating entirely through the application using the sidebar and new top pill bar, successfully matching all original routes.

**Acceptance Scenarios**:

1. **Given** the application is loaded on desktop, **When** looking at the top and left edges, **Then** a pill-style top navigation bar and a redesigned icon-left sidebar with neon active states are visible.
2. **Given** the application is loaded on mobile, **When** viewing the screen, **Then** the sidebar collapses into a drawer and the top bar becomes compact.

---

### User Story 3 - Accessible Motion and Visuals (Priority: P3)

As a user sensitive to motion and complex visuals, I want the interface to pause intense animations and background particle effects so that I can comfortably use the system.

**Why this priority**: Essential for maintaining comprehensive accessibility standards across an interface heavily reliant on visual effects.

**Independent Test**: Can be tested by toggling the OS-level `prefers-reduced-motion` setting and observing the UI.

**Acceptance Scenarios**:

1. **Given** a user with reduced motion preferences enabled, **When** they view the dashboard, **Then** background particle dust, scanlines, and any intense pulsing animations are paused or disabled entirely.

### Edge Cases

- What happens when a metric (like AI Inferences) contains no data or cannot be derived? (Should render "—" or "No recent data" with a polished empty state).
- How does the system handle the Cardiac HUD Visualization on low-end devices or if 3D rendering fails? (Should lazily load and provide a performant 2D SVG/canvas wireframe fallback).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render the overall application background in near-black with a subtle blue tint/vignette.
- **FR-002**: System MUST utilize glassmorphism (translucent panels, blur, thin borders) for all content cards.
- **FR-003**: System MUST provide a central "Cardiac HUD Visualization" on the main dashboard.
- **FR-004**: System MUST recompose the dashboard to mimic the reference top metric strip (6 specific tiles).
- **FR-005**: System MUST restyle the sidebar and introduce a contextual top navigation pill bar.
- **FR-006**: System MUST extend the HUD aesthetic (glass panels, dark background, cyan/violet/amber/red accents) to Patients, Devices, Sessions, Alerts, and Admin routes.
- **FR-007**: System MUST map AscultiCor's existing dashboard data (Active Sessions, Devices, Predictions, Alerts, Latency, Offline status, Weekly Activity, Recent Sessions) accurately into the new visual framework without altering backend functionality.
- **FR-008**: System MUST implement accessibility features, including keyboard focus visibility, sufficient dark-mode text contrast, and respect for `prefers-reduced-motion`. The UI will utilize standard WCAG AA (4.5:1) minimal contrast ratios for neon text elements against glass panels to safely allow for the vibrant glowing aesthetic of the reference photo.
- **FR-009**: System MUST supply a central visualization hero component. This representation will feature a continuous ambient loop animation (a purely aesthetic background asset) decoupled from real-time patient telemetry to prioritize system performance.

### Key Entities

- **Cardiac Visualization**: The central hero anatomical representation in the HUD.
- **Metric Tiles**: Standardized display units for key operational stats.
- **Glass Cards**: The foundational UI surface component driving the cohesive look.
- **Status Chips**: Reusable pills for conveying the 4 main system states (OK, Monitoring, Needs Attention, Critical).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the prescribed AscultiCor dashboard metrics and data visualizations (Weekly Activity, Recent Sessions, Monitoring Status) are present in the new layout.
- **SC-002**: 100% of existing application routes (Patients, Devices, Sessions, Alerts, Admin) successfully render the new HUD styling without crashing or breaking existing state flows.
- **SC-003**: Lighthouse Accessibility score is maintained at or above 90 (or current baseline if lower).
- **SC-004**: The UI seamlessly adapts to mobile, tablet, and desktop breakpoints, passing Google Mobile-Friendly parameters without horizontal overflow or overlapping components.
