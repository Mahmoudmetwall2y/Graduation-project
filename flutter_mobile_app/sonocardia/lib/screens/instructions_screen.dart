import 'package:flutter/material.dart';

// ============================================================
//  InstructionsScreen — Device & App usage guide
// ============================================================

class InstructionsScreen extends StatelessWidget {
  const InstructionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Instructions')),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          _SectionCard(
            icon: Icons.power_settings_new,
            title: '1. Power On the Device',
            children: const [
              _BulletItem('Connect the ESP32 board to a power source (USB or battery pack).'),
              _BulletItem('The green Status LED (GPIO 2) will start blinking slowly — the device is connecting to Wi-Fi.'),
              _BulletItem('Once connected, the green LED stays solid — the device is ready.'),
              _BulletItem('If Wi-Fi fails, the device automatically enters Setup Mode (green LED blinks fast).'),
            ],
          ),
          _SectionCard(
            icon: Icons.wifi,
            title: '2. First-Time Wi-Fi Setup',
            children: const [
              _BulletItem('Hold the Reset button (GPIO 0) for 1 second during power-on to force Setup Mode.'),
              _BulletItem('Connect your phone to the "SONOCARDIA_SETUP" Wi-Fi network (open, no password).'),
              _BulletItem('A setup page should open automatically. If not, go to http://192.168.4.1 in your browser.'),
              _BulletItem('Login with the default credentials:\n  • Username: admin\n  • Password: admin'),
              _BulletItem('Enter your home Wi-Fi name (SSID) and password, then tap "Save & Reboot".'),
              _BulletItem('The device will reboot and connect to your Wi-Fi network. Note its IP address.'),
            ],
          ),
          _SectionCard(
            icon: Icons.sensors,
            title: '3. Attach the Sensors',
            subtitle: 'ECG Electrodes (AD8232 — 3-lead)',
            children: const [
              _BulletItem('RA (Right Arm) — place on right wrist or right side of chest.'),
              _BulletItem('LA (Left Arm) — place on left wrist or left side of chest.'),
              _BulletItem('RL (Right Leg / Reference) — place on right ankle or lower abdomen.'),
              _BulletItem('Make sure the skin is clean and dry for best contact.'),
              SizedBox(height: 8),
              _SubHeading('Heart Sound Microphone (MAX9814)'),
              _BulletItem('Place the microphone / stethoscope head firmly on the chest.'),
              _BulletItem('Best position: left 4th intercostal space (between the ribs) for clear S1/S2 sounds.'),
              _BulletItem('Keep still during recording to minimize noise.'),
            ],
          ),
          _SectionCard(
            icon: Icons.phonelink,
            title: '4. Connect the App',
            children: const [
              _BulletItem('Open the Sonocardia app → Monitor tab.'),
              _BulletItem('Enter the ESP32 IP address and port (default: 8765).'),
              _BulletItem('Tap "Connect". A green indicator means you\'re connected.'),
              _BulletItem('Or use "Auto Scan" — the app will search your network for the device automatically.'),
              _BulletItem('The app auto-reconnects if the connection drops.'),
            ],
          ),
          _SectionCard(
            icon: Icons.monitor_heart,
            title: '5. Live Monitoring',
            children: const [
              _BulletItem('The ECG waveform appears in real time with a hospital-style grid.'),
              _BulletItem('BPM is displayed with a heart-zone label (Bradycardia, Normal, Elevated, Tachycardia).'),
              _BulletItem('The animated heart icon pulses with each detected heartbeat.'),
              _BulletItem('HRV metrics (SDNN, RMSSD) and signal quality percentage are updated continuously.'),
              _BulletItem('A "FLATLINE" alarm triggers if no heartbeat is detected for 12 seconds.'),
              _BulletItem('An "IRREGULAR" badge appears if the rhythm is irregular.'),
            ],
          ),
          _SectionCard(
            icon: Icons.fiber_manual_record,
            iconColor: Colors.red,
            title: '6. Recording a Session',
            children: const [
              _BulletItem('Tap the red Record button on the Monitor screen while connected.'),
              _BulletItem('A "REC" indicator appears in the app bar.'),
              _BulletItem('ECG, heart sound, BPM and volume data are all captured.'),
              _BulletItem('Tap Stop when finished — the session is saved automatically.'),
            ],
          ),
          _SectionCard(
            icon: Icons.history,
            title: '7. Reviewing Recordings',
            children: const [
              _BulletItem('Go to the History tab to see all saved sessions.'),
              _BulletItem('Tap a session to open the detail view.'),
              _BulletItem('Use Play / Pause / Stop to replay the ECG waveform.'),
              _BulletItem('Drag the slider to scrub through the recording.'),
              _BulletItem('Adjust playback speed (0.5× to 5×).'),
              _BulletItem('Heart sounds play along with the ECG playback.'),
              _BulletItem('View BPM trend, SDNN, RMSSD, and min/max BPM statistics.'),
            ],
          ),
          _SectionCard(
            icon: Icons.share,
            title: '8. Sharing & Importing',
            children: const [
              _BulletItem('In a session detail, tap the Share icon to send a .sono file via WhatsApp, email, etc.'),
              _BulletItem('To import: tap the folder icon in the History tab, or simply open a received .sono file — the app imports it automatically.'),
            ],
          ),
          _SectionCard(
            icon: Icons.lightbulb_outline,
            title: '9. LED Indicator Guide',
            children: const [
              _LedRow(color: Colors.green, label: 'Green (GPIO 2)', detail: 'Slow blink = connecting to Wi-Fi\nSolid = Wi-Fi connected\nFast blink = Setup Mode (AP)'),
              _LedRow(color: Colors.blue, label: 'Blue (GPIO 4)', detail: 'Solid = WebSocket server running\nBlink = client event or data status'),
              _LedRow(color: Colors.red, label: 'Red (GPIO 15)', detail: 'Solid = no client connected\nSlow blink = active error\nOff = all good'),
            ],
          ),
          _SectionCard(
            icon: Icons.tips_and_updates_outlined,
            title: '10. Tips & Troubleshooting',
            children: const [
              _BulletItem('Force Setup Mode any time: hold the Reset button (GPIO 0) during power-on for 1 second.'),
              _BulletItem('Quick reboot: press the Reset button once during normal operation.'),
              _BulletItem('Portal credentials can be changed in the setup page to prevent unauthorized access.'),
              _BulletItem('If signal quality is low (<30%), check electrode adhesion and stay still.'),
              _BulletItem('The RL (reference) electrode is the most important for signal quality — ensure firm contact.'),
              _BulletItem('If the app can\'t connect, verify your phone and the ESP32 are on the same Wi-Fi network.'),
              _BulletItem('Release builds need the IP entered manually or found via Auto Scan.'),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ── Reusable widgets ──────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final IconData icon;
  final Color? iconColor;
  final String title;
  final String? subtitle;
  final List<Widget> children;

  const _SectionCard({
    required this.icon,
    this.iconColor,
    required this.title,
    this.subtitle,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20, color: iconColor ?? Colors.greenAccent),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(title,
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(subtitle!,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Colors.grey[400])),
            ],
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _BulletItem extends StatelessWidget {
  final String text;
  const _BulletItem(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 6, right: 8),
            child: Icon(Icons.circle, size: 6, color: Colors.grey),
          ),
          Expanded(
            child: Text(text,
                style: const TextStyle(fontSize: 13.5, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

class _SubHeading extends StatelessWidget {
  final String text;
  const _SubHeading(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(text,
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: Colors.grey[400])),
    );
  }
}

class _LedRow extends StatelessWidget {
  final Color color;
  final String label;
  final String detail;
  const _LedRow({
    required this.color,
    required this.label,
    required this.detail,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 4, right: 8),
            child: Icon(Icons.circle, size: 10, color: color),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(detail,
                    style: TextStyle(fontSize: 12.5, color: Colors.grey[400], height: 1.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
