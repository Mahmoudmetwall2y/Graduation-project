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
python simulator/asculticor_patient_simulator.py --config "$HOME\Downloads\asculticor-simulator.json"
```

In Git Bash, use forward slashes and do not add PowerShell's backtick line
continuation character:

```bash
python simulator/asculticor_patient_simulator.py --config "$HOME/Downloads/asculticor-simulator.json"
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
`combined_murmur`, `tachycardia`, `bradycardia`, `irregular_rhythm`,
`ventricular_ectopy`, `fusion_beats`, and `signal_artifact`.

Run `--list-scenarios` to print their descriptions. Signals are deterministic
for a given `--seed`, which makes regression tests reproducible.

## Choose model-domain signal specifications

Show the supported model inputs and labels:

```powershell
python simulator\asculticor_patient_simulator.py --describe-model-domain
```

Start with a named case and override individual specifications. For example:

```powershell
python simulator\asculticor_patient_simulator.py `
  --config "$HOME\Downloads\asculticor-simulator.json" `
  --scenario systolic_murmur `
  --heart-rate 96 `
  --ecg-class veb `
  --pcg-class murmur `
  --murmur-timing holosystolic `
  --murmur-shape plateau `
  --murmur-grade III/VI `
  --murmur-pitch high `
  --murmur-quality harsh `
  --valve-position MV
```

Supported ECG morphology targets are `normal`, `sveb`, `veb`, `fusion`, and
`unknown`. Supported PCG state targets are `normal`, `murmur`, and `artifact`.
Run `--help` for all ranges and choices.

These selections define synthetic signal characteristics; they do not force a
model prediction. A trained model may classify synthetic or out-of-distribution
signals differently. Use the simulator for pipeline and UI testing, not model
accuracy or clinical-performance claims.

The transport contract matches the current ESP32 firmware: ECG is signed
16-bit at 500 Hz in 500-sample chunks; PCG is signed 16-bit at the hardware
timer rate of 22,222 Hz in 512-sample chunks. Inference performs its normal
resampling and preprocessing.

## Credential safety

Downloaded simulator configuration files contain a device MQTT password. They
are ignored by Git and must never be committed, emailed, or shared. If one was
ever committed, revoke/recreate that virtual device and download a new config.
