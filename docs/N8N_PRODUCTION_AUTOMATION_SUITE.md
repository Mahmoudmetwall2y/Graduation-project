# AscultiCor Production n8n Automation Suite

## Responsibility boundary

n8n coordinates retries, notifications, reconciliation, escalation, quality reporting, and human follow-up. It does not process raw ECG/PCG streams, make clinical decisions, authenticate devices, or directly install firmware. Those responsibilities remain in the application and device services.

## Import and activation order

1. Import workflows `00` through `10` from `n8n/workflows/`.
2. Assign the existing Gmail OAuth credential to every **Send Gmail** node.
3. Run `00 - AscultiCor Connectivity Check` manually.
4. Test `08 - Shared Workflow Failure Handler` manually by temporarily adding a failing node to a disposable workflow.
5. In n8n workflow settings, select workflow `08` as the **Error Workflow** for workflows `00–07`, `09`, and `10`.
6. Test workflows `01–07`, `09`, and `10` manually in numeric order.
7. Activate schedules only after each manual test produces the expected audit/database outcome.

All exports are intentionally inactive. Re-importing a generated file does not silently activate automation.

## Expected tests

### 02 — Session Processing Failure Recovery

Create a disposable session in `created` state older than five minutes. A manual run must atomically change it to `error`, set `ended_at`, and write `session_recovered_to_error` to `audit_logs`. A second run must not repeat the transition.

### 03 — Report Dead-Letter Queue

Use a disposable `llm_reports` row with `status=error` and `retry_count >= max_retries`. The first run writes `llm_report_dead_letter_notified` and sends one email. Later runs must not notify again for the same report.

### 04 — Clinician Acknowledgement and Escalation

Use a qualifying prediction or session error. The workflow creates a deduplicated `device_alerts` row. Resolve it in the Alerts page to acknowledge it. An unresolved critical alert older than 30 minutes receives one escalation and stores `metadata.escalated_at`.

### 05 — Device Onboarding and OTA Lifecycle

Queue a firmware deployment for an online test device. Confirm dispatch state changes and device-health reconciliation. Never test OTA with the only available hardware unit.

### 06 — Backup and Storage Integrity

Run after completed sessions exist. It samples recent `recordings` rows and verifies each referenced object is readable and non-empty. This complements—but does not replace—the server's encrypted restic backup verification.

### 07 — Weekly Research and Data Quality

Confirm the email reports session totals, errors, completed sessions missing an ECG/PCG prediction pair, Unknown ECG outputs, and the exact model versions observed. These are engineering quality indicators, not clinical validation metrics.

### 08 — Shared Workflow Failure Handler

The error workflow records `n8n_workflow_failed` in `audit_logs` with workflow name, execution ID, last node, and error. It then sends an operational notification. Configure it in every other workflow's settings.

### 09 — Security and Operations Correlation

The workflow combines inference/queue checks with recent audit signals such as bootstrap spikes, repeated unacknowledged starts, workflow failures, and failed firmware deployments. Thresholds are operational heuristics and must be tuned from observed baseline traffic.

### 10 — Daily Operations Digest and Enrichment

The workflow first refreshes `device_recording_summaries`, then sends the daily operational digest. This ordering ensures the digest follows the latest aggregate state.

## Safety and operations

- Keep `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` only because these reviewed Code nodes read required container variables. Restrict editor access to trusted administrators.
- Keep the `x-internal-token` route protection and rotate it if disclosed.
- Never put the Supabase service-role key, Gmail token, or device secret inside workflow JSON.
- Do not use an AI Agent node for alert severity, retry eligibility, OTA approval, or clinical classification. AI-generated prose may summarize already-structured results, but deterministic application rules remain authoritative.
- Review n8n execution retention and remove patient-identifying payloads from execution data wherever possible.
