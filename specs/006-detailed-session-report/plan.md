# Implementation Plan: Detailed Session Report

**Branch**: `006-detailed-session-report` | **Date**: 2026-04-04 | **Spec**: [spec.md](../spec.md)
**Input**: Feature specification from `/specs/006-detailed-session-report/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

This update focuses on restructuring the `session/[id]/page.tsx` UI to represent the cardiovascular data linearly from Current State -> Functional Analysis -> Predictive Trajectory, while utilizing Tailwind's `@media print` features to allow standardized PDF exports of the comprehensive views without additional headless-browser backends.

## Technical Context

**Language/Version**: TypeScript / TSX (React 18)
**Primary Dependencies**: Next.js 14, Tailwind CSS, Recharts
**Storage**: N/A (Consumes existing Supabase tables)
**Testing**: Jest / Playwright
**Target Platform**: Web Browser / Native PDF Print
**Project Type**: Web Application Frontend
**Performance Goals**: Renders data arrays and PDFs seamlessly without layout freezes > 50ms.
**Constraints**: Tailwind `@media print` overrides must be rigorously applied to strip dark mode dynamically for paper.
**Scale/Scope**: Frontend component restructuring within the `frontend/` package limits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No constitution has been defined for this repo.

## Project Structure

### Documentation (this feature)

```text
specs/006-detailed-session-report/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── app/
│   │   └── session/
│   │       └── [id]/
│   │           └── page.tsx        # Container for the report architecture
│   ├── components/                 # New model cards will be placed here
│   │   ├── Model1StateCard.tsx
│   │   ├── Model2DiagnosticCard.tsx
│   │   └── Model3PrognosisCard.tsx
```

**Structure Decision**: Selected the strictly Web Application Next.js component organization as this is primarily a UI presentation logic shift.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
