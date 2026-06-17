# Device Setup Wizard

Verified: the dashboard route is `/devices/add`.

Use Chrome or Edge desktop. Web Serial requires a user click and browser permission; silent flashing after USB plug-in is not possible.

Setup flow:

1. Connect ESP32 by USB with a data cable.
2. Choose New ESP32 setup or Already flashed ESP32.
3. In local mode, enter the host machine LAN IP, not `localhost`.
4. In Hostinger VPS mode, use the public domain or VPS IP.
5. Register the device while signed in as an admin.
6. Send JSON serial provisioning.
7. Reboot the ESP32.
8. Wait for MQTT heartbeat.
9. Run ECG/PCG preflight.

Expected success state: Device is online and ready for real-time ECG/PCG recording.

Screenshot placeholders:

- Add Device mode selector
- Web Serial permission dialog
- Online/preflight result panel

Needs manual test: physical ESP32 flashing and serial provisioning.

Manual physical test checklist:

1. Fresh ESP32 connected by USB.
2. Browser detects serial port.
3. Firmware flashes successfully.
4. Wi-Fi credentials sent.
5. Device saves config to NVS.
6. Device reboots.
7. Device connects to Wi-Fi.
8. Device calls bootstrap.
9. Device receives MQTT credentials.
10. Device connects to MQTT.
11. Dashboard receives heartbeat.
12. ECG preflight passes.
13. PCG preflight passes.
14. Device starts real recording session.
15. Inference receives chunks.
16. Supabase stores recording/prediction.
17. Dashboard displays session result.
