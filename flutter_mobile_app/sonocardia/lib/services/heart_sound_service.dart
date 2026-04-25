import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

// ============================================================
//  HeartSoundService
//
//  Plays cardiac-monitor audio:
//    • Short "tet" beep on each detected R-peak
//    • Continuous "teeeeeeet" tone on flatline (no peaks)
//
//  WAV files are written once to the app cache directory
//  and reused via DeviceFileSource to prevent MediaPlayer leaks.
// ============================================================

class HeartSoundService {
  // ── Audio players (reused) ──
  final AudioPlayer _beepPlayer = AudioPlayer();
  final AudioPlayer _flatlinePlayer = AudioPlayer();

  // ── File-based sources (no per-play allocation) ──
  DeviceFileSource? _beepSource;
  DeviceFileSource? _flatlineSource;

  // ── Callback for UI updates (e.g. flatline indicator) ──
  VoidCallback? onFlatlineChanged;

  // ── State ──
  bool _initialized = false;
  bool _enabled = true;
  bool _monitoring = false;
  bool _flatlinePlaying = false;
  bool _inPeak = false;
  bool _hadFirstPeak = false;
  DateTime _lastBeepTime = DateTime(2000);
  Timer? _flatlineTimer;

  // ── Tuning ──
  /// ECG ADC value above which is considered an R-peak.
  double peakThreshold = 2500;

  /// Must drop below this before the next peak can fire.
  double peakHysteresis = 2000;

  /// Minimum time between two beeps (avoids double-triggers).
  Duration minBeepInterval = const Duration(milliseconds: 600);

  /// Time without a peak before flatline alarm starts.
  Duration flatlineTimeout = const Duration(seconds: 12);

  // track how many peaks seen since connect (need >=2 before arming watchdog)
  int _peaksSinceConnect = 0;

  // ── Getters ──
  bool get enabled => _enabled;
  bool get isFlatline => _flatlinePlaying;

  /// Called by EcgProcessor.onRPeak so sound is driven by the same peak
  /// detector used for BPM — no separate threshold needed here.
  void onRPeakDetected() {
    if (!_enabled || !_initialized || !_monitoring) return;
    final now = DateTime.now();
    if (now.difference(_lastBeepTime) > minBeepInterval) {
      _peaksSinceConnect++;
      // Arm the flatline watchdog only after 2 confirmed peaks
      // (avoids false alarms during initial calibration noise)
      if (_peaksSinceConnect >= 2) _hadFirstPeak = true;
      _playBeep();
      _lastBeepTime = now;
      _resetFlatlineTimer();
      if (_flatlinePlaying) _stopFlatline();
    }
  }

  // ────────────────── Init ──────────────────

  Future<void> init() async {
    if (_initialized) return;

    final dir = await getTemporaryDirectory();

    // Write WAV files once to disk
    final beepFile = File('${dir.path}/sonocardia_beep.wav');
    final flatlineFile = File('${dir.path}/sonocardia_flatline.wav');

    await beepFile.writeAsBytes(
      _generateWav(frequency: 1000, durationMs: 80),
    );
    await flatlineFile.writeAsBytes(
      _generateWav(frequency: 1000, durationMs: 2000),
    );

    _beepSource = DeviceFileSource(beepFile.path);
    _flatlineSource = DeviceFileSource(flatlineFile.path);

    // Beep player: play once and stop
    await _beepPlayer.setReleaseMode(ReleaseMode.stop);
    // Flatline player: loop continuously
    await _flatlinePlayer.setReleaseMode(ReleaseMode.loop);

    _initialized = true;
  }

  // ────────────────── Sound toggle ──────────────────

  set enabled(bool value) {
    _enabled = value;
    if (!value) {
      _beepPlayer.stop();
      _stopFlatline();
      _flatlineTimer?.cancel();
    } else if (_monitoring && _hadFirstPeak) {
      _resetFlatlineTimer();
    }
  }

  // ────────────────── Connection lifecycle ──────────────────

  void onConnected() {
    _monitoring = true;
    _inPeak = false;
    _hadFirstPeak = false;
    _peaksSinceConnect = 0;
    _lastBeepTime = DateTime(2000);
    // Flatline timer starts only after the first detected peak.
  }

  void onDisconnected() {
    _monitoring = false;
    _hadFirstPeak = false;
    _flatlineTimer?.cancel();
    _beepPlayer.stop();
    _stopFlatline();
  }

  // ────────────────── Feed ECG samples ──────────────────

  void processEcgSample(double value) {
    if (!_enabled || !_initialized || !_monitoring) return;

    final now = DateTime.now();

    // Rising edge: crosses above threshold → possible R-peak
    if (!_inPeak && value > peakThreshold) {
      _inPeak = true;
      if (now.difference(_lastBeepTime) > minBeepInterval) {
        _hadFirstPeak = true;
        _playBeep();
        _lastBeepTime = now;
        _resetFlatlineTimer();
        if (_flatlinePlaying) _stopFlatline();
      }
    }
    // Falling edge: drops below hysteresis → re-arm detector
    else if (_inPeak && value < peakHysteresis) {
      _inPeak = false;
    }
  }

  // ────────────────── Internal helpers ──────────────────

  bool _beepLoaded = false;
  bool _flatlineLoaded = false;

  Future<void> _playBeep() async {
    if (!_beepLoaded) {
      // First play — load + set source
      await _beepPlayer.setSource(_beepSource!);
      _beepLoaded = true;
    }
    await _beepPlayer.seek(Duration.zero);
    await _beepPlayer.resume();
  }

  void _resetFlatlineTimer() {
    if (!_hadFirstPeak) return;
    _flatlineTimer?.cancel();
    _flatlineTimer = Timer(flatlineTimeout, _startFlatline);
  }

  Future<void> _startFlatline() async {
    if (!_enabled || _flatlinePlaying || !_monitoring) return;
    _flatlinePlaying = true;
    if (!_flatlineLoaded) {
      await _flatlinePlayer.setSource(_flatlineSource!);
      _flatlineLoaded = true;
    }
    await _flatlinePlayer.seek(Duration.zero);
    await _flatlinePlayer.resume();
    onFlatlineChanged?.call();
  }

  void _stopFlatline() {
    if (!_flatlinePlaying) return;
    _flatlinePlaying = false;
    _flatlinePlayer.pause();
    onFlatlineChanged?.call();
  }

  void dispose() {
    _flatlineTimer?.cancel();
    _beepPlayer.dispose();
    _flatlinePlayer.dispose();
  }

  // ────────────────── WAV generator ──────────────────

  /// Creates mono 16-bit PCM WAV data in memory.
  Uint8List _generateWav({
    required double frequency,
    required int durationMs,
    double amplitude = 0.8,
    int sampleRate = 44100,
  }) {
    final numSamples = (sampleRate * durationMs / 1000).round();
    final dataSize = numSamples * 2; // 16-bit = 2 bytes / sample
    final bytes = ByteData(44 + dataSize);

    // ── RIFF header ──
    _ascii(bytes, 0, 'RIFF');
    bytes.setUint32(4, 36 + dataSize, Endian.little);
    _ascii(bytes, 8, 'WAVE');

    // ── fmt  chunk ──
    _ascii(bytes, 12, 'fmt ');
    bytes.setUint32(16, 16, Endian.little); // sub-chunk size
    bytes.setUint16(20, 1, Endian.little); // PCM
    bytes.setUint16(22, 1, Endian.little); // mono
    bytes.setUint32(24, sampleRate, Endian.little);
    bytes.setUint32(28, sampleRate * 2, Endian.little); // byte rate
    bytes.setUint16(32, 2, Endian.little); // block align
    bytes.setUint16(34, 16, Endian.little); // bits / sample

    // ── data chunk ──
    _ascii(bytes, 36, 'data');
    bytes.setUint32(40, dataSize, Endian.little);

    // ── Sine-wave samples with 5 ms fade-in / fade-out ──
    final fadeSamples = (sampleRate * 0.005).round();
    for (int i = 0; i < numSamples; i++) {
      double s = sin(2 * pi * frequency * i / sampleRate) * amplitude;
      if (i < fadeSamples) s *= i / fadeSamples;
      if (i > numSamples - fadeSamples) s *= (numSamples - i) / fadeSamples;
      bytes.setInt16(
        44 + i * 2,
        (s * 32767).round().clamp(-32768, 32767),
        Endian.little,
      );
    }

    return bytes.buffer.asUint8List();
  }

  void _ascii(ByteData bd, int offset, String s) {
    for (int i = 0; i < s.length; i++) {
      bd.setUint8(offset + i, s.codeUnitAt(i));
    }
  }
}
