# Quickstart: Premium UI Redesign

**Branch**: `001-premium-ui-redesign`

## Prerequisites

- Node.js ≥ 18
- Docker & Docker Compose
- Git (on `001-premium-ui-redesign` branch)

## Setup

```bash
cd d:\cardiosense-project\cardiosense\frontend
npm install @react-three/fiber @react-three/drei three
npm install -D @types/three
```

## Development

```bash
# Run locally (no Docker)
cd frontend && npm run dev

# Or with Docker
docker compose build --no-cache frontend
docker compose up -d frontend
```

Open http://localhost:3000

## Key Files to Edit (in order)

1. `globals.css` — Collapse light+dark tokens into dark-only `:root`
2. `tailwind.config.js` — Remove `darkMode`, add new animation/color entries
3. `components/ThemeProvider.tsx` — Simplify to dark-only
4. `components/Navbar.tsx` — Remove theme toggle
5. `components/3d/AmbientHeart.tsx` — New R3F component (lazy-loaded)
6. `components/3d/FloatingShapes.tsx` — New R3F component
7. `page.tsx` (Dashboard) — Add AmbientHeart, restyle KPI cards
8. All page files — Apply new design tokens
9. `DESIGN.md` — Document the design system

## Verification

```bash
cd frontend
npm run lint
npm run build
# Then manual browser test at http://localhost:3000
```
