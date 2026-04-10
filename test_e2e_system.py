"""
==============================================================================
AscultiCor — End-to-End System Integration Test
==============================================================================
Simulates real sensor hardware by publishing MQTT messages through the full
pipeline:  Sensor → MQTT Broker → Inference Service → Model Prediction

Uses REAL audio/ECG data from the datasets to produce real predictions, just
like the actual stethoscope hardware would.

Usage:
    python test_e2e_system.py

What it tests:
    1. MQTT connectivity to the broker
    2. Unified session: start_pcg → stream audio → end_pcg → inference
    3. Within same session: start_ecg → stream ECG → end_ecg → inference
    4. Session is linked to a real patient in the database
    5. System response via inference container logs

Key Fix (v2):
    - Previous version created TWO separate sessions (one PCG, one ECG) leading
      to the PCG session being created and then failing to pair with ECG, causing
      an 'error' status. Now a SINGLE session handles both modalities, matching
      how real hardware works.
    - Patient is now linked to the session for clinical context.
==============================================================================
"""

import os
import sys
import json
import time
import uuid
import struct
import numpy as np
import urllib.request
import urllib.error
import paho.mqtt.client as mqtt
from pathlib import Path
from datetime import datetime

# ─── Configuration ────────────────────────────────────────────────────────────

MQTT_BROKER  = "localhost"
MQTT_PORT    = 1883
MQTT_USER    = os.getenv("MQTT_USERNAME", "asculticor")
MQTT_PASS    = os.getenv("MQTT_PASSWORD", "asculticor1234")

PROJECT_ROOT = Path(__file__).parent.resolve()
DATASETS_DIR = PROJECT_ROOT / "datasets"

# Real device identity from DB
ORG_ID       = "00000000-0000-0000-0000-000000000001"
DEVICE_ID    = "3efd0d7a-6ff0-41db-b499-2b9c42dfa612"
CREATED_BY   = "4d4187e3-c290-4ea0-9edd-87f1a0d901fa"

# Colors for terminal output
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


def banner(text):
    w = 65
    print(f"\n{CYAN}{'#' * w}")
    print(f"  {text}")
    print(f"{'#' * w}{RESET}\n")


def step(n, text):
    print(f"{BOLD}  [{n}] {text}{RESET}")


def ok(text):
    print(f"  {GREEN}[OK] {text}{RESET}")


def warn(text):
    print(f"  {YELLOW}[WARN] {text}{RESET}")


def fail(text):
    print(f"  {RED}[FAIL] {text}{RESET}")


def parse_env():
    env_path = PROJECT_ROOT / ".env"
    env_vars = {}
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    k, v = line.strip().split('=', 1)
                    env_vars[k] = v
    return env_vars


def _supabase_request(url, key, path, method="GET", body=None, params=None):
    """Helper for Supabase REST API calls."""
    full_url = f"{url}/rest/v1/{path}"
    if params:
        full_url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    data = json.dumps(body).encode('utf-8') if body else None
    req = urllib.request.Request(full_url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        content = resp.read()
        return json.loads(content) if content else []
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f"Supabase HTTP {e.code} on {method} {path}: {error_body}") from e


def ensure_test_patient(url, key):
    """
    Find or create a stable 'E2E Test Patient' for automated testing.
    Returns the patient ID.
    """
    mrn = "E2E-TEST-001"
    results = _supabase_request(
        url, key, "patients",
        params={"mrn": f"eq.{mrn}", "org_id": f"eq.{ORG_ID}", "select": "id,full_name,mrn"}
    )
    if results:
        patient = results[0]
        ok(f"Found test patient: {patient['full_name']} (ID: {patient['id'][:8]}...)")
        return patient['id']

    # Create a new stable test patient
    created = _supabase_request(
        url, key, "patients", method="POST",
        body={
            "org_id": ORG_ID,
            "full_name": "E2E Test Patient",
            "mrn": mrn,
            "dob": "1990-01-15",
            "sex": "male",
        }
    )
    if isinstance(created, list) and created:
        patient_id = created[0]['id']
        ok(f"Created test patient: E2E Test Patient (ID: {patient_id[:8]}...)")
        return patient_id

    raise RuntimeError(f"Failed to create test patient: {created}")


def create_db_session(session_id, patient_id=None):
    """Create session in Supabase, optionally attaching a patient."""
    env_vars = parse_env()
    url = env_vars.get("SUPABASE_URL")
    key = env_vars.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        warn("No Supabase credentials — skipping DB session creation")
        return

    body = {
        "id": session_id,
        "org_id": ORG_ID,
        "device_id": DEVICE_ID,
        "created_by": CREATED_BY,
        "status": "created",
    }
    if patient_id:
        body["patient_id"] = patient_id

    req = urllib.request.Request(
        f"{url}/rest/v1/sessions",
        data=json.dumps(body).encode('utf-8'),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=10)
        patient_label = f"patient {patient_id[:8]}..." if patient_id else "no patient"
        ok(f"DB session created ({patient_label})")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        warn(f"DB session creation HTTP {e.code}: {error_body}")
    except urllib.error.URLError as e:
        warn(f"DB session creation failed: {getattr(e, 'reason', e)}")


def get_session_status(session_id):
    """Fetch the current status of a session from Supabase."""
    env_vars = parse_env()
    url = env_vars.get("SUPABASE_URL")
    key = env_vars.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    try:
        results = _supabase_request(
            url, key, "sessions",
            params={"id": f"eq.{session_id}", "select": "id,status,patient_id,ended_at"}
        )
        return results[0] if results else None
    except Exception as e:
        warn(f"Could not fetch session status: {e}")
        return None


# ─── MQTT Client Setup ───────────────────────────────────────────────────────

received_messages = []


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        ok("Connected to MQTT broker")
        client.subscribe(f"org/{ORG_ID}/device/{DEVICE_ID}/session/+/result/#", qos=1)
        client.subscribe(f"org/{ORG_ID}/device/{DEVICE_ID}/session/+/status", qos=1)
    else:
        fail(f"MQTT connection failed with code {rc}")


def on_message(client, userdata, msg):
    received_messages.append({
        'topic': msg.topic,
        'payload': msg.payload,
        'timestamp': datetime.now().isoformat()
    })
    ok(f"Received: {msg.topic} ({len(msg.payload)} bytes)")


def create_mqtt_client():
    try:
        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
            client_id=f"e2e-test-{uuid.uuid4().hex[:8]}"
        )
    except (AttributeError, TypeError):
        client = mqtt.Client(client_id=f"e2e-test-{uuid.uuid4().hex[:8]}")
    client.username_pw_set(MQTT_USER, MQTT_PASS)
    client.on_connect = on_connect
    client.on_message = on_message
    return client


# ─── Audio Data Generators ────────────────────────────────────────────────────

def load_real_pcg_audio():
    wav_dir = DATASETS_DIR / "archive2" / "set_a"
    if not wav_dir.exists():
        warn("PASCAL dataset not found, generating synthetic PCG")
        return generate_synthetic_pcg()

    murmur_files = sorted(wav_dir.glob("murmur__*.wav"))
    normal_files = sorted(wav_dir.glob("normal__*.wav"))

    if murmur_files:
        target = murmur_files[0]
        label = "murmur"
    elif normal_files:
        target = normal_files[0]
        label = "normal"
    else:
        wavs = sorted(wav_dir.glob("*.wav"))
        if wavs:
            target = wavs[0]
            label = "unknown"
        else:
            warn("No WAV files found, generating synthetic PCG")
            return generate_synthetic_pcg()

    try:
        import soundfile as sf
        audio, sr = sf.read(str(target), dtype='int16')
        if len(audio.shape) > 1:
            audio = audio[:, 0]
        ok(f"Loaded real PCG: {target.name} (label={label}, {len(audio)} samples @ {sr}Hz)")
        return audio.tobytes(), sr, label
    except Exception as e:
        warn(f"Failed to load {target}: {e}, using synthetic")
        return generate_synthetic_pcg()


def generate_synthetic_pcg():
    sr = 22050
    duration = 5
    t = np.linspace(0, duration, sr * duration, dtype=np.float32)
    signal = np.zeros_like(t)
    heart_rate_hz = 1.2

    for beat in range(int(duration * heart_rate_hz)):
        beat_start = beat / heart_rate_hz
        s1_center = beat_start + 0.05
        s1_env = np.exp(-((t - s1_center) ** 2) / (2 * 0.015 ** 2))
        signal += s1_env * np.sin(2 * np.pi * 50 * t) * 0.8
        s2_center = beat_start + 0.35
        s2_env = np.exp(-((t - s2_center) ** 2) / (2 * 0.010 ** 2))
        signal += s2_env * np.sin(2 * np.pi * 80 * t) * 0.6

    signal += np.random.normal(0, 0.02, len(signal))
    signal = signal / np.max(np.abs(signal)) * 0.9
    audio_int16 = (signal * 32767).astype(np.int16)
    ok(f"Generated synthetic PCG: {len(audio_int16)} samples @ {sr}Hz")
    return audio_int16.tobytes(), sr, "synthetic-normal"


def load_real_ecg_data():
    import pandas as pd
    mitbih_dir = DATASETS_DIR / "archive4" / "mitbih_database"

    if not mitbih_dir.exists():
        warn("MIT-BIH dataset not found, generating synthetic ECG")
        return generate_synthetic_ecg()

    csv_files = sorted(mitbih_dir.glob("*.csv"))
    record_csvs = [f for f in csv_files if not f.stem.endswith("annotations")]

    if not record_csvs:
        return generate_synthetic_ecg()

    target = record_csvs[0]
    for abnormal in ["200.csv", "105.csv", "203.csv"]:
        abnormal_path = mitbih_dir / abnormal
        if abnormal_path in record_csvs:
            target = abnormal_path
            break
    try:
        df = pd.read_csv(target, header=None, skiprows=2)
        signal = df.iloc[:, 1].values.astype(np.float32) if df.shape[1] >= 3 else df.iloc[:, 0].values.astype(np.float32)
        sr = 360
        n_samples = min(sr * 10, len(signal))
        signal = signal[:n_samples]
        signal = signal / (np.max(np.abs(signal)) + 1e-8) * 0.9
        audio_int16 = (signal * 32767).astype(np.int16)
        ok(f"Loaded real ECG: record {target.stem} ({n_samples} samples @ {sr}Hz)")
        return audio_int16.tobytes(), sr
    except Exception as e:
        warn(f"Failed to load ECG: {e}")
        return generate_synthetic_ecg()


def generate_synthetic_ecg():
    sr = 500
    duration = 10
    n = sr * duration
    t = np.linspace(0, duration, n, dtype=np.float32)
    signal = np.zeros(n)
    hr = 1.2

    for beat in range(int(duration * hr)):
        offset = beat / hr
        p  = np.exp(-((t - (offset + 0.1)) ** 2) / (2 * 0.02 ** 2)) * 0.15
        q  = -np.exp(-((t - (offset + 0.2)) ** 2) / (2 * 0.005 ** 2)) * 0.2
        r  = np.exp(-((t - (offset + 0.22)) ** 2) / (2 * 0.008 ** 2)) * 1.0
        s  = -np.exp(-((t - (offset + 0.24)) ** 2) / (2 * 0.005 ** 2)) * 0.3
        tw = np.exp(-((t - (offset + 0.4)) ** 2) / (2 * 0.03 ** 2)) * 0.3
        signal += p + q + r + s + tw

    signal += np.random.normal(0, 0.02, n)
    signal = signal / np.max(np.abs(signal)) * 0.9
    audio_int16 = (signal * 32767).astype(np.int16)
    ok(f"Generated synthetic ECG: {n} samples @ {sr}Hz")
    return audio_int16.tobytes(), sr


# ─── Unified Session Test ─────────────────────────────────────────────────────

def test_unified_session(client, patient_id):
    """
    Run a SINGLE session that exercises BOTH PCG and ECG in sequence.

    KEY FIX: Previously two separate sessions were created — the PCG session went
    to 'error' status while ECG session went to 'done'. Now both modalities share
    one session_id, matching real hardware behavior.
    """
    banner("UNIFIED SESSION TEST — PCG + ECG (single session)")

    session_id = str(uuid.uuid4())
    topic_base = f"org/{ORG_ID}/device/{DEVICE_ID}/session/{session_id}"

    print(f"  Session ID: {CYAN}{session_id}{RESET}")
    print(f"  Patient:    {CYAN}{patient_id[:8] + '...' if patient_id else 'None'}{RESET}")
    print(f"  View at:    http://localhost:3000/session/{session_id}")

    step(0, "Creating DB session (with patient link)...")
    create_db_session(session_id, patient_id)

    # ─── PCG PHASE ────────────────────────────────────────────────────────────
    banner("PHASE 1 — PCG Heart Sound")

    step(1, "Loading PCG audio data...")
    pcg_data, pcg_sr, pcg_label = load_real_pcg_audio()
    print(f"       Source label: {pcg_label}")
    print(f"       Data size: {len(pcg_data):,} bytes ({len(pcg_data)//2:,} samples @ {pcg_sr}Hz)")

    step(2, "Sending start_pcg...")
    client.publish(f"{topic_base}/meta", json.dumps({
        "type": "start_pcg",
        "sample_rate_hz": pcg_sr,
        "format": "pcm_s16le",
        "valve_position": "MV",
        "device_fw": "1.0.0-test",
        "patient_age": 35,
        "recording_position": "supine"
    }), qos=1).wait_for_publish()
    ok("Published start_pcg")
    time.sleep(0.5)

    step(3, "Streaming PCG audio chunks...")
    CHUNK_SIZE = 4096
    total_chunks = 0
    for i in range(0, len(pcg_data), CHUNK_SIZE):
        client.publish(f"{topic_base}/pcg", pcg_data[i:i + CHUNK_SIZE], qos=0)
        total_chunks += 1
        time.sleep(0.05)
    ok(f"Streamed {total_chunks} PCG chunks ({len(pcg_data):,} bytes)")
    time.sleep(0.5)

    step(4, "Sending end_pcg...")
    client.publish(f"{topic_base}/meta", json.dumps({"type": "end_pcg"}), qos=1).wait_for_publish()
    ok("Published end_pcg — PCG inference triggered")

    step(5, "Waiting for PCG inference (~8s)...")
    time.sleep(8)

    # Check intermediate status
    status_info = get_session_status(session_id)
    if status_info:
        current = status_info.get('status', '?')
        if current == 'error':
            fail(f"Session went to ERROR after PCG! Check: docker logs asculticor-inference")
        else:
            ok(f"Post-PCG status: {current}")

    # ─── ECG PHASE ────────────────────────────────────────────────────────────
    banner("PHASE 2 — ECG Arrhythmia Detection (same session)")

    step(6, "Loading ECG data...")
    ecg_data, ecg_sr = load_real_ecg_data()
    print(f"       Data size: {len(ecg_data):,} bytes ({len(ecg_data)//2:,} samples @ {ecg_sr}Hz)")

    step(7, "Sending start_ecg...")
    client.publish(f"{topic_base}/meta", json.dumps({
        "type": "start_ecg",
        "sample_rate_hz": ecg_sr,
        "format": "pcm_s16le",
        "lead": "MLII"
    }), qos=1).wait_for_publish()
    ok("Published start_ecg")
    time.sleep(0.5)

    step(8, "Streaming ECG data chunks...")
    ECG_CHUNK = 2048
    total_ecg = 0
    for i in range(0, len(ecg_data), ECG_CHUNK):
        client.publish(f"{topic_base}/ecg", ecg_data[i:i + ECG_CHUNK], qos=0)
        total_ecg += 1
        time.sleep(0.05)
    ok(f"Streamed {total_ecg} ECG chunks ({len(ecg_data):,} bytes)")
    time.sleep(0.5)

    step(9, "Sending end_ecg...")
    client.publish(f"{topic_base}/meta", json.dumps({"type": "end_ecg"}), qos=1).wait_for_publish()
    ok("Published end_ecg — ECG inference triggered")

    step(10, "Waiting for ECG inference (~8s)...")
    time.sleep(8)

    # Final status
    final = get_session_status(session_id)
    if final:
        status = final.get('status', '?')
        patient_linked = bool(final.get('patient_id'))
        if status == 'done':
            ok(f"Final session status: done [DONE]")
        elif status == 'error':
            fail(f"Final session status: ERROR — check inference logs")
        else:
            warn(f"Final session status: {status}")
        ok(f"Patient linked: {'YES [OK]' if patient_linked else 'NO'}")

    return session_id


def test_heartbeat(client):
    banner("HEARTBEAT TEST")
    topic = f"org/{ORG_ID}/device/{DEVICE_ID}/session/0/heartbeat"
    step(1, "Sending heartbeat...")
    payload = json.dumps({"timestamp": datetime.utcnow().isoformat(), "battery": 85})
    client.publish(topic, payload, qos=0)
    ok("Heartbeat sent")
    time.sleep(1)


def check_health():
    banner("HEALTH CHECK")
    import subprocess

    step(1, "Querying /health endpoint...")
    try:
        result = subprocess.run(
            ["docker", "exec", "asculticor-inference", "curl", "-s", "http://localhost:8000/health"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            health = json.loads(result.stdout)
            status = health.get("status", "unknown")
            models_loaded = health.get("models_loaded", 0)
            models_total = health.get("models_total", 0)
            mqtt_ok = health.get("mqtt_connected", False)

            (ok if status == "healthy" else warn)(f"Status: {status}")
            ok(f"Models: {models_loaded}/{models_total} loaded")
            (ok if mqtt_ok else fail)("MQTT: " + ("connected" if mqtt_ok else "disconnected"))

            for name, detail in health.get("models", {}).items():
                (ok if detail.get("loaded") else fail)(
                    f"  {name}: {'loaded' if detail.get('loaded') else 'FAILED — ' + detail.get('error', 'unknown')}"
                )

            return health
        else:
            fail(f"curl failed: {result.stderr}")
            return None
    except Exception as e:
        fail(f"Health check failed: {e}")
        return None


def check_inference_logs():
    banner("INFERENCE LOGS VERIFICATION")
    import subprocess

    step(1, "Fetching last 50 lines of inference logs...")
    try:
        result = subprocess.run(
            ["docker", "logs", "--tail", "50", "asculticor-inference"],
            capture_output=True, text=True, timeout=10
        )
        logs = result.stdout + result.stderr

        checks = {
            "PCG buffer created":      "Created buffer for pcg session",
            "PCG chunks received":     "pcg",
            "PCG inference triggered": "PCG inference completed",
            "ECG buffer created":      "Created buffer for ecg session",
            "ECG inference triggered": "ECG inference completed",
            "Murmur detection":        "Murmur detected",
        }

        found_any = False
        for label, pattern in checks.items():
            if pattern.lower() in logs.lower():
                ok(f"{label}")
                found_any = True
            else:
                warn(f"{label} — not found in recent logs")

        if not found_any:
            warn("No inference events found in recent logs")
            print("\n  Last 10 lines of logs:")
            for line in logs.strip().split('\n')[-10:]:
                print(f"    {line}")

        if "Error processing PCG" in logs or "pcg_inference_failed" in logs:
            fail("PCG inference error detected in logs!")
            for line in logs.split('\n'):
                if 'pcg' in line.lower() and ('error' in line.lower() or 'fail' in line.lower()):
                    print(f"    {RED}{line}{RESET}")

        return logs
    except Exception as e:
        fail(f"Failed to read logs: {e}")
        return ""


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    banner("AscultiCor - End-to-End Integration Test v2")
    print(f"  MQTT Broker:  {MQTT_BROKER}:{MQTT_PORT}")
    print(f"  Org ID:       {ORG_ID}")
    print(f"  Device ID:    {DEVICE_ID}")
    print(f"  Timestamp:    {datetime.now().isoformat()}")

    start_time = time.time()

    health = check_health()
    if not health:
        fail("System not healthy — aborting")
        sys.exit(1)

    # ── Set up test patient ──
    banner("Patient Setup")
    env_vars = parse_env()
    supabase_url = env_vars.get("SUPABASE_URL")
    supabase_key = env_vars.get("SUPABASE_SERVICE_ROLE_KEY")

    patient_id = None
    if supabase_url and supabase_key:
        try:
            patient_id = ensure_test_patient(supabase_url, supabase_key)
        except Exception as e:
            warn(f"Could not ensure test patient: {e} — running without patient")
    else:
        warn("No Supabase credentials — session will run without patient")

    # ── Connect MQTT ──
    banner("Connecting to MQTT Broker")
    client = create_mqtt_client()
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        client.loop_start()
        time.sleep(2)
        if not client.is_connected():
            fail("Failed to connect to MQTT broker")
            sys.exit(1)
    except Exception as e:
        fail(f"MQTT connection error: {e}")
        sys.exit(1)

    session_id = None
    try:
        session_id = test_unified_session(client, patient_id)
        test_heartbeat(client)
    finally:
        client.loop_stop()
        client.disconnect()

    logs = check_inference_logs()

    elapsed = time.time() - start_time
    banner("TEST SUMMARY")

    print(f"  Session ID:  {session_id}")
    print(f"  Patient ID:  {patient_id or 'N/A (not linked)'}")
    print(f"  Total time:  {elapsed:.1f}s")
    print(f"  View in UI:  http://localhost:3000/session/{session_id}")
    print()

    all_pass = True
    if "PCG inference completed" in (logs or ""):
        ok("PCG pipeline: PASS")
    else:
        warn("PCG pipeline: inference not confirmed in logs; may still be processing")
        all_pass = False

    if "ECG inference completed" in (logs or ""):
        ok("ECG pipeline: PASS")
    else:
        warn("ECG pipeline: inference not confirmed in logs")
        all_pass = False

    if "Murmur detected" in (logs or ""):
        ok("Severity pipeline: PASS — murmur severity analysis triggered")

    if session_id:
        final = get_session_status(session_id)
        if final:
            status = final.get('status', '?')
            print()
            if status == 'done':
                ok(f"Final DB status: done [OK]")
            elif status == 'error':
                fail(f"Final DB status: ERROR [FAIL] — run: docker logs asculticor-inference")
                all_pass = False
            else:
                warn(f"Final DB status: {status}")

    print(f"\n{'=' * 65}")
    if all_pass:
        print(f"  {GREEN}All tests passed!{RESET}")
    else:
        print(f"  {YELLOW}Some tests may need review — see warnings above{RESET}")
    print(f"  To debug: docker logs --tail 60 asculticor-inference")
    print(f"{'=' * 65}\n")


if __name__ == "__main__":
    main()
