# AscultiCor n8n Automation Suite

The importable workflows in `workflows/` form AscultiCor's durable automation and human-operations layer. Raw ECG/PCG streaming, inference, authentication, and device safety remain in MQTT, FastAPI, Next.js, firmware, and Supabase.

## Workflow inventory

- `00-connectivity-check.json` — infrastructure and model readiness diagnostics
- `01-process-pending-llm-reports.json` — auditable AI report queue worker
- `02-processing-reliability.json` — stalled-session recovery and report dead-letter handling on independent schedules
- `03-clinical-alert-management.json` — clinical review alerts, acknowledgement tracking, and critical escalation
- `04-device-ota-management.json` — device-health reconciliation and controlled OTA dispatch
- `05-data-integrity-research-quality.json` — six-hour storage verification and weekly research-quality reporting
- `06-operations-intelligence.json` — five-minute security/operations correlation and daily operations digest
- `07-shared-workflow-failure-handler.json` — central n8n Error Trigger, audit record, and notification

The merged workflows retain separate triggers and deterministic application actions. The consolidation reduces editor clutter without coupling clinical, firmware, or AI-report responsibilities.

See `docs/N8N_PRODUCTION_AUTOMATION_SUITE.md` for migration, testing, activation, and shared error-workflow configuration.

## Regenerate and validate

From the repository root:

```bash
python n8n/generate_workflows.py
python n8n/validate_workflows.py
```

On Windows, use `py -3` if `python` is not on `PATH`.

Generated exports are inactive by default. Assign the Gmail OAuth credential, test each branch manually, and activate schedules only after confirming the expected database and email outcomes.
