#!/usr/bin/env python3
"""
Demo MQTT Publisher for AscultiCor
Simulates ESP32 device publishing PCG and ECG data.

Supports multiple cardiac scenarios:
- normal: Normal heart sounds (60 BPM)
- tachycardia: Fast heart rate (>100 BPM)
- bradycardia: Slow heart rate (<60 BPM)
- systolic_murmur: Heart murmur during systole
- diastolic_murmur: Heart murmur during diastole
- abnormal_ecg: Arrhythmia/abnormal ECG patterns

Usage:
    python demo_publisher.py                    # Normal heart (default)
    python demo_publisher.py --scenario tachycardia
    python demo_publisher.py --scenario systolic_murmur
    python demo_publisher.py --list-scenarios    # List all available scenarios
"""

import time
import json
import numpy as np
import paho.mqtt.client as mqtt
import uuid
import argparse
import sys

# Configuration
DEFAULT_BROKER = "localhost"
DEFAULT_PORT = 1883
DEFAULT_USERNAME = "asculticor"
DEFAULT_PASSWORD = "asculticor123"

# Device info (from seed data)
DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_DEVICE_ID = "00000000-0000-0000-0000-000000000004"

# Session ID (generate new for each run if not provided)
DEFAULT_SESSION_ID = str(uuid.uuid4())


# Scenario presets
SCENARIOS = {
    "normal": {
        "name": "Normal Heart",
        "description": "Normal heart sounds at 60 BPM",
        "pcg_bpm": 60,
        "ecg_bpm": 60,
        "has_murmur": False,
        "ecg_normal": True,
    },
    "tachycardia": {
        "name": "Tachycardia (Fast Heart Rate)",
        "description": "Fast heart rate >100 BPM",
        "pcg_bpm": 120,
        "ecg_bpm": 120,
        "has_murmur": False,
        "ecg_normal": True,
    },
    "bradycardia": {
        "name": "Bradycardia (Slow Heart Rate)",
        "description": "Slow heart rate <60 BPM",
        "pcg_bpm": 45,
        "ecg_bpm": 45,
        "has_murmur": False,
        "ecg_normal": True,
    },
    "systolic_murmur": {
        "name": "Systolic Heart Murmur",
        "description": "Murmur between S1 and S2 (70 BPM)",
        "pcg_bpm": 70,
        "ecg_bpm": 70,
        "has_murmur": True,
        "murmur_type": "systolic",
        "ecg_normal": True,
    },
    "diastolic_murmur": {
        "name": "Diastolic Heart Murmur",
        "description": "Murmur after S2 (65 BPM)",
        "pcg_bpm": 65,
        "ecg_bpm": 65,
        "has_murmur": True,
        "murmur_type": "diastolic",
        "ecg_normal": True,
    },
    "combined_murmur": {
        "name": "Combined Systolic & Diastolic Murmur",
        "description": "Murmurs in both phases (75 BPM)",
        "pcg_bpm": 75,
        "ecg_bpm": 75,
        "has_murmur": True,
        "murmur_type": "combined",
        "ecg_normal": True,
    },
    "abnormal_ecg": {
        "name": "Abnormal ECG (Arrhythmia)",
        "description": "Irregular heartbeat pattern",
        "pcg_bpm": 60,
        "ecg_bpm": 60,
        "has_murmur": False,
        "ecg_normal": False,
    },
    "afib": {
        "name": "Atrial Fibrillation",
        "description": "Irregularly irregular rhythm",
        "pcg_bpm": 80,
        "ecg_bpm": 80,
        "has_murmur": False,
        "ecg_normal": False,
        "ecg_afib": True,
    },
}


def generate_pcg_scenario(duration_sec=10, sample_rate=22050, scenario="normal"):
    """Generate synthetic PCG audio based on scenario."""
    print(f"Generating PCG: {scenario} - {duration_sec}s @ {sample_rate}Hz")
    
    config = SCENARIOS.get(scenario, SCENARIOS["normal"])
    heart_rate = config["pcg_bpm"] / 60.0
    
    samples = int(duration_sec * sample_rate)
    
    s1_freq = 150
    s2_freq = 200
    
    audio = np.zeros(samples)
    beat_period = 1.0 / heart_rate
    
    # For AFib, generate irregular beats
    if scenario == "afib":
        np.random.seed(42)
        intervals = np.random.exponential(beat_period, int(duration_sec / beat_period))
        intervals = np.cumsum(intervals)
        intervals = intervals[intervals < duration_sec]
        beat_times = intervals
    else:
        beat_times = np.arange(0, duration_sec, beat_period)
    
    for beat_time in beat_times:
        # S1 (systolic)
        s1_start = int(beat_time * sample_rate)
        s1_duration = int(0.05 * sample_rate)
        if s1_start + s1_duration < samples:
            s1 = np.sin(2 * np.pi * s1_freq * np.linspace(0, 0.05, s1_duration))
            s1 *= np.exp(-10 * np.linspace(0, 0.05, s1_duration))
            audio[s1_start:s1_start+s1_duration] += s1
        
        # S2 (diastolic)
        s2_start = int((beat_time + 0.3) * sample_rate)
        s2_duration = int(0.03 * sample_rate)
        if s2_start + s2_duration < samples:
            s2 = np.sin(2 * np.pi * s2_freq * np.linspace(0, 0.03, s2_duration))
            s2 *= np.exp(-15 * np.linspace(0, 0.03, s2_duration))
            audio[s2_start:s2_start+s2_duration] += s2 * 0.8
        
        # Add murmur
        if config.get("has_murmur"):
            murmur_type = config.get("murmur_type", "systolic")
            
            if murmur_type in ("systolic", "combined"):
                murmur_start = int((beat_time + 0.08) * sample_rate)
                murmur_duration = int(0.15 * sample_rate)
                if murmur_start + murmur_duration < samples:
                    murmur_freq = 250
                    murmur = np.sin(2 * np.pi * murmur_freq * np.linspace(0, 0.15, murmur_duration))
                    env = np.linspace(0, 1, murmur_duration // 2)
                    env = np.concatenate([env, np.linspace(1, 0, murmur_duration - murmur_duration // 2)])
                    murmur *= env * 0.4
                    audio[murmur_start:murmur_start+murmur_duration] += murmur
            
            if murmur_type in ("diastolic", "combined"):
                murmur_start = int((beat_time + 0.4) * sample_rate)
                murmur_duration = int(0.2 * sample_rate)
                if murmur_start + murmur_duration < samples:
                    murmur_freq = 180
                    murmur = np.sin(2 * np.pi * murmur_freq * np.linspace(0, 0.2, murmur_duration))
                    env = np.linspace(0, 1, murmur_duration // 2)
                    env = np.concatenate([env, np.linspace(1, 0, murmur_duration - murmur_duration // 2)])
                    murmur *= env * 0.3
                    audio[murmur_start:murmur_start+murmur_duration] += murmur
    
    # Add noise
    audio += 0.05 * np.random.randn(samples)
    
    # Normalize
    audio = audio / np.max(np.abs(audio))
    
    return audio


def generate_ecg_scenario(duration_sec=10, sample_rate=500, scenario="normal"):
    """Generate synthetic ECG based on scenario."""
    print(f"Generating ECG: {scenario} - {duration_sec}s @ {sample_rate}Hz")
    
    config = SCENARIOS.get(scenario, SCENARIOS["normal"])
    heart_rate = config["ecg_bpm"] / 60.0
    
    samples = int(duration_sec * sample_rate)
    
    ecg = np.zeros(samples)
    beat_period = 1.0 / heart_rate
    
    # For abnormal ECG scenarios, use irregular beats
    if scenario in ("abnormal_ecg", "afib"):
        np.random.seed(42)
        if scenario == "afib":
            intervals = np.random.exponential(beat_period, int(duration_sec / beat_period))
        else:
            # Irregular but not as erratic as AFib
            base_interval = beat_period
            intervals = []
            t = 0
            while t < duration_sec:
                intervals.append(t)
                t += base_interval + np.random.uniform(-0.15, 0.15)
        intervals = np.array(intervals)
        intervals = intervals[intervals < duration_sec]
        beat_times = intervals
    else:
        beat_times = np.arange(0, duration_sec, beat_period)
    
    for i, beat_time in enumerate(beat_times):
        # P wave
        p_start = int(beat_time * sample_rate)
        p_duration = int(0.08 * sample_rate)
        if p_start + p_duration < samples:
            ecg[p_start:p_start+p_duration] = 0.1 * np.sin(np.linspace(0, np.pi, p_duration))
        
        # QRS complex
        qrs_start = int((beat_time + 0.2) * sample_rate)
        qrs_duration = int(0.06 * sample_rate)
        if qrs_start + qrs_duration < samples:
            qrs = np.array([0, -0.1, 1.0, -0.2, 0])
            qrs_interp = np.interp(
                np.linspace(0, len(qrs)-1, qrs_duration),
                np.arange(len(qrs)),
                qrs
            )
            ecg[qrs_start:qrs_start+qrs_duration] = qrs_interp
        
        # T wave
        t_start = int((beat_time + 0.35) * sample_rate)
        t_duration = int(0.12 * sample_rate)
        if t_start + t_duration < samples:
            ecg[t_start:t_start+t_duration] = 0.25 * np.sin(np.linspace(0, np.pi, t_duration))
    
    # Add noise
    ecg += 0.02 * np.random.randn(samples)
    
    # Normalize
    ecg = ecg / np.max(np.abs(ecg))
    
    return ecg


def publish_pcg_stream(client, org_id, device_id, session_id, scenario="normal", duration_sec=10, chunk_ms=200):
    """Publish PCG stream."""
    print(f"\n{'='*60}")
    print(f"Publishing PCG stream for session {session_id}")
    print(f"Scenario: {SCENARIOS.get(scenario, {}).get('name', scenario)}")
    print(f"{'='*60}")
    
    sample_rate = 22050
    audio = generate_pcg_scenario(duration_sec, sample_rate, scenario)
    audio_int16 = (audio * 32767).astype(np.int16)
    
    chunk_samples = int(sample_rate * chunk_ms / 1000)
    
    meta_topic = f"org/{org_id}/device/{device_id}/session/{session_id}/meta"
    start_msg = {
        "type": "start_pcg",
        "session_id": session_id,
        "valve_position": "AV",
        "sample_rate_hz": sample_rate,
        "format": "pcm_s16le",
        "channels": 1,
        "chunk_ms": chunk_ms,
        "target_duration_sec": duration_sec,
        "scenario": scenario,
        "timestamp_ms": int(time.time() * 1000)
    }
    
    print(f"Publishing start_pcg to {meta_topic}")
    client.publish(meta_topic, json.dumps(start_msg), qos=1)
    time.sleep(0.5)
    
    data_topic = f"org/{org_id}/device/{device_id}/session/{session_id}/pcg"
    total_chunks = len(audio_int16) // chunk_samples
    
    print(f"Publishing {total_chunks} PCG chunks...")
    
    for i in range(total_chunks):
        start_idx = i * chunk_samples
        end_idx = start_idx + chunk_samples
        chunk = audio_int16[start_idx:end_idx]
        client.publish(data_topic, chunk.tobytes(), qos=0)
        
        if (i + 1) % 10 == 0:
            print(f"  Sent {i+1}/{total_chunks} chunks...")
        
        time.sleep(chunk_ms / 1000)
    
    print("All PCG chunks sent")
    
    end_msg = {
        "type": "end_pcg",
        "session_id": session_id,
        "timestamp_ms": int(time.time() * 1000)
    }
    client.publish(meta_topic, json.dumps(end_msg), qos=1)
    print("PCG stream completed")


def publish_ecg_stream(client, org_id, device_id, session_id, scenario="normal", duration_sec=10, chunk_samples=500):
    """Publish ECG stream."""
    print(f"\n{'='*60}")
    print(f"Publishing ECG stream for session {session_id}")
    print(f"Scenario: {SCENARIOS.get(scenario, {}).get('name', scenario)}")
    print(f"{'='*60}")
    
    sample_rate = 500
    ecg = generate_ecg_scenario(duration_sec, sample_rate, scenario)
    ecg_int16 = (ecg * 32767).astype(np.int16)
    
    meta_topic = f"org/{org_id}/device/{device_id}/session/{session_id}/meta"
    start_msg = {
        "type": "start_ecg",
        "session_id": session_id,
        "sample_rate_hz": sample_rate,
        "format": "int16",
        "lead": "MLII",
        "chunk_samples": chunk_samples,
        "window_size": chunk_samples,
        "scenario": scenario,
        "timestamp_ms": int(time.time() * 1000)
    }
    
    print(f"Publishing start_ecg to {meta_topic}")
    client.publish(meta_topic, json.dumps(start_msg), qos=1)
    time.sleep(0.5)
    
    data_topic = f"org/{org_id}/device/{device_id}/session/{session_id}/ecg"
    total_chunks = len(ecg_int16) // chunk_samples
    
    print(f"Publishing {total_chunks} ECG chunks...")
    
    for i in range(total_chunks):
        start_idx = i * chunk_samples
        end_idx = start_idx + chunk_samples
        chunk = ecg_int16[start_idx:end_idx]
        client.publish(data_topic, chunk.tobytes(), qos=0)
        
        if (i + 1) % 5 == 0:
            print(f"  Sent {i+1}/{total_chunks} chunks...")
        
        time.sleep(1.0)
    
    print("All ECG chunks sent")
    
    end_msg = {
        "type": "end_ecg",
        "session_id": session_id,
        "timestamp_ms": int(time.time() * 1000)
    }
    client.publish(meta_topic, json.dumps(end_msg), qos=1)
    print("ECG stream completed")


def publish_heartbeat(client, org_id, device_id, session_id):
    """Publish heartbeat message."""
    topic = f"org/{org_id}/device/{device_id}/session/{session_id}/heartbeat"
    msg = {
        "timestamp_ms": int(time.time() * 1000),
        "device_id": device_id
    }
    client.publish(topic, json.dumps(msg), qos=0)


def list_scenarios():
    """List all available scenarios."""
    print("\nAvailable cardiac scenarios:")
    print("-" * 50)
    for key, config in SCENARIOS.items():
        print(f"  {key:20s} - {config['name']}")
        print(f"                      {config['description']}")
        print()
    print("-" * 50)


def main():
    parser = argparse.ArgumentParser(
        description="AscultiCor Demo MQTT Publisher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python demo_publisher.py                        # Normal heart
  python demo_publisher.py --scenario tachycardia # Fast heart rate
  python demo_publisher.py --scenario systolic_murmur --duration 15
  python demo_publisher.py --list-scenarios       # Show all scenarios
  python demo_publisher.py --pcg-only --scenario systolic_murmur
        """
    )
    parser.add_argument("--broker", default=DEFAULT_BROKER, help="MQTT broker host")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="MQTT broker port")
    parser.add_argument("--username", default=DEFAULT_USERNAME, help="MQTT username")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="MQTT password")
    parser.add_argument("--org-id", default=DEFAULT_ORG_ID, help="Organization ID")
    parser.add_argument("--device-id", default=DEFAULT_DEVICE_ID, help="Device ID")
    parser.add_argument("--pcg-only", action="store_true", help="Publish only PCG")
    parser.add_argument("--ecg-only", action="store_true", help="Publish only ECG")
    parser.add_argument("--duration", type=int, default=10, help="Duration in seconds")
    parser.add_argument("--session-id", default=DEFAULT_SESSION_ID, help="Session ID")
    parser.add_argument("--scenario", default="normal", 
                        choices=list(SCENARIOS.keys()),
                        help="Cardiac scenario to simulate")
    parser.add_argument("--list-scenarios", action="store_true", 
                        help="List all available scenarios")
    
    args = parser.parse_args()
    
    if args.list_scenarios:
        list_scenarios()
        sys.exit(0)
    
    scenario_info = SCENARIOS.get(args.scenario, SCENARIOS["normal"])
    
    print(f"\n{'#'*60}")
    print("AscultiCor Demo MQTT Publisher")
    print(f"{'#'*60}")
    print(f"Broker: {args.broker}:{args.port}")
    print(f"Org ID: {args.org_id}")
    print(f"Device ID: {args.device_id}")
    print(f"Session ID: {args.session_id}")
    print(f"Duration: {args.duration}s")
    print(f"Scenario: {args.scenario}")
    print(f"Description: {scenario_info['name']}")
    print(f"  - PCG: {scenario_info['pcg_bpm']} BPM")
    print(f"  - ECG: {scenario_info['ecg_bpm']} BPM")
    print(f"  - Murmur: {'Yes' if scenario_info.get('has_murmur') else 'No'}")
    print(f"  - ECG Normal: {'Yes' if scenario_info.get('ecg_normal') else 'No'}")
    
    # Create MQTT client
    client = mqtt.Client(client_id=f"demo-{args.scenario[:4]}-{args.session_id[:8]}")
    client.username_pw_set(args.username, args.password)
    
    print(f"\nConnecting to MQTT broker...")
    try:
        client.connect(args.broker, args.port, 60)
        print("Connected!")
    except Exception as e:
        print(f"Error connecting to MQTT broker: {e}")
        sys.exit(1)
    
    client.loop_start()
    time.sleep(1)
    
    try:
        publish_heartbeat(client, args.org_id, args.device_id, args.session_id)
        
        if not args.ecg_only:
            publish_pcg_stream(
                client, 
                args.org_id, 
                args.device_id, 
                args.session_id,
                scenario=args.scenario,
                duration_sec=args.duration
            )
            time.sleep(2)
        
        if not args.pcg_only:
            publish_ecg_stream(
                client, 
                args.org_id, 
                args.device_id, 
                args.session_id,
                scenario=args.scenario,
                duration_sec=args.duration
            )
        
        print(f"\n{'='*60}")
        print("Demo completed successfully!")
        print(f"Session ID: {args.session_id}")
        print(f"Scenario: {scenario_info['name']}")
        print("Check the UI for results!")
        print(f"{'='*60}\n")
        
    except KeyboardInterrupt:
        print("\nInterrupted by user")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
