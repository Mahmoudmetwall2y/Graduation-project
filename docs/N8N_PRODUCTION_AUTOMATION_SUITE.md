# AscultiCor Production n8n Automation Suite

## Responsibility boundary

n8n coordinates retries, notifications, reconciliation, escalation, quality reporting, and human follow-up. It does not process raw ECG/PCG streams, make clinical decisions, authenticate devices, or directly install firmware. Those responsibilities remain in the application and device services.

## Consolidated architecture

| Workflow | Responsibility | Schedule |
| --- | --- | --- |
| 00 — Connectivity Diagnostics | Frontend, inference, Supabase, storage, and email readiness | Manual |
| 01 — AI Report Pipeline | Pending report processing, persistence, and delivery | Every minute |
| 02 — Processing Reliability | Stalled-session recovery; report dead-letter detection | Every 2 min; every 5 min |
| 03 — Clinical Alert Management | Alert creation, acknowledgement tracking, and escalation | Every 2 min |
| 04 — Device and OTA Management | OTA dispatch and fleet-health reconciliation | Every 2 min |
| 05 — Data Integrity and Research Quality | Storage-object verification; research-quality report | Every 6 hours; Monday 09:00 |
| 06 — Operations Intelligence | Security/operations correlation; daily digest | Every 5 min; daily 09:00 |
| 07 — Shared Failure Handler | Audit and notify on unhandled workflow failures | Error trigger |

All schedules use `Africa/Cairo`. Merged workflows use independent branches: a failure in or timing of one schedule does not make another schedule wait.

## Migration from the previous 00–10 suite

1. Keep the old workflows inactive while importing the new files.
2. Import workflows `00` through `07` from `n8n/workflows/`.
3. Assign the existing Gmail OAuth credential to every Gmail node.
4. In workflow settings, configure `07 - Shared Workflow Failure Handler` as the **Error Workflow** for workflows `00` through `06`.
5. Test every workflow and every branch manually.
6. Deactivate and then delete the old imported workflows `02` through `10` only after the replacement tests pass.
7. Activate the new schedules one workflow at a time and inspect the first execution.

Generated exports are intentionally inactive. Importing them cannot silently start recovery, escalation, or OTA actions.

## Expected tests

### 02 — Processing Reliability

The Manual Trigger runs both branches. For session recovery, create a disposable session in `created` state older than five minutes; the run must change it to `error`, set `ended_at`, and audit `session_recovered_to_error` once. For dead-letter handling, use a disposable `llm_reports` row with `status=error` and exhausted retries; the first run must audit and notify once, while later runs must not duplicate the notification.

### 03 — Clinical Alert Management

Use a qualifying prediction or session error. Confirm a deduplicated `device_alerts` row appears. Resolve it through the Alerts page to acknowledge it. An unresolved critical alert older than 30 minutes should receive one escalation with `metadata.escalated_at` recorded.

### 04 — Device and OTA Management

Queue a firmware deployment for a non-critical test device. Confirm dispatch-state changes and device-health reconciliation. Never test OTA using the only available hardware unit.

### 05 — Data Integrity and Research Quality

The storage branch samples recent `recordings` rows and verifies that referenced Supabase Storage objects are readable and non-empty. The weekly branch reports session totals, failures, missing ECG/PCG prediction pairs, Unknown ECG outputs, and exact model versions. These are engineering indicators, not clinical-validation metrics.

### 06 — Operations Intelligence

The security branch correlates service and queue health with audit spikes, unacknowledged starts, workflow failures, and firmware failures. The daily branch refreshes recording summaries before creating the operational digest. Tune security thresholds using observed baseline traffic.

### 07 — Shared Workflow Failure Handler

Attach this workflow in the settings of every other workflow. Test it using a disposable workflow containing an intentionally failing node. It must record `n8n_workflow_failed` with workflow/execution context and send one operational notification.

## AI and multi-agent policy

Do not use autonomous agents for clinical classification, severity, retry eligibility, database mutation, alert acknowledgement, or OTA approval. A tightly scoped language-model step may summarize already verified operational metrics, but deterministic rules remain authoritative. Multi-agent research analysis can be considered later behind structured inputs, schema validation, audit logs, and human review.

## Safety and operations

- Keep `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` only because reviewed Code nodes read required container variables; restrict editor access to trusted administrators.
- Keep the `x-internal-token` route protection and rotate the token if disclosed.
- Never place Supabase service-role keys, Gmail tokens, patient secrets, or device secrets in workflow JSON.
- Review n8n execution retention and avoid retaining patient-identifying payloads.
- The storage workflow complements but does not replace encrypted server backup verification and restore testing.
