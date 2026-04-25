import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ============================================================
//  SettingsScreen — App configuration & about
// ============================================================

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _ipCtrl;
  late final TextEditingController _portCtrl;
  double _peakThreshold = 2500;
  double _peakHysteresis = 2000;
  bool _soundEnabled = true;

  // Callbacks set by parent to apply settings live
  void Function(String ip, String port)? onConnectionChanged;
  void Function(double threshold, double hysteresis)? onThresholdsChanged;
  void Function(bool enabled)? onSoundChanged;

  @override
  void initState() {
    super.initState();
    _ipCtrl = TextEditingController();
    _portCtrl = TextEditingController();
    _loadSettings();
  }

  /// Called externally when the tab becomes visible.
  void reload() => _loadSettings();

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _ipCtrl.text = prefs.getString('esp32_ip') ?? '192.168.1.100';
      _portCtrl.text = prefs.getString('esp32_port') ?? '8765';
      _peakThreshold = prefs.getDouble('peak_threshold') ?? 2500;
      _peakHysteresis = prefs.getDouble('peak_hysteresis') ?? 2000;
      _soundEnabled = prefs.getBool('sound_enabled') ?? true;
    });
  }

  Future<void> _saveSettings() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('esp32_ip', _ipCtrl.text.trim());
    await prefs.setString('esp32_port', _portCtrl.text.trim());
    await prefs.setDouble('peak_threshold', _peakThreshold);
    await prefs.setDouble('peak_hysteresis', _peakHysteresis);
    await prefs.setBool('sound_enabled', _soundEnabled);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Settings saved'),
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 1),
        ),
      );
    }
  }

  @override
  void dispose() {
    _ipCtrl.dispose();
    _portCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.settings, color: Colors.grey),
            SizedBox(width: 8),
            Text('Settings'),
          ],
        ),
        actions: [
          TextButton.icon(
            onPressed: _saveSettings,
            icon: const Icon(Icons.save, size: 18),
            label: const Text('Save'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          _buildSection(
            'Connection',
            Icons.wifi,
            [
              _buildTextField('ESP32 IP Address', _ipCtrl,
                  keyboardType: TextInputType.number),
              const SizedBox(height: 10),
              _buildTextField('WebSocket Port', _portCtrl,
                  keyboardType: TextInputType.number),
            ],
          ),
          const SizedBox(height: 16),
          _buildSection(
            'ECG Processing',
            Icons.tune,
            [
              _buildSlider(
                'R-Peak Threshold',
                _peakThreshold,
                1000,
                4000,
                (v) => setState(() => _peakThreshold = v),
              ),
              _buildSlider(
                'Peak Hysteresis',
                _peakHysteresis,
                500,
                3500,
                (v) => setState(() => _peakHysteresis = v),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'Adjust these if R-peaks are not being detected correctly. '
                  'Higher threshold = less sensitive. '
                  'Hysteresis must be below threshold.',
                  style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildSection(
            'Audio',
            Icons.volume_up,
            [
              SwitchListTile(
                title: const Text('Heart Monitor Sounds'),
                subtitle: const Text('Beep on R-peak, flatline alarm'),
                value: _soundEnabled,
                onChanged: (v) => setState(() => _soundEnabled = v),
                contentPadding: EdgeInsets.zero,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildSection(
            'About',
            Icons.info_outline,
            [
              const ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Sonocardia',
                    style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('AI-Powered Cardiac Health Monitor\nv1.0.0'),
              ),
              const Divider(),
              _buildInfoRow('ECG Sensor', 'AD8232'),
              _buildInfoRow('PCG Sensor', 'MAX9814'),
              _buildInfoRow('ECG Sample Rate', '360 Hz (MIT-BIH)'),
              _buildInfoRow('PCG Sample Rate', '4000 Hz'),
              _buildInfoRow('MCU', 'ESP32 (Dual-Core)'),
              _buildInfoRow('Protocol', 'WebSocket (RFC 6455)'),
            ],
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildSection(String title, IconData icon, List<Widget> children) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20, color: Colors.cyanAccent),
                const SizedBox(width: 8),
                Text(title,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController ctrl,
      {TextInputType? keyboardType}) {
    return TextField(
      controller: ctrl,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
    );
  }

  Widget _buildSlider(String label, double value, double min, double max,
      ValueChanged<double> onChanged) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontSize: 13)),
            Text(value.toInt().toString(),
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.bold)),
          ],
        ),
        Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          divisions: ((max - min) / 50).round(),
          onChanged: onChanged,
        ),
      ],
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: Colors.grey)),
          Text(value,
              style:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
