# Real Data vs Demo Mode

Real hardware mode:

- AD8232 ECG sensor -> ESP32 -> MQTT -> inference -> Supabase -> dashboard
- MAX9814 PCG microphone -> ESP32 -> MQTT -> inference -> Supabase -> dashboard
- UI labels this as real hardware.

Simulator / testing mode:

- Labeled: "Simulator / testing mode - not real sensor data."
- Must not be used as clinical data.
- Use only for UI checks, training demos, or offline workflow validation.

Demo mode:

- `ENABLE_DEMO_MODE=true` produces deterministic mock inference values.
- Keep `ENABLE_DEMO_MODE=false` for real ESP32 demonstrations.

Final demo rule: show the setup wizard in real hardware mode, verify heartbeat/preflight, then record a real session.

