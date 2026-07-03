# AscultiCor n8n Automation Suite

The importable JSON workflows in `workflows/` form AscultiCor's durable automation and human-operations layer. Raw ECG/PCG streaming, inference, authentication, and device safety remain in MQTT, FastAPI, Next.js, firmware, and Supabase.

## Workflow inventory

- `00-connectivity-check.json` — infrastructure and model readiness
- `01-process-pending-llm-reports.json` — report queue worker
- `02-session-failure-recovery.json` — closes stalled session states with audit evidence
- `03-report-dead-letter-queue.json` — detects exhausted report retries once
- `04-clinician-acknowledgement-escalation.json` — creates review alerts and escalates unresolved critical alerts
- `05-device-onboarding-ota-lifecycle.json` — OTA dispatch plus device-health reconciliation
- `06-backup-storage-integrity.json` — verifies recent recording rows have readable objects
- `07-weekly-research-data-quality.json` — missing-output and model-version quality report
- `08-shared-workflow-failure-handler.json` — n8n Error Trigger, audit record, and notification
- `09-security-operations-correlation.json` — service/queue monitoring correlated with audit anomalies
- `10-daily-operations-digest.json` — summary enrichment and daily operational digest

See `docs/N8N_PRODUCTION_AUTOMATION_SUITE.md` for import order, testing, activation, and the shared error-workflow configuration.

## Regenerate and validate

From the repository root:

```bash
python n8n/generate_workflows.py
python n8n/validate_workflows.py
```

Generated exports are inactive by default. Assign the Gmail OAuth credential, test each workflow manually, and activate schedules only after the expected database and email outcomes are confirmed.
