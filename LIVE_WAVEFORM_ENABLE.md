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
py -3.11 demo_publisher.py --broker localhost --port 1883 --username asculticor --password asculticor1234 --org-id 00000000-0000-0000-0000-000000000001 --device-id 8f50a7a1-0a89-4603-88a1-0e4d2ff06118 --session-id 4e838255-38de-4a34-a723-c49d4eeb0393
```

## Expected result

- The ECG/PCG charts move live while streaming.
- Badge shows "Live" during streaming.

If it still doesn’t move, capture:
- `docker-compose logs --tail=50 inference`
- a short description of the waveform section in the UI
