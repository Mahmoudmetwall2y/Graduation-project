# AscultiCor n8n Workflows

This folder contains importable n8n workflow templates for the AscultiCor automation layer.

## Files

- `workflows/00-connectivity-check.json`
- `workflows/01-process-pending-llm-reports.json`
- `workflows/02-clinical-alert-notifications.json`
- `workflows/03-device-health-monitoring.json`
- `workflows/04-daily-digest.json`
- `workflows/05-recording-summary-enrichment.json`
- `workflows/06-ops-monitoring.json`
- `workflows/07-alert-escalation.json`

The JSON exports are generated from `generate_workflows.py`.

## Regenerate

Run from the repo root:

```bash
python n8n/generate_workflows.py
```

## Important

The workflows use n8n Code nodes and read runtime values from environment variables passed to the n8n container. Keep n8n access limited to trusted project members.
