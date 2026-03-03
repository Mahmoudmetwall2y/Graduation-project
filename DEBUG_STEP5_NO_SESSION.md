# Debug Step 5: No Session Data in UI

Use this guide when the simulator runs but the session page does not show live updates or predictions.

## 1) Verify session identifiers and topic scope
- Confirm you used the full session UUID (not truncated).
- Confirm `<ORG_ID>` and `<DEVICE_ID>` in simulator command match the device/session in UI.
- Confirm simulator broker auth uses `MQTT_USERNAME` and `MQTT_PASSWORD` from `.env`.

## 2) Check broker connectivity and auth
Run:
```bash
docker-compose logs --tail=80 mosquitto
```

Expected:
- Client connect entries for simulator and inference service.
- No auth failures (`not authorised`, `bad username or password`).

## 3) Check inference ingestion logs
Run:
```bash
docker-compose logs --tail=120 inference
```

Expected sequence:
- Session buffer created/updated for incoming chunks.
- Session completion/finalization event.
- Prediction insert logs or processing completion logs.

If missing:
- Verify simulator topic format:
  - `org/<org_id>/device/<device_id>/session/<session_id>/ecg`
  - `org/<org_id>/device/<device_id>/session/<session_id>/pcg`
- Verify inference env vars in container:
```bash
docker-compose exec inference sh -lc "env | sort | rg 'MQTT_|SUPABASE_|INFERENCE_INTERNAL_TOKEN|ENABLE_DEMO_MODE'"
```

## 4) Check session and prediction rows in Supabase
Run in SQL Editor:
```sql
SELECT id, org_id, device_id, status, created_at, ended_at
FROM public.sessions
ORDER BY created_at DESC
LIMIT 10;

SELECT session_id, modality, created_at
FROM public.predictions
ORDER BY created_at DESC
LIMIT 20;

SELECT session_id, created_at, metrics_json
FROM public.live_metrics
ORDER BY created_at DESC
LIMIT 20;
```

If no prediction rows:
- Confirm session reached `done`.
- Confirm inference logs show end-of-session processing.

## 5) Validate frontend data path
Run:
```bash
curl -sS "http://localhost:3000/api/health"
```

Then open browser DevTools Network tab on session page and verify:
- Session details request succeeds.
- Predictions request succeeds.
- No `401`/`403` from Supabase-backed requests.

## 6) Common fixes
- Restart stack:
```bash
docker-compose down
docker-compose up -d --build
```
- Recreate a fresh session in UI and rerun simulator with the new full session UUID.
- Re-check `.env` values and ensure both frontend/inference containers picked up latest env.

## 7) Escalation bundle
If still failing, collect and share:
- `docker-compose ps`
- `docker-compose logs --tail=200 mosquitto inference frontend`
- Session UUID, org ID, device ID used in simulator command
- Screenshot of session page state
