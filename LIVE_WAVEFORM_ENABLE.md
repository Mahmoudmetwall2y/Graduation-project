# Enable Live Waveforms (PCG/ECG)

The UI was showing static waveforms because it only used simulated data.
I added live waveform support.

## What changed

Backend:
- Inference now includes a rolling waveform window in `live_metrics.metrics_json.waveform`.

Frontend:
- Session page polls `live_metrics` and renders real waveform data when available.
- Falls back to simulated waveform if live data is missing.

## Files changed

- `inference/app/mqtt_handler.py`
- `frontend/src/app/session/[id]/page.tsx`

## Steps to apply

1) Rebuild inference + frontend:
```bash
docker-compose up -d --build inference frontend
```

2) Create a session in the UI and copy the full session UUID.

3) Run the simulator:
```bash
cd simulator
py -3.11 demo_publisher.py --broker localhost --port 1883 --username asculticor --password asculticor1234 --org-id 00000000-0000-0000-0000-000000000001 --device-id 7d8d7b9e-a9f9-4acf-8497-fcc6f71e81cf --session-id 067d9d07-bd23-4cb4-a3ee-d2abea8a1f11
```

## Expected result

- The ECG/PCG charts move live while streaming.
- Badge shows "Live" during streaming.

If it still doesn’t move, capture:
- `docker-compose logs --tail=50 inference`
- a short description of the waveform section in the UI
