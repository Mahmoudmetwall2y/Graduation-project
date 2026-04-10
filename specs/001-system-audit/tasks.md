---
description: "Task list for AscultiCor System Audit Fixes"
---

# Tasks: System Audit Fixes

**Input**: Design documents from `/specs/001-system-audit/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ws_predictions.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Add `mqtt` package dependency to `frontend/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Execute `npm install` within the `frontend/` directory to resolve package trees.

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Real-Time WebSocket MQTT Integration (Priority: P1) 🎯 MVP

**Goal**: Replace the 30-second Supabase HTTP polling delay with instantaneous WebSocket MQTT telemetry from Mosquitto.

**Independent Test**: Load the dashboard UI. Start the backend simulation. The UI charts should immediately stream incoming heartbeats smoothly without a 30-second stutter.

### Implementation for User Story 1

- [x] T003 [P] [US1] Create React Hook `frontend/src/app/hooks/useMQTT.ts` handling `mqtt.connect` to `ws://localhost:9001`
- [x] T004 [P] [US1] Implement JSON payload deserialization inside `useMQTT.ts` matching `contracts/ws_predictions.md`
- [x] T005 [US1] Refactor `frontend/src/app/dashboard/page.tsx` to replace `setInterval(fetchDashboardData, 30000)` with `useMQTT()` state.
- [x] T006 [US1] Refactor `frontend/src/app/devices/page.tsx` to implement live status indicators bound to the webhook.
- [x] T007 [US1] Add fallback polling logic inside `useMQTT.ts` ensuring the app reverts to `fetch('/api/devices')` if `mqtt.client.on('error')` fires.

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - NGINX Secure Reverse Proxy (Priority: P2)

**Goal**: Wrap the unencrypted Mosquitto `9001` port and Next.js `3000` port behind a single unified NGINX reverse proxy implementing SSL/TLS termination, to prevent Mixed Content blocking in modern browsers.

**Independent Test**: Connect to `https://localhost` and verify the WebSocket upgrades cleanly to `wss://localhost/mqtt`.

### Implementation for User Story 2

- [x] T008 [P] [US2] Create NGINX configuration block in `nginx/nginx.conf` mapping `/` to `frontend:3000` and `/mqtt` to `mosquitto:9001`.
- [x] T009 [P] [US2] Create `nginx/Dockerfile` utilizing `nginx:alpine` and copying the configuration.
- [x] T010 [US2] Update root `docker-compose.yml` to include the new `nginx` proxy network service.
- [x] T011 [US2] Change `NEXT_PUBLIC_MQTT_WS_URL` inside `.env` to target the unified NGINX WebSocket route rather than the raw 9001 port.

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently securely.

---

## Phase 5: User Story 3 - Repository Cleanup & Key Rotation (Priority: P3)

**Goal**: Remove dead debug code from the root directory and eliminate hardcoded OpenAI secrets.

**Independent Test**: A text search for "sk-proj" in the repository must yield 0 results outside of explicitly `.gitignore`d files.

### Implementation for User Story 3

- [x] T012 [P] [US3] Delete raw `test_models.py` isolated script from root repository (obsoleted by Docker).
- [x] T013 [P] [US3] Delete temporary `spec_input.txt` artifact from root repository.
- [x] T014 [US3] Nullify `OPENAI_API_KEY` inside `.env.example` and replace the actual `.env` key with a placeholder requiring CI/CD injection.

**Checkpoint**: All user stories should now be independently functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T015 [P] Run quickstart.md validation to ensure edge-to-dashboard pipeline succeeds locally.
- [x] T016 Commit all SpecKit planning artifacts.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Phase 3 (Frontend MQTT) must complete first to verify the code logic works locally unencrypted.
  - Phase 4 (NGINX) will then secure the verified logic.
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2).
- **User Story 2 (P2)**: Integrates seamlessly over US1.
- **User Story 3 (P3)**: Fully independent cleanup tasks.

### Parallel Opportunities

- Hooks (`useMQTT.ts`) and Configs (`nginx.conf`) can be authored entirely in parallel.
- Cleanup tasks (`T012`, `T013`) are fully isolated and parallelizable immediately.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Verify the React UI streams heartbeats at > 2hz directly from the Python inference engine over local Mosquitto WS.
5. Deploy/demo if ready
