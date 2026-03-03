# Data Model: Landing Page Redesign

This feature primarily involves UI rendering and routing restructuring. There are no new database entities, tables, or complex backend data structures introduced in this phase.

## Entities (UI State/Props)

### Landing Page Sections
Not a formal database entity, but the UI is structured around these logical units:
- **Hero**: Title, Tagline, CTAs, 3D Visualization slot.
- **Features**: List of feature items (Icon, Title, Description).
- **Architecture**: Visual diagram representing the data pipeline.
- **How to Start**: Ordered steps for onboarding.

### Architecture Pipeline Diagram Nodes
- `ESP32` -> `MQTT` -> `Inference` -> `Supabase` -> `Dashboard`
- **Styling constraints**: Must use existing HUD accent colors (cyan/violet/amber).
