# Research: Landing Page Redesign

## Tech Stack & Project Context
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS, custom globals.css (HUD/glass design system)
- **3D Rendering**: react-three-fiber stack (for existing HeartVisualization3D component)
- **Icons**: lucide-react

## Unknowns Resolved

### 1. Existing Heart Visualization
- **Decision**: Reuse the existing `HeartVisualization3D` component.
- **Rationale**: User constraints explicitly mandate reusing this component with dynamic import and `ssr: false`.
- **Alternatives considered**: None, dictated by constraints.

### 2. Animation Assets
- **Decision**: Use existing CSS animations from `globals.css` (`fadeIn`, `slideUp`, `shimmer`, and scanline/pulse keyframes). Use Tailwind for transitions.
- **Rationale**: User constraints explicitly forbid introducing new animation libraries like Framer Motion to keep dependencies minimal.
- **Alternatives considered**: Framer Motion (rejected due to constraints).

### 3. Routing Strategy
- **Decision**: Move the contents of `frontend/src/app/page.tsx` to `frontend/src/app/dashboard/page.tsx`. Create a new landing page in `frontend/src/app/page.tsx`.
- **Rationale**: Safe relocation of existing functionality while establishing the new landing page at the root route.
- **Alternatives considered**: N/A, dictated by constraints.
