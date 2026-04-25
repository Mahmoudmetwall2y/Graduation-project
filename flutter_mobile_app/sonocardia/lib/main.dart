import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/history_screen.dart';
import 'screens/instructions_screen.dart';
import 'screens/monitor_screen.dart';
import 'screens/settings_screen.dart';

// ============================================================
//  SONOCARDIA — AI-Powered Cardiac Health Monitor
//
//  Features:
//    • Real-time ECG waveform with BPM & HRV analysis
//    • Heart-sound (PCG) volume visualization
//    • Animated heart synced to R-peaks
//    • Session recording & playback
//    • Arrhythmia detection
//    • Signal quality assessment
// ============================================================

void main() {
  runApp(const SonocardiaApp());
}

class SonocardiaApp extends StatelessWidget {
  const SonocardiaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sonocardia',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        colorSchemeSeed: Colors.red,
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

// ────────────────────────────────────────────────────────────
//  Home — Bottom navigation shell
// ────────────────────────────────────────────────────────────

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;
  final _historyKey = GlobalKey<State>();
  final _settingsKey = GlobalKey<State>();

  static const _intentChannel = MethodChannel('sonocardia/intent');

  late final List<Widget> _screens = [
    const MonitorScreen(),
    HistoryScreen(key: _historyKey),
    const InstructionsScreen(),
    SettingsScreen(key: _settingsKey),
  ];

  @override
  void initState() {
    super.initState();
    _checkIncomingFile();
  }

  Future<void> _checkIncomingFile() async {
    try {
      final String? path = await _intentChannel.invokeMethod('getIntentFile');
      if (path != null && path.isNotEmpty) {
        if (await File(path).exists()) {
          // Switch to History tab and import
          setState(() => _currentIndex = 1);
          await Future.delayed(const Duration(milliseconds: 300));
          final state = _historyKey.currentState;
          if (state != null) {
            (state as dynamic).importSonoFile(path);
          }
        }
      }
    } on MissingPluginException {
      // Platform channel not implemented — ignore
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) {
          setState(() => _currentIndex = i);
          if (i == 1) {
            // Refresh history when switching to the History tab
            final state = _historyKey.currentState;
            if (state != null) {
              (state as dynamic).reload();
            }
          } else if (i == 3) {
            // Refresh settings when switching to the Settings tab
            final state = _settingsKey.currentState;
            if (state != null) {
              (state as dynamic).reload();
            }
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.monitor_heart_outlined),
            selectedIcon: Icon(Icons.monitor_heart),
            label: 'Monitor',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history),
            label: 'History',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book),
            label: 'Guide',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}
