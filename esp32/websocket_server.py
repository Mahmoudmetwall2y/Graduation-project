# ============================================================
# SONOCARDIA - WebSocket Server for Real-Time Streaming
#
# Runs a minimal WebSocket server on the ESP32 that streams
# ECG and PCG sensor data to the Flutter mobile app.
#
# Protocol:
#   - Server sends JSON messages at ~20 Hz (every 50 ms)
#   - Each message contains:
#       "ecg"    : list of ECG ADC samples (12-bit, 0-4095)
#       "pcg"    : latest PCG raw ADC value
#       "volume" : computed PCG volume level (0-100)
#       "ts"     : timestamp in milliseconds
#
# Improvements:
#   - TCP_NODELAY for low-latency sends
#   - Non-blocking accept so sampling never stops
#   - Automatic reconnection without restarting the server
#   - Pre-allocated buffers to reduce GC pressure
#   - Watchdog-style send error counting
#
# The Flutter app connects as a WebSocket client using:
#   ws://<ESP32_IP>:8765
# ============================================================

import socket
import struct
import uhashlib
import ubinascii
import ujson
import time
import machine
import gc
from config import (
    WEBSOCKET_PORT,
    WS_BATCH_INTERVAL_MS,
    ECG_PIN,
    MIC_PIN,
    ECG_SAMPLE_RATE,
    PCG_OVERSAMPLE,
    LED_RECORDING_PIN,
    LED_ERROR_PIN,
    DEBUG,
)


class WebSocketServer:
    """
    Minimal WebSocket server for MicroPython (ESP32).

    Accepts one client at a time, performs the HTTP upgrade
    handshake, then continuously streams ECG + PCG sensor
    data as JSON text frames.

    The server always samples sensors, even between client
    connections, so data is ready the instant a client connects.
    """

    # WebSocket GUID for handshake (RFC 6455)
    _WS_GUID = b'258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

    # Max consecutive send failures before dropping client
    _MAX_SEND_ERRORS = 3

    def __init__(self):
        self._server = None
        self._client = None
        self.running = False

        # ── Status LED on GPIO4 (blinks on interactions) ──
        self._led = machine.Pin(LED_RECORDING_PIN, machine.Pin.OUT)
        self._led.value(0)
        self._led_off_time = 0  # ticks_ms when LED should turn off

        # ── Error LED on GPIO21 (slow blink while error active) ──
        self._led_err = machine.Pin(LED_ERROR_PIN, machine.Pin.OUT)
        # Hardware is active-low: set high (1) to keep LED off by default
        self._led_err.value(1)
        self._error_active = False
        self._err_toggle_time = 0  # next toggle time for slow blink

        # ── ADC: ECG (AD8232 on GPIO35) ──
        self.ecg_adc = machine.ADC(machine.Pin(ECG_PIN))
        self.ecg_adc.atten(machine.ADC.ATTN_11DB)
        self.ecg_adc.width(machine.ADC.WIDTH_12BIT)

        # ── ADC: PCG / Microphone (MAX9814 on GPIO34) ──
        self.pcg_adc = machine.ADC(machine.Pin(MIC_PIN))
        self.pcg_adc.atten(machine.ADC.ATTN_11DB)
        self.pcg_adc.width(machine.ADC.WIDTH_12BIT)

        if DEBUG:
            print("[WS] WebSocket server module initialized")
            print(f"[WS] ECG ADC on GPIO{ECG_PIN}, PCG ADC on GPIO{MIC_PIN}")

    # ─────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────
    def start(self):
        """
        Start the WebSocket server. Runs a unified loop that:
          1. Continuously samples ECG + PCG at the configured rate
          2. Accepts new client connections (non-blocking)
          3. Streams batched data to the connected client
        Never blocks waiting for a client — always sampling.
        """
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server.bind(('0.0.0.0', WEBSOCKET_PORT))
        self._server.listen(1)
        self._server.settimeout(0)  # Non-blocking accept
        self.running = True

        ip = self._get_ip()
        print()
        print("=" * 50)
        print("  SONOCARDIA WebSocket Server")
        print(f"  Address : ws://{ip}:{WEBSOCKET_PORT}")
        print("  Status  : Always streaming — waiting for client")
        print("=" * 50)
        print()

        self._main_loop()

    def stop(self):
        """Shut down the server and close all sockets."""
        self.running = False
        self._drop_client()
        if self._server:
            try:
                self._server.close()
            except:
                pass
            self._server = None
        print("[WS] Server stopped.")

    def _drop_client(self):
        """Safely close the current client connection."""
        if self._client:
            try:
                self._client.close()
            except:
                pass
            self._client = None
            self._blink_led()  # blink on disconnect
            # When a client is dropped unexpectedly, enable the error LED
            # so hardware clearly shows there's no connected client.
            if self.running:
                self._set_error(True)
            else:
                # If server is stopping, ensure error LED is off
                self._set_error(False)
            if DEBUG:
                print("[WS] Client dropped.")

    def _blink_led(self):
        """Blink GPIO4 LED for 0.5 s (non-blocking)."""
        self._led.value(0)
        self._led_off_time = time.ticks_add(time.ticks_ms(), 500)

    def _set_error(self, active):
        """Enable or disable the GPIO21 error LED slow blink."""
        self._error_active = active
        if active:
            # Active-low: drive low to turn LED ON, start slow-blink timing
            self._led_err.value(0)
            self._err_toggle_time = time.ticks_add(time.ticks_ms(), 1000)
        else:
            # Active-low: drive high to ensure LED is OFF
            self._led_err.value(1)
            self._err_toggle_time = 0

    # ─────────────────────────────────────────────────────────
    # Unified main loop — always sampling, always ready
    # ─────────────────────────────────────────────────────────
    def _main_loop(self):
        """
        Single loop that handles both sampling and client management.
        Samples ECG at the configured rate regardless of whether
        a client is connected. Sends batches when a client is present.
        """
        ecg_interval_us = 1_000_000 // ECG_SAMPLE_RATE
        batch_interval_ms = WS_BATCH_INTERVAL_MS
        pcg_oversample = PCG_OVERSAMPLE
        pcg_sub_interval_us = ecg_interval_us // pcg_oversample
        pcg_rate = ECG_SAMPLE_RATE * pcg_oversample  # effective PCG Hz

        ecg_batch = []
        pcg_batch = []
        pcg_window = []
        pcg_window_max = 100
        last_send = time.ticks_ms()
        msg_count = 0
        send_errors = 0
        last_gc = time.ticks_ms()

        try:
            while self.running:
                loop_start = time.ticks_us()

                # ── Always sample sensors ──
                ecg_val = self.ecg_adc.read()
                ecg_batch.append(ecg_val)

                # ── PCG oversampling (multiple reads per ECG tick) ──
                for _p in range(pcg_oversample):
                    # Average two rapid reads to reduce ADC noise
                    pcg_val = (self.pcg_adc.read() + self.pcg_adc.read()) >> 1
                    pcg_batch.append(pcg_val)
                    pcg_window.append(pcg_val)
                    if len(pcg_window) > pcg_window_max:
                        pcg_window.pop(0)
                    if _p < pcg_oversample - 1:
                        time.sleep_us(pcg_sub_interval_us)

                # ── Try to accept a new client if none connected ──
                if self._client is None:
                    self._try_accept()

                # ── Send batch when interval elapsed ──
                now_ms = time.ticks_ms()
                if time.ticks_diff(now_ms, last_send) >= batch_interval_ms:
                    if ecg_batch and self._client is not None:
                        volume = self._compute_volume(pcg_window)

                        msg = ujson.dumps({
                            "ecg": ecg_batch,
                            "pcg": pcg_batch,
                            "pcg_rate": pcg_rate,
                            "volume": volume,
                            "ts": now_ms,
                        })

                        if self._send_text_frame(msg):
                            send_errors = 0
                            msg_count += 1
                        else:
                            send_errors += 1
                            if send_errors >= self._MAX_SEND_ERRORS:
                                print("[WS] Client unresponsive — dropping.")
                                self._drop_client()
                                self._set_error(True)
                                send_errors = 0
                                msg_count = 0

                    # Always reset batch + timer (don't let it grow)
                    ecg_batch = []
                    pcg_batch = []
                    last_send = now_ms

                    # Check for incoming close/ping every ~2 seconds
                    if self._client and msg_count > 0 and msg_count % 40 == 0:
                        if not self._check_client():
                            print("[WS] Client sent close frame.")
                            self._drop_client()
                            msg_count = 0

                    # Periodic GC every ~10 seconds
                    if time.ticks_diff(now_ms, last_gc) > 10000:
                        gc.collect()
                        last_gc = now_ms
                        if msg_count > 0:
                            print(f"[WS] {msg_count} batches sent, "
                                  f"mem={gc.mem_free()}")
                            # Blink LED on GPIO4 for 0.5 s
                            self._led.value(1)
                            self._led_off_time = time.ticks_add(now_ms, 500)

                # ── Turn off LED after 0.5 s ──
                if self._led_off_time and time.ticks_diff(now_ms, self._led_off_time) >= 0:
                    self._led.value(0)
                    self._led_off_time = 0

                # ── Error LED: solid ON when no client, slow blink on error ──
                if self._client is None:
                    # No client connected → keep error LED solid ON (active-low)
                    self._led_err.value(0)
                    # Disable slow-blink state while showing steady error
                    self._error_active = False
                    self._err_toggle_time = 0
                else:
                    # Client present → restore slow-blink behavior for error state
                    if self._error_active and time.ticks_diff(now_ms, self._err_toggle_time) >= 0:
                        self._led_err.value(1 - self._led_err.value())
                        self._err_toggle_time = time.ticks_add(now_ms, 1000)

                # ── Maintain ECG sample rate ──
                elapsed_us = time.ticks_diff(time.ticks_us(), loop_start)
                wait_us = ecg_interval_us - elapsed_us
                if wait_us > 0:
                    time.sleep_us(wait_us)

        except KeyboardInterrupt:
            print("\n[WS] Stopped by user (Ctrl-C)")
        except Exception as e:
            if DEBUG:
                print(f"[WS] Main loop error: {e}")
        finally:
            self.stop()

    def _try_accept(self):
        """Non-blocking attempt to accept a new WebSocket client."""
        try:
            client, addr = self._server.accept()
            print(f"[WS] Client connected from {addr[0]}:{addr[1]}")

            if self._handshake(client):
                # Enable TCP_NODELAY for low-latency sends
                try:
                    client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                except:
                    pass  # Not all MicroPython builds support this
                client.settimeout(0.1)  # Short timeout for sends

                self._client = client
                self._blink_led()  # blink on successful handshake
                self._set_error(False)  # clear error on new connection
                print("[WS] Handshake OK — streaming data...")
                gc.collect()
            else:
                print("[WS] Handshake FAILED")
                self._set_error(True)
                client.close()
        except OSError:
            pass  # No pending connection (expected with non-blocking)
        except Exception as e:
            if DEBUG:
                print(f"[WS] Accept error: {e}")

    # ─────────────────────────────────────────────────────────
    # WebSocket handshake (RFC 6455)
    # ─────────────────────────────────────────────────────────
    def _handshake(self, client):
        """
        Read the HTTP upgrade request and reply with the
        proper Sec-WebSocket-Accept header.
        """
        try:
            data = client.recv(1024).decode('utf-8')
        except Exception:
            return False

        # Extract Sec-WebSocket-Key
        key = None
        for line in data.split('\r\n'):
            if line.lower().startswith('sec-websocket-key'):
                key = line.split(':', 1)[1].strip()
                break

        if key is None:
            return False

        # Compute SHA-1 hash of key + GUID, then base64-encode
        sha1 = uhashlib.sha1(key.encode('utf-8') + self._WS_GUID)
        accept = ubinascii.b2a_base64(sha1.digest()).strip()

        # Send HTTP 101 Switching Protocols response
        response = (
            b'HTTP/1.1 101 Switching Protocols\r\n'
            b'Upgrade: websocket\r\n'
            b'Connection: Upgrade\r\n'
            b'Sec-WebSocket-Accept: ' + accept + b'\r\n'
            b'\r\n'
        )
        client.send(response)
        return True

    # ─────────────────────────────────────────────────────────
    # WebSocket framing helpers
    # ─────────────────────────────────────────────────────────
    def _send_text_frame(self, text):
        """Send a WebSocket text frame (opcode 0x1, FIN=1)."""
        payload = text.encode('utf-8') if isinstance(text, str) else text
        length = len(payload)

        header = bytearray()
        header.append(0x81)  # FIN + text opcode

        if length < 126:
            header.append(length)
        elif length < 65536:
            header.append(126)
            header.extend(struct.pack('>H', length))
        else:
            header.append(127)
            header.extend(struct.pack('>Q', length))

        try:
            self._client.send(header + payload)
            return True
        except Exception:
            return False

    def _check_client(self):
        """
        Non-blocking check for incoming frames (close / ping).
        Returns True if connection is still alive.
        """
        try:
            self._client.settimeout(0)
            header = self._client.recv(2)
            if not header or len(header) < 2:
                return False

            opcode = header[0] & 0x0F
            masked = header[1] & 0x80
            length = header[1] & 0x7F

            # Read extended length
            if length == 126:
                length = struct.unpack('>H', self._client.recv(2))[0]
            elif length == 127:
                length = struct.unpack('>Q', self._client.recv(8))[0]

            # Read mask + payload
            if masked:
                mask = self._client.recv(4)
                raw = self._client.recv(length) if length > 0 else b''
            else:
                raw = self._client.recv(length) if length > 0 else b''

            # Close frame
            if opcode == 8:
                return False

            # Ping → reply with pong
            if opcode == 9:
                pong = bytearray([0x8A, len(raw)]) + raw
                self._client.send(pong)

            return True

        except OSError:
            return True  # No data available (expected in non-blocking mode)
        except Exception:
            return False

    # ─────────────────────────────────────────────────────────
    # PCG volume computation
    # ─────────────────────────────────────────────────────────
    @staticmethod
    def _compute_volume(samples):
        """
        Compute a volume level 0-100 from a window of PCG
        ADC samples using mean absolute deviation.
        """
        n = len(samples)
        if n < 10:
            return 0

        mean = sum(samples) // n
        mad = sum(abs(s - mean) for s in samples) // n

        # Scale: 300 ADC units deviation → 100 %
        volume = min(100, (mad * 100) // 300)
        return volume

    # ─────────────────────────────────────────────────────────
    # Helpers
    # ─────────────────────────────────────────────────────────
    @staticmethod
    def _get_ip():
        """Return the current station IP address."""
        import network
        wlan = network.WLAN(network.STA_IF)
        if wlan.isconnected():
            return wlan.ifconfig()[0]
        return '0.0.0.0'
