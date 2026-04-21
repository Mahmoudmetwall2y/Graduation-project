# ============================================================
# SONOCARDIA - Data Sender Module
# Sends captured PCG/ECG data to Flask server via HTTP
# ============================================================

import ujson
import urequests
import time
import machine
from config import (
    SERVER_IP,
    SERVER_PORT,
    SERVER_URL_PCG,
    SERVER_URL_ECG,
    BUFFER_SIZE,
    LED_RECORDING_PIN,
    LED_ERROR_PIN,
    DEBUG,
)

# Overlay from config.json if available
_cfg = {}
try:
    import json as _json
    with open("config.json", "r") as _f:
        _cfg = _json.load(_f)
except Exception:
    pass
_SERVER_IP   = _cfg.get("server_ip",   SERVER_IP)
_SERVER_PORT = _cfg.get("server_port", SERVER_PORT)


class DataSender:
    """
    Sends captured sensor data (PCG / ECG) to the Flask backend
    server via HTTP POST requests in JSON format.

    The server address is the ESP32's own IP (obtained from the
    router via DHCP), so no hardcoded IP is needed.
    """

    def __init__(self, wifi_manager):
        self.wifi = wifi_manager
        # ── Interaction LED on GPIO4 ──
        self._led = machine.Pin(LED_RECORDING_PIN, machine.Pin.OUT)
        self._led.value(0)
        # ── Error LED on GPIO21 ──
        self._led_err = machine.Pin(LED_ERROR_PIN, machine.Pin.OUT)
        self._led_err.value(0)
        self._error_active = False

    @property
    def base_url(self):
        """Build base URL from the configured Flask server IP."""
        return f"http://{_SERVER_IP}:{_SERVER_PORT}"

    def _build_url(self, endpoint):
        """Build full URL from endpoint."""
        return f"{self.base_url}{endpoint}"

    def _blink_led(self, duration_ms=500):
        """Blink GPIO4 LED for a short duration (blocking)."""
        self._led.value(1)
        time.sleep_ms(duration_ms)
        self._led.value(0)

    def _set_error(self, active):
        """Enable or disable the GPIO21 error LED slow blink."""
        self._error_active = active
        if not active:
            self._led_err.value(0)

    def _error_blink_tick(self):
        """Call periodically to toggle GPIO21 while error is active."""
        if self._error_active:
            self._led_err.value(1 - self._led_err.value())
            time.sleep_ms(1000)

    def send_pcg(self, recording_data):
        """
        Send heart sound (PCG) recording to Flask server.
        
        The server pipeline:
            1. XGBoost classifies: Normal / Murmur / Artifact
            2. If Murmur -> CNN classifies severity (6 labels)
        
        Args:
            recording_data: Dict from HeartSoundCapture.record()
        
        Returns:
            dict: Server response with prediction results, or error dict.
        """
        if not recording_data:
            return {"error": "No recording data provided"}

        if "error" in recording_data:
            return recording_data

        url = self._build_url(SERVER_URL_PCG)
        return self._send(url, recording_data, "PCG")

    def send_ecg(self, recording_data):
        """
        Send ECG recording to Flask server.
        
        The server pipeline:
            BiLSTM predicts heart disease likelihood + confidence score.
        
        Args:
            recording_data: Dict from ECGCapture.record()
        
        Returns:
            dict: Server response with prediction results, or error dict.
        """
        if not recording_data:
            return {"error": "No recording data provided"}

        if "error" in recording_data:
            return recording_data

        url = self._build_url(SERVER_URL_ECG)
        return self._send(url, recording_data, "ECG")

    def _send(self, url, data, data_type):
        """
        Send data to server via HTTP POST.
        
        Args:
            url: Full endpoint URL.
            data: Dict to send as JSON body.
            data_type: "PCG" or "ECG" for logging.
        
        Returns:
            dict: Parsed server response or error dict.
        """
        # Ensure Wi-Fi is connected
        if not self.wifi.ensure_connected():
            return {"error": "Wi-Fi not connected"}

        if DEBUG:
            print(f"[Sender] Sending {data_type} data to {url}")
            print(f"[Sender] Payload size: {len(data.get('samples', []))} samples")

        try:
            # Serialize to JSON
            json_payload = ujson.dumps(data)

            if DEBUG:
                payload_kb = len(json_payload) / 1024
                print(f"[Sender] JSON payload: {payload_kb:.1f} KB")

            # Send HTTP POST request
            start = time.ticks_ms()
            response = urequests.post(
                url,
                data=json_payload,
                headers={"Content-Type": "application/json"},
            )
            elapsed = time.ticks_diff(time.ticks_ms(), start)

            if DEBUG:
                print(f"[Sender] Response status: {response.status_code}")
                print(f"[Sender] Round-trip time: {elapsed} ms")

            if response.status_code == 200:
                result = response.json()
                response.close()
                self._blink_led()  # success interaction
                self._set_error(False)
                if DEBUG:
                    print(f"[Sender] Result: {result}")
                return result
            else:
                error_text = response.text
                response.close()
                self._set_error(True)
                return {
                    "error": f"Server returned {response.status_code}",
                    "details": error_text,
                }

        except OSError as e:
            if DEBUG:
                print(f"[Sender] Network error: {e}")
            self._set_error(True)
            return {"error": f"Network error: {e}"}

        except ValueError as e:
            if DEBUG:
                print(f"[Sender] JSON error: {e}")
            self._set_error(True)
            return {"error": f"JSON error: {e}"}

        except Exception as e:
            if DEBUG:
                print(f"[Sender] Unexpected error: {e}")
            self._set_error(True)
            return {"error": f"Unexpected error: {e}"}

    def send_chunked(self, url, data, data_type, chunk_size=2000):
        """
        Send large recordings in chunks to avoid memory issues.
        Useful when sample arrays are very large.
        
        Args:
            url: Full endpoint URL.
            data: Recording dict.
            data_type: "PCG" or "ECG".
            chunk_size: Number of samples per chunk.
        
        Returns:
            dict: Final server response.
        """
        if not self.wifi.ensure_connected():
            return {"error": "Wi-Fi not connected"}

        samples = data.get("samples", [])
        total_chunks = (len(samples) + chunk_size - 1) // chunk_size

        if DEBUG:
            print(f"[Sender] Sending {data_type} in {total_chunks} chunks...")

        for i in range(total_chunks):
            start_idx = i * chunk_size
            end_idx = min((i + 1) * chunk_size, len(samples))

            chunk_data = {
                "type": data.get("type"),
                "chunk_index": i,
                "total_chunks": total_chunks,
                "sample_rate": data.get("sample_rate"),
                "samples": samples[start_idx:end_idx],
            }

            # Add metadata only on the first chunk
            if i == 0:
                chunk_data["duration"] = data.get("duration")
                chunk_data["num_samples"] = data.get("num_samples")
                chunk_data["adc_bits"] = data.get("adc_bits")

            try:
                json_payload = ujson.dumps(chunk_data)
                response = urequests.post(
                    url,
                    data=json_payload,
                    headers={"Content-Type": "application/json"},
                )

                if DEBUG:
                    print(f"[Sender] Chunk {i + 1}/{total_chunks}: {response.status_code}")

                # On last chunk, return the server response
                if i == total_chunks - 1:
                    if response.status_code == 200:
                        result = response.json()
                        response.close()
                        self._blink_led()
                        self._set_error(False)
                        return result

                response.close()

            except Exception as e:
                if DEBUG:
                    print(f"[Sender] Chunk {i + 1} failed: {e}")
                self._set_error(True)
                return {"error": f"Chunk {i + 1} failed: {e}"}

        return {"error": "No response received"}

    def ping_server(self):
        """
        Check if the Flask server is reachable.
        
        Returns:
            bool: True if server responds.
        """
        if not self.wifi.ensure_connected():
            return False

        try:
            url = f"{self.base_url}/api/health"
            response = urequests.get(url)
            ok = response.status_code == 200
            response.close()

            if ok:
                self._blink_led()
                self._set_error(False)
            else:
                self._set_error(True)

            if DEBUG:
                print(f"[Sender] Server ping: {'OK' if ok else 'FAILED'}")
            return ok

        except Exception as e:
            if DEBUG:
                print(f"[Sender] Server unreachable: {e}")
            self._set_error(True)
            return False
