# AscultiCor n8n Workflow Implementation

This guide is for the teammate responsible for n8n automation. It assumes the Hostinger/Docker deployment is already running and n8n is reachable.

## 1. Server Configuration

Update the VPS with these files from the repo:

- `docker-compose.cloud.yml`
- `.env`
- `n8n/workflows/*.json`

The n8n container must receive these environment variables:

```env
CLAUDE_API_KEY=<your AgentRouter Claude key>
CLAUDE_BASE_URL=https://agentrouter.org
CLAUDE_MODEL=claude-sonnet-4-5-20250514
ASCULTICOR_ALERT_EMAIL_TO=<team inbox>
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
N8N_PUSH_BACKEND=sse
```

Patient-facing report and clinical alert emails use the linked patient's `patients.email` value when present. `ASCULTICOR_ALERT_EMAIL_TO` remains the fallback and the destination for operational workflows such as device health, daily digest, ops monitoring, and escalation. Emails are sent through the n8n Gmail node, so the sender is the Gmail account connected in n8n.

Restart n8n after changing `.env` or `docker-compose.cloud.yml`:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml up -d --force-recreate n8n
```

Use `--force-recreate nginx n8n` if you also changed the n8n public URL or proxy config.

## 2. Import Workflows

In n8n:

1. Open the n8n UI.
2. Create one Gmail OAuth credential: `Credentials` -> `Create Credential` -> `Gmail OAuth2`.
3. If Google asks for an OAuth redirect URL, use the redirect URL shown by n8n for that credential. For this VPS it is usually `https://srv1621744.hstgr.cloud:8443/rest/oauth2-credential/callback`.
4. Select `Import from File`.
5. Import the JSON files from `n8n/workflows/`.
6. Open each imported workflow and save it once.
7. For every `Send Gmail` node, select the Gmail OAuth credential.
8. Keep all workflows inactive until their manual test passes.

The workflows use environment variables from the n8n container for Supabase, Claude, internal AscultiCor URLs, and fallback alert email addresses. Gmail authentication is handled inside n8n credentials, not through SMTP environment variables.

## 3. Build Order

Start with one workflow at a time:

1. `00 - AscultiCor Connectivity Check`
2. `01 - Process Pending LLM Reports`
3. `02 - Clinical Alert Notifications`
4. `03 - Device Health Monitoring`
5. `04 - Daily Digest`
6. `05 - Recording Summary Enrichment`
7. `06 - Ops Monitoring`
8. `07 - Alert Escalation`

Do not activate a later workflow until the previous workflow has passed its manual test.

## 4. Workflow Tests

### 00 - Connectivity Check

Run manually.

Expected result:

- `http://inference:8000/health` succeeds.
- `http://frontend:3000/api/health` succeeds.
- Supabase `llm_reports` query succeeds.
- Email arrives with subject `AscultiCor n8n connectivity OK`.

### 01 - Process Pending LLM Reports

Queue a report from the AscultiCor app, then run the workflow manually.

Expected result:

- `llm_reports.status` moves from `pending` to `generating` to `completed`.
- `report_text` is filled with Claude output.
- `model_name` becomes `claude`.
- `model_version` becomes `claude-sonnet-4-5-20250514`.
- If the linked patient has an email, the report email is sent to that address.
- The session report page shows the completed report.

After it works manually, activate the workflow schedule.

### 02 - Clinical Alert Notifications

Use a session that has a PCG `Murmur`, ECG `Abnormal`, or session `error`.

Expected result:

- One `device_alerts` row is created.
- Running the workflow again does not create a duplicate unresolved alert.
- Email arrives at the linked patient email when present, otherwise at the team fallback inbox.

### 03 - Device Health Monitoring

Use a device with stale `last_seen_at`, weak RSSI, low heap, or positive error count.

Expected result:

- A relevant `device_alerts` row is created.
- If fresh telemetry appears, unresolved offline alerts are resolved.

### 04 - Daily Digest

Run manually.

Expected result:

- Email arrives with totals for sessions, completed sessions, error sessions, murmur predictions, abnormal ECG predictions, unresolved alerts, and offline devices.

### 05 - Recording Summary Enrichment

Run manually after at least one completed session exists.

Expected result:

- `device_recording_summaries` is upserted for recent device/date combinations.
- PCG, ECG, and report counts are populated.

### 06 - Ops Monitoring

Run manually.

Expected result:

- If all services are healthy and queues are normal, no email is sent.
- If a checked service fails or the queue is unhealthy, an ops email is sent.

### 07 - Alert Escalation

Use a test unresolved critical alert older than 30 minutes.

Expected result:

- One escalation email is sent.
- `metadata.escalated_at` and `metadata.escalation_channel` are written.
- Running the workflow again does not send another escalation for the same alert.

## 5. After LLM Workflow Is Stable

Once `01 - Process Pending LLM Reports` has processed several real reports successfully:

1. Disable the old GitHub Actions queue processor if it is still active.
2. Keep the app route that creates pending `llm_reports`.
3. Let n8n own report processing from `pending` onward.

## 6. Safety Notes

- Do not subscribe n8n to raw `pcg` or `ecg` MQTT topics.
- Do not give n8n accounts to untrusted users because these workflows can access service-role credentials through environment variables.
- Keep all medical wording educational and non-diagnostic.
- Rotate secrets that were pasted into chat or shared outside the VPS.
