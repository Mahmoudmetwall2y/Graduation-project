# Quickstart: Landing Page Redesign

## Setup

1. **Install Dependencies**:
   Dependancies are already defined in the existing project. Run standard installation if needed:
   ```bash
   cd frontend
   npm install
   ```

2. **Run Development Server**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **Verify Routes**:
   - Open `http://localhost:3000/` to view the new landing page.
   - Open `http://localhost:3000/dashboard` to verify the existing dashboard is fully functional at its new location.

## Key CSS Classes
The landing page relies heavily on the existing HUD/glass UI system in `globals.css`:
- `page-wrapper`: Container styling.
- `hud-glass-panel`, `glass-card`: Translucent card backgrounds.
- `btn-primary`: Main CTA styling.
- `gradient-text`: Text accents.
- `.fade-in`, `.slide-up`: CSS animation utility classes.
