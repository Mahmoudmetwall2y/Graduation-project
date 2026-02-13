#!/usr/bin/env python3
"""
Demo MQTT Publisher for AscultiCor
Simulates ESP32 device publishing PCG and ECG data.
"""

import time
import json
import struct
import numpy as np
import paho.mqtt.client as mqtt
import uuid
import argparse
import sys

# Configuration
DEFAULT_BROKER = "localhost"
DEFAULT_PORT = 1883
DEFAULT_USERNAME = "cardiosense"
DEFAULT_PASSWORD = "cardiosense123"

# Device info (from seed data)
DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_DEVICE_ID = "00000000-0000-0000-0000-000000000004"

# Session ID (generate new for each run)
SESSION_ID = str(uuid.uuid4())


def generate_synthetic_pcg(duration_sec=10, sample_rate=22050):
    """Generate synthetic PCG audio (heart sound)."""
    print(f"Generating synthetic PCG: {duration_sec}s @ {sample_rate}Hz")
    
    samples = int(duration_sec * sample_rate)
    t = np.linspace(0, duration_sec, samples)
    
    # Simulate heart beats (60 BPM = 1 Hz)
    heart_rate = 1.0  # Hz
    
    # S1 and S2 sounds (simplified)
    s1_freq = 150  # Hz
    s2_freq = 200  # Hz
    
    # Create periodic impulses
    beat_times = np.arange(0, duration_sec, 1.0 / heart_rate)
    audio = np.zeros(samples)
    
    for beat_time in beat_times:
        # S1 (systolic)
        s1_start = int(beat_time * sample_rate)
        s1_duration = int(0.05 * sample_rate)  # 50ms
        if s1_start + s1_duration < samples:
            s1 = np.sin(2 * np.pi * s1_freq * np.linspace(0, 0.05, s1_duration))
            s1 *= np.exp(-10 * np.linspace(0, 0.05, s1_duration))  # Decay
            audio[s1_start:s1_start+s1_duration] += s1
        
        # S2 (diastolic)
        s2_start = int((beat_time + 0.3) * sample_rate)
        s2_duration = int(0.03 * sample_rate)  # 30ms
        if s2_start + s2_duration < samples:
            s2 = np.sin(2 * np.pi * s2_freq * np.linspace(0, 0.03, s2_duration))
            s2 *= np.exp(-15 * np.linspace(0, 0.03, s2_duration))  # Decay
            audio[s2_start:s2_start+s2_duration] += s2 * 0.8
    
    # Add some noise
    audio += 0.05 * np.random.randn(samples)
    
    # Normalize
    audio = audio / np.max(np.abs(audio))
    
    return audio


def generate_synthetic_ecg(duration_sec=10, sample_rate=500):
    """Generate synthetic ECG signal."""
    print(f"Generating synthetic ECG: {duration_sec}s @ {sample_rate}Hz")
    
    samples = int(duration_sec * sample_rate)
    t = np.linspace(0, duration_sec, samples)
    
    # Simulate ECG (60 BPM = 1 Hz)
    heart_rate = 1.0  # Hz
    
    # Simple ECG waveform
    ecg = np.zeros(samples)
    beat_samples = int(sample_rate / heart_rate)
    
    for i in range(0, samples, beat_samples):
        # P wave
        p_start = i + int(0.1 * sample_rate)
        p_duration = int(0.08 * sample_rate)
        if p_start + p_duration < samples:
            ecg[p_start:p_start+p_duration] = 0.1 * np.sin(np.linspace(0, np.pi, p_duration))
        
        # QRS complex
        qrs_start = i + int(0.25 * sample_rate)
        qrs_duration = int(0.08 * sample_rate)
        if qrs_start + qrs_duration < samples:
            qrs = np.array([0, -0.1, 1.0, -0.2, 0])
            qrs_interp = np.interp(
                np.linspace(0, len(qrs)-1, qrs_duration),
                np.arange(len(qrs)),
                qrs
            )
            ecg[qrs_start:qrs_start+qrs_duration] = qrs_interp
        
        # T wave
        t_start = i + int(0.4 * sample_rate)
        t_duration = int(0.15 * sample_rate)
        if t_start + t_duration < samples:
            ecg[t_start:t_start+t_duration] = 0.3 * np.sin(np.linspace(0, np.pi, t_duration))
    
    # Add noise
    ecg += 0.02 * np.random.randn(samples)
    
    # Normalize
    ecg = ecg / np.max(np.abs(ecg))
    
    return ecg


def publish_pcg_stream(client, org_id, device_id, session_id, duration_sec=10, chunk_ms=200):
    """Publish PCG stream."""
    print(f"\n{'='*60}")
    print(f"Publishing PCG stream for session {session_id}")
    print(f"{'='*60}")
    
    sample_rate = 22050
    
    # Generate audio
    audio = generate_synthetic_pcg(duration_sec, sample_rate)
    
    # Convert to int16
    audio_int16 = (audio * 32767).astype(np.int16)
    
    # Calculate chunk size
    chunk_samples = int(sample_rate * chunk_ms / 1000)
    
    # Publish start message
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
        "timestamp_ms": int(time.time() * 1000)
    }
    
    print(f"Publishing start_pcg to {meta_topic}")
    client.publish(meta_topic, json.dumps(start_msg), qos=1)
    time.sleep(0.5)
    
    # Publish chunks
    data_topic = f"org/{org_id}/device/{device_id}/session/{session_id}/pcg"
    total_chunks = len(audio_int16) // chunk_samples
    
    print(f"Publishing {total_chunks} PCG chunks...")
    
    for i in range(total_chunks):
        start_idx = i * chunk_samples
        end_idx = start_idx + chunk_samples
        chunk = audio_int16[start_idx:end_idx]
        
        # Binary payload
        payload = chunk.tobytes()
        
        client.publish(data_topic, payload, qos=0)
        
        if (i + 1) % 10 == 0:
            print(f"  Sent {i+1}/{total_chunks} chunks...")
        
        # Simulate real-time streaming
        time.sleep(chunk_ms / 1000)
    
    print("All PCG chunks sent")
    
    # Publish end message
    end_msg = {
        "type": "end_pcg",
        "session_id": session_id,
        "timestamp_ms": int(time.time() * 1000)
    }
    
    print(f"Publishing end_pcg to {meta_topic}")
    client.publish(meta_topic, json.dumps(end_msg), qos=1)
    
    print("PCG stream completed")


def publish_ecg_stream(client, org_id, device_id, session_id, duration_sec=10, chunk_samples=500):
    """Publish ECG stream."""
    print(f"\n{'='*60}")
    print(f"Publishing ECG stream for session {session_id}")
    print(f"{'='*60}")
    
    sample_rate = 500
    
    # Generate ECG
    ecg = generate_synthetic_ecg(duration_sec, sample_rate)
    
    # Convert to int16
    ecg_int16 = (ecg * 32767).astype(np.int16)
    
    # Publish start message
    meta_topic = f"org/{org_id}/device/{device_id}/session/{session_id}/meta"
    start_msg = {
        "type": "start_ecg",
        "session_id": session_id,
        "sample_rate_hz": sample_rate,
        "format": "int16",
        "lead": "MLII",
        "chunk_samples": chunk_samples,
        "window_size": chunk_samples,
        "timestamp_ms": int(time.time() * 1000)
    }
    
    print(f"Publishing start_ecg to {meta_topic}")
    client.publish(meta_topic, json.dumps(start_msg), qos=1)
    time.sleep(0.5)
    
    # Publish chunks
    data_topic = f"org/{org_id}/device/{device_id}/session/{session_id}/ecg"
    total_chunks = len(ecg_int16) // chunk_samples
    
    print(f"Publishing {total_chunks} ECG chunks...")
    
    for i in range(total_chunks):
        start_idx = i * chunk_samples
        end_idx = start_idx + chunk_samples
        chunk = ecg_int16[start_idx:end_idx]
        
        # Binary payload
        payload = chunk.tobytes()
        
        client.publish(data_topic, payload, qos=0)
        
        if (i + 1) % 5 == 0:
            print(f"  Sent {i+1}/{total_chunks} chunks...")
        
        # Simulate real-time streaming (1 second per chunk)
        time.sleep(1.0)
    
    print("All ECG chunks sent")
    
    # Publish end message
    end_msg = {
        "type": "end_ecg",
        "session_id": session_id,
        "timestamp_ms": int(time.time() * 1000)
    }
    
    print(f"Publishing end_ecg to {meta_topic}")
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


def main():
    parser = argparse.ArgumentParser(description="AscultiCor Demo MQTT Publisher")
    parser.add_argument("--broker", default=DEFAULT_BROKER, help="MQTT broker host")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="MQTT broker port")
    parser.add_argument("--username", default=DEFAULT_USERNAME, help="MQTT username")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="MQTT password")
    parser.add_argument("--org-id", default=DEFAULT_ORG_ID, help="Organization ID")
    parser.add_argument("--device-id", default=DEFAULT_DEVICE_ID, help="Device ID")
    parser.add_argument("--pcg-only", action="store_true", help="Publish only PCG")
    parser.add_argument("--ecg-only", action="store_true", help="Publish only ECG")
    parser.add_argument("--duration", type=int, default=10, help="Duration in seconds")
    
    args = parser.parse_args()
    
    print(f"\n{'#'*60}")
    print("AscultiCor Demo MQTT Publisher")
    print(f"{'#'*60}")
    print(f"Broker: {args.broker}:{args.port}")
    print(f"Org ID: {args.org_id}")
    print(f"Device ID: {args.device_id}")
    print(f"Session ID: {SESSION_ID}")
    print(f"Duration: {args.duration}s")
    
    # Create MQTT client
    client = mqtt.Client(client_id=f"demo-publisher-{SESSION_ID[:8]}")
    client.username_pw_set(args.username, args.password)
    
    # Connect
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
        # Publish heartbeat
        publish_heartbeat(client, args.org_id, args.device_id, SESSION_ID)
        
        # Publish streams
        if not args.ecg_only:
            publish_pcg_stream(
                client, 
                args.org_id, 
                args.device_id, 
                SESSION_ID,
                duration_sec=args.duration
            )
            time.sleep(2)
        
        if not args.pcg_only:
            publish_ecg_stream(
                client, 
                args.org_id, 
                args.device_id, 
                SESSION_ID,
                duration_sec=args.duration
            )
        
        print(f"\n{'='*60}")
        print("Demo completed successfully!")
        print(f"Session ID: {SESSION_ID}")
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
