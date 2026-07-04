# AscultiCor Virtual Patient Simulator

This is a controlled synthetic-data tool for software and AI pipeline testing.
It is not a clinical signal source and its output must not be used for patient
care or model-performance claims.

The simulator behaves like an ESP32: it publishes retained device status,
waits for the normal dashboard start command, then streams raw ECG and PCG over
the production MQTT topics. The existing inference service stores recordings,
publishes live waveform frames, runs all models, and creates reports normally.

## One-time setup

1. In AscultiCor, sign in as admin and open **Devices -> Add Device**.
2. Create a **Virtual patient simulator** device.
3. Download the simulator configuration. Keep it private; it contains an MQTT
   password and is only displayed once.
4. Install the two simulator dependencies:

```powershell
python -m venv .venv-simulator
.\.venv-simulator\Scripts\Activate.ps1
pip install -r simulator\requirements.txt
```

## Run a case

Interactive case selector:

```powershell
python simulator\asculticor_patient_simulator.py --config "$HOME\Downloads\asculticor-simulator.json"
```

Or select a repeatable case directly:

```powershell
python simulator\asculticor_patient_simulator.py --config "$HOME\Downloads\asculticor-simulator.json" --scenario systolic_murmur
```

Keep the terminal running. When the device appears online, create a normal
session in AscultiCor, select this device and press **Start Session**. The ECG
and PCG traces will appear on the session page while data is streamed. After
the selected duration, the real inference and report workflows continue.

Available cases: `normal`, `systolic_murmur`, `diastolic_murmur`,
`combined_murmur`, `tachycardia`, `bradycardia`, and `irregular_rhythm`.

Run `--list-scenarios` to print their descriptions. Signals are deterministic
for a given `--seed`, which makes regression tests reproducible.
