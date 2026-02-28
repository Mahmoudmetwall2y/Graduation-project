# Project Review Feedback

## Findings (ordered by severity)

1. [CRITICAL] `MQTTHandler._run_sync_in_executor` is wired incorrectly for cross-thread async dispatch.
- It passes `loop.run_in_executor(...)` directly into `asyncio.run_coroutine_threadsafe(...)`, but `run_coroutine_threadsafe` expects a coroutine object, not a future.
- This can break heartbeat/session status side effects from MQTT callbacks.
- Refs: `inference/app/mqtt_handler.py:229`, `inference/app/mqtt_handler.py:236`, `inference/app/mqtt_handler.py:317`, `inference/app/mqtt_handler.py:378`, `inference/app/mqtt_handler.py:406`.
- GitNexus impact: `_run_sync_in_executor` shows CRITICAL upstream blast radius through `_on_message`/session-start flows.

2. [HIGH] Session completion state can get stuck in `processing`.
- `_handle_end_pcg` never marks session `done`; `_handle_end_ecg` does it only when no PCG buffer exists.
- If ECG finishes first and PCG finishes later, session may never transition to `done`.
- Refs: `inference/app/mqtt_handler.py:452`, `inference/app/mqtt_handler.py:535`, `inference/app/mqtt_handler.py:593`, `inference/app/mqtt_handler.py:597`.
- GitNexus impact: both `_handle_end_pcg` and `_handle_end_ecg` are CRITICAL impact symbols.

3. [HIGH] Stored XSS risk in session PDF/export rendering.
- User-provided notes are interpolated into raw HTML and written with `document.write(...)` without escaping.
- A malicious note can inject script when export is opened.
- Refs: `frontend/src/app/session/[id]/page.tsx:407`, `frontend/src/app/session/[id]/page.tsx:493`, `frontend/src/app/session/[id]/page.tsx:463`, `frontend/src/app/session/[id]/page.tsx:532`.

4. [HIGH] `self.buffers` is mutated across threads without synchronization.
- MQTT callbacks run on paho's thread while monitor/publish coroutines run on event loop thread.
- `self.buffers` is written in callbacks and iterated directly in `_publish_live_metrics`, which can raise runtime dictionary mutation errors and corrupt lifecycle behavior.
- Refs: `inference/app/mqtt_handler.py:6`, `inference/app/mqtt_handler.py:7`, `inference/app/mqtt_handler.py:293`, `inference/app/mqtt_handler.py:369`, `inference/app/mqtt_handler.py:398`, `inference/app/mqtt_handler.py:719`.

5. [MEDIUM] Broken frontend API path for LLM report generation.
- Device detail page calls `/api/llm/generate-report`, but route implementation is `/api/llm` with action handling via query params.
- Current button path will 404.
- Refs: `frontend/src/app/devices/[id]/page.tsx:123`, `frontend/src/app/api/llm/route.ts:86`, `frontend/src/app/api/llm/route.ts:90`.

6. [MEDIUM] ECG report branch is inconsistent with actual model labels.
- LLM report template checks for ECG `Abnormal`, but inference emits `Normal|SVEB|VEB|Fusion|Unknown`.
- Abnormal ECG narratives will be skipped for real non-normal labels.
- Refs: `frontend/src/app/api/llm/route.ts:519`, `inference/app/inference.py:259`, `inference/app/inference.py:264`.

7. [MEDIUM] Debug simulation endpoint is unauthenticated while adjacent operational endpoints are token-protected.
- `/config` and `/metrics` call `require_internal_token(request)`, but `/simulate` does not.
- Refs: `inference/app/main.py:188`, `inference/app/main.py:196`, `inference/app/main.py:217`, `inference/app/main.py:225`, `inference/app/main.py:250`.

8. [LOW] `device-auth` returns a non-cryptographic token format (`device_<id>_<timestamp>`).
- If this function is used in production auth flow, token forgery/replay risk is high.
- It should issue signed JWT or short-lived opaque token validated server-side.
- Refs: `supabase/functions/device-auth/index.ts:77`, `supabase/functions/device-auth/index.ts:78`, `supabase/functions/device-auth/index.ts:98`.

## Checks Run

1. GitNexus `context`/`impact`/`query` across MQTT ingestion, inference, LLM API, and device/session UI flows.
2. Frontend type check passed with `npx tsc --noEmit --incremental false`.
3. `next lint` could not complete in read-only sandbox (`EPERM` on `.next` cache).

## Suggestions

1. Fix the three backend lifecycle/concurrency items first (`_run_sync_in_executor`, buffer synchronization, done-state transitions), then add integration tests for PCG-only, ECG-only, and dual-modality completion ordering.
2. Patch the frontend security/behavior issues next (export HTML escaping/sanitization, LLM endpoint path, ECG label mapping).
3. Decide whether `device-auth` is active; if yes, replace token generation with signed/validated tokens and add rate limiting.
