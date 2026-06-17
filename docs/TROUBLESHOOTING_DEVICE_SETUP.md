# Troubleshooting Device Setup

ESP32 not detected:

- Use a USB data cable, not a charge-only cable.
- Close Arduino IDE or serial monitors.
- Try another USB port.
- Press BOOT while connecting if needed.
- Install CP210x, CH340, or FTDI drivers from official vendor pages.
- Use Chrome or Edge desktop.

Flashing failed:

- Hold BOOT during flash start.
- Disconnect and reconnect.
- Confirm release binaries exist in `frontend/public/firmware`.

Wi-Fi failed:

- Confirm SSID/password.
- Use 2.4 GHz Wi-Fi if the board cannot join 5 GHz.
- Make sure ESP32 and host are on the same LAN for local mode.

MQTT failed:

- Local mode: set `MQTT_BIND_ADDRESS=0.0.0.0`.
- VPS mode: open port `1883` or configure MQTT TLS.
- Confirm `MQTT_PUBLIC_HOST` is reachable by the ESP32.

Bootstrap failed:

- Do not use `localhost`.
- Use LAN IP locally or a public Hostinger domain/IP.
- For HTTPS local testing, firmware needs a CA certificate or insecure dev mode.

No heartbeat:

- Check Wi-Fi, MQTT host, firewall, and power.
- Check inference service MQTT connection.

No ECG signal / lead-off detected:

- Check AD8232 OUTPUT, LO+, LO-, electrode placement, and ground.

No PCG signal:

- Check MAX9814 OUT, gain wiring, microphone placement, and clipping/noise.

