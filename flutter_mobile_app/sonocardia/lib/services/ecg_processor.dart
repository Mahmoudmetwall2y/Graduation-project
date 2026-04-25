import 'dart:math';

// ============================================================
//  EcgProcessor — Real-time ECG signal analysis
//
//  Features:
//    • R-peak detection with adaptive threshold
//    • Heart Rate (BPM) from R-R intervals
//    • HRV metrics: SDNN, RMSSD
//    • Signal quality estimation
//    • BPM trend history for graphing
//    • Arrhythmia flag (irregular R-R)
// ============================================================

class EcgProcessor {
  // ── Configuration ──
  double _peakThreshold;
  double _peakHysteresis;
  int sampleRate;

  // ── R-peak detection state ──
  bool _inPeak = false;        // true while signal is above threshold (tracking max)
  double _currentPeakVal = 0; // track true maximum during a QRS event
  int _currentPeakIdx = 0;    // sample index of the tracked maximum
  int _sampleCount = 0;
  int _lastPeakSample = -1;
  // recent detected peak amplitudes and their sample index (for 10s moving avg)
  final List<double> _recentPeakAmps = [];
  final List<int> _recentPeakSamples = [];

  // ── R-R intervals (in samples) ──
  final List<int> _rrIntervals = [];
  static const int _maxRrIntervals = 30;

  // ── BPM ──
  double _currentBpm = 0;
  double _avgBpm = 0;
  double _minBpm = double.infinity;
  double _maxBpm = 0;
  final List<double> _bpmHistory = [];
  static const int _maxBpmHistory = 300; // ~5 min at 1 entry/sec

  // ── HRV ──
  double _sdnn = 0;
  double _rmssd = 0;

  // ── Signal Quality ──
  double _signalQuality = 0;
  final List<double> _recentSamples = [];
  static const int _qualityWindow = 360; // 1 second
  // Long window (10s) sample buffer for adaptive threshold fallback
  final List<double> _longRecentSamples = [];

  // ── Arrhythmia ──
  bool _irregularRhythm = false;

  // ── Callbacks ──
  void Function(double bpm)? onBpmUpdate;
  void Function()? onRPeak;

  // ── Auto-calibration state ──
  bool _calibrating = false;
  int _calibStartSample = 0;
  double _calibMin = double.infinity;
  double _calibMax = -double.infinity;

  // ── Running signal envelope (slow EMA, updated every 0.5s) ──
  double _envMin = double.infinity;  // EMA of signal minimum
  double _envMax = -double.infinity; // EMA of signal maximum
  int _lastThresholdUpdate = 0;      // sample index of last threshold recalc

  // ── BPM display gate (only push to UI every 5 s) ──
  int _lastBpmEmitSample = 0;

  EcgProcessor({
    this.sampleRate = 360,
    double peakThreshold = 1500,
    double peakHysteresis = 1000,
  })  : _peakThreshold = peakThreshold,
        _peakHysteresis = peakHysteresis;

  // ── Getters ──
  double get currentBpm => _currentBpm;
  double get avgBpm => _avgBpm;
  double get minBpm => _minBpm == double.infinity ? 0 : _minBpm;
  double get maxBpm => _maxBpm;
  double get sdnn => _sdnn;
  double get rmssd => _rmssd;
  double get signalQuality => _signalQuality;
  bool get irregularRhythm => _irregularRhythm;
  List<double> get bpmHistory => List.unmodifiable(_bpmHistory);
  int get beatCount => _rrIntervals.length;
  double get peakThreshold => _peakThreshold;
  double get peakHysteresis => _peakHysteresis;

  void reset() {
    _inPeak = false;
    _currentPeakVal = 0;
    _currentPeakIdx = 0;
    _sampleCount = 0;
    _lastPeakSample = -1;
    _rrIntervals.clear();
    _recentPeakAmps.clear();
    _recentPeakSamples.clear();
    _longRecentSamples.clear();
    _calibrating = false;
    _envMin = double.infinity;
    _envMax = -double.infinity;
    _lastThresholdUpdate = 0;
    _lastBpmEmitSample = 0;
    _currentBpm = 0;
    _avgBpm = 0;
    _minBpm = double.infinity;
    _maxBpm = 0;
    _bpmHistory.clear();
    _sdnn = 0;
    _rmssd = 0;
    _signalQuality = 0;
    _recentSamples.clear();
    _irregularRhythm = false;
  }

  /// Feed one raw ADC sample. Call for every sample at [sampleRate] Hz.
  void processSample(double value) {
    _sampleCount++;

    // Quality tracking buffer
    _recentSamples.add(value);
    if (_recentSamples.length > _qualityWindow) {
      _recentSamples.removeAt(0);
    }
    // Long buffer for threshold fallback (10s)
    _longRecentSamples.add(value);
    final longMaxLen = sampleRate * 10;
    if (_longRecentSamples.length > longMaxLen) {
      _longRecentSamples.removeAt(0);
    }

    // ── R-peak detection (rising-edge trigger) ──
    // Refractory 400 ms: blocks T-waves (which arrive ~300–360 ms after R-peak)
    // while still detecting up to 150 BPM (RR ≥ 400 ms).
    final refractorySamples = (sampleRate * 0.400).round();
    final sinceLastPeak = (_lastPeakSample > 0) ? (_sampleCount - _lastPeakSample) : 9999999;

    // Debug print: show raw ADC vs adaptive threshold every ~200 ms
    final debugInterval = max(1, sampleRate ~/ 5);
    if (_sampleCount % debugInterval == 0) {
      print('[ECG] ADC=${value.toStringAsFixed(1)} TH=${_peakThreshold.toStringAsFixed(1)}');
    }

    // --- Adaptive threshold: update every 0.5 s using robust percentile envelope ---
    // Only runs outside of active peak tracking to avoid corrupting the gate.
    final threshUpdateInterval = sampleRate ~/ 2; // every 0.5 s
    if (!_inPeak &&
        _longRecentSamples.length >= max(100, sampleRate) &&
        (_sampleCount - _lastThresholdUpdate) >= threshUpdateInterval) {
      _lastThresholdUpdate = _sampleCount;

      // Sort a copy to get robust P5/P95 — ignores artifact spikes entirely.
      // One spike at ADC=2938 sits at ~P99.9 of 3600 samples and won't move P95.
      final sorted = List<double>.from(_longRecentSamples)..sort();
      final p5  = sorted[(sorted.length * 0.05).round().clamp(0, sorted.length - 1)];
      final p95 = sorted[(sorted.length * 0.95).round().clamp(0, sorted.length - 1)];

      // Smooth envelope with EMA (alpha ≈ 0.15 → ~3s time constant at 0.5s update)
      const emaAlpha = 0.15;
      if (_envMin == double.infinity) {
        _envMin = p5;
        _envMax = p95;
      } else {
        _envMin = _envMin * (1 - emaAlpha) + p5  * emaAlpha;
        _envMax = _envMax * (1 - emaAlpha) + p95 * emaAlpha;
      }

      final amplitude = _envMax - _envMin;
      if (amplitude > 100) {
        final baseline = (_envMin + _envMax) / 2;
        // 65 % of the way from baseline to P95 sits well above T-waves.
        final newTh = baseline + (_envMax - baseline) * 0.65;
        // Low-pass: move current threshold 30 % toward the computed value per update
        _peakThreshold = _peakThreshold * 0.70 + newTh * 0.30;
      }
    }

    // --- Auto-calibration: collect samples for N seconds, then set threshold ---
    if (_calibrating) {
      final elapsedSamples = _sampleCount - _calibStartSample;
      if (elapsedSamples >= _calibDurationSamples) {
        // Use P5/P95 of the collected window — immune to artifact spikes.
        final windowLen = min(_longRecentSamples.length, _calibDurationSamples);
        final window = _longRecentSamples.sublist(_longRecentSamples.length - windowLen);
        final sorted = List<double>.from(window)..sort();
        final p5  = sorted[(sorted.length * 0.05).round().clamp(0, sorted.length - 1)];
        final p95 = sorted[(sorted.length * 0.95).round().clamp(0, sorted.length - 1)];
        final amp = p95 - p5;
        if (amp > 100) {
          final baseline = (p5 + p95) / 2;
          _peakThreshold = baseline + (p95 - baseline) * 0.65;
          _peakHysteresis = max(0.0, baseline + (p95 - baseline) * 0.35);
          // Seed EMA envelope so adaptive updates start from a good value.
          _envMin = p5;
          _envMax = p95;
          print('[ECG] Calibration done: P5=${p5.toStringAsFixed(1)} P95=${p95.toStringAsFixed(1)} baseline=${baseline.toStringAsFixed(1)} TH=${_peakThreshold.toStringAsFixed(1)}');
        } else {
          print('[ECG] Calibration failed: amplitude too small (${amp.toStringAsFixed(1)})');
        }
        _calibrating = false;
      }
    }

    // ── Local-maximum peak detector (rising + falling edge) ──
    //
    // Phase 1 (armed): wait for signal to rise above threshold after refractory.
    // Phase 2 (tracking): track the true maximum while signal stays above threshold.
    // Phase 3 (confirm): only fire the peak when signal falls back below threshold.
    //
    // This prevents T-waves / noise bumps that barely skim the threshold from
    // being counted — they never produce a proper falling edge before the
    // next refractory-gated rising edge.
    if (!_inPeak) {
      // Arm: signal crossed upward past threshold and refractory has expired
      if (value > _peakThreshold && sinceLastPeak >= refractorySamples) {
        _inPeak = true;
        _currentPeakVal = value;
        _currentPeakIdx = _sampleCount;
      }
    } else {
      if (value > _currentPeakVal) {
        // Still climbing — track the true maximum
        _currentPeakVal = value;
        _currentPeakIdx = _sampleCount;
      } else if (value < _peakThreshold) {
        // Fell back below threshold — confirm peak at _currentPeakIdx
        _inPeak = false;
        final peakSample = _currentPeakIdx;
        final peakAdc = _currentPeakVal;

        if (_lastPeakSample > 0) {
          final rrSamples = peakSample - _lastPeakSample;
          final rrMs = (rrSamples * 1000) ~/ sampleRate;

          // Physiological sanity: 30–220 BPM → RR 273–2000 ms
          if (rrMs >= 273 && rrMs <= 2000) {
            _rrIntervals.add(rrSamples);
            if (_rrIntervals.length > _maxRrIntervals) {
              _rrIntervals.removeAt(0);
            }
            _updateHrv();
            _checkIrregularity();
          } else {
            print('[ECG] SKIP_PEAK rrMs=$rrMs (out of range)');
          }
        }

        // record confirmed peak for history (used by quality metrics)
        _recentPeakAmps.add(peakAdc);
        _recentPeakSamples.add(peakSample);
        final cutoff = _sampleCount - (10 * sampleRate);
        while (_recentPeakSamples.isNotEmpty && _recentPeakSamples.first < cutoff) {
          _recentPeakSamples.removeAt(0);
          _recentPeakAmps.removeAt(0);
        }

        // Recompute BPM after adding this confirmed peak so the 5 s window
        // includes the newest beat.
        _updateBpm();

        // After a confirmed peak, immediately update threshold from actual peak
        // amplitude — this is the most reliable signal we have.
        // New threshold = 70% of peak value (keeps us well above T-waves).
        if (_recentPeakAmps.length >= 2) {
          // Use median of last 3 peaks for robustness
          final recent = _recentPeakAmps.length >= 3
              ? _recentPeakAmps.sublist(_recentPeakAmps.length - 3)
              : _recentPeakAmps.toList();
          recent.sort();
          final medianPeak = recent[recent.length ~/ 2];
          final baseline = _envMin == double.infinity
              ? medianPeak * 0.85
              : (_envMin + _envMax) / 2;
          final newTh = baseline + (medianPeak - baseline) * 0.65;
          _peakThreshold = _peakThreshold * 0.70 + newTh * 0.30;
        }

        _lastPeakSample = peakSample;
        print('[ECG] PEAK ADC=${peakAdc.toStringAsFixed(1)} sample=$peakSample TH=${_peakThreshold.toStringAsFixed(1)}');
        onRPeak?.call();
      }
    }

    // Update quality every 0.5 s
    if (_sampleCount % (sampleRate ~/ 2) == 0) {
      _updateSignalQuality();
    }
  }

  void _updateBpm() {
    if (_rrIntervals.isEmpty) return;

    final lastRr = _rrIntervals.last;
    _currentBpm = (60.0 * sampleRate) / lastRr;

    // 5 s rolling BPM based on recent confirmed peaks.
    // This is more responsive and avoids stale values from older RR intervals.
    final windowSamples = sampleRate * 5;
    final cutoff = _sampleCount - windowSamples;
    final recentPeaks = _recentPeakSamples.where((s) => s >= cutoff).toList();

    if (recentPeaks.length >= 2) {
      final rrInWindow = <int>[];
      for (int i = 1; i < recentPeaks.length; i++) {
        final rr = recentPeaks[i] - recentPeaks[i - 1];
        final rrMs = (rr * 1000) ~/ sampleRate;
        if (rrMs >= 273 && rrMs <= 2000) {
          rrInWindow.add(rr);
        }
      }
      if (rrInWindow.isNotEmpty) {
        rrInWindow.sort();
        final medianRr = rrInWindow[rrInWindow.length ~/ 2];
        _avgBpm = (60.0 * sampleRate) / medianRr;
      } else {
        _avgBpm = _currentBpm;
      }
    } else {
      _avgBpm = _currentBpm;
    }

    if (_currentBpm < _minBpm) _minBpm = _currentBpm;
    if (_currentBpm > _maxBpm) _maxBpm = _currentBpm;

    _bpmHistory.add(_currentBpm);
    if (_bpmHistory.length > _maxBpmHistory) {
      _bpmHistory.removeAt(0);
    }

    // Only push to UI every 5 s to prevent rapid flickering.
    final emitIntervalSamples = sampleRate * 5;
    if (_sampleCount - _lastBpmEmitSample >= emitIntervalSamples) {
      _lastBpmEmitSample = _sampleCount;
      onBpmUpdate?.call(_avgBpm);
    }
  }

  // Called periodically to update timeout behaviour: if no peak seen for >3s, emit sentinel
  void checkForBpmTimeout() {
    if (_lastPeakSample < 0) return;
    final sinceLastMs = (_sampleCount - _lastPeakSample) * 1000 / sampleRate;
    if (sinceLastMs > 3000 && _currentBpm != -1) {
      // use -1 as sentinel meaning 'waiting for valid data' (UI should render '...')
      _currentBpm = -1;
      onBpmUpdate?.call(_currentBpm);
    }
  }

  // Auto-calibration helper: durationSeconds defaults to 5
  int _calibDurationSamples = 0;
  void startAutoCalibration([int durationSeconds = 5]) {
    _calibrating = true;
    _calibStartSample = _sampleCount;
    _calibMin = double.infinity;
    _calibMax = -double.infinity;
    _calibDurationSamples = durationSeconds * sampleRate;
    print('[ECG] Starting auto-calibration for ${durationSeconds}s');
  }

  void _updateHrv() {
    if (_rrIntervals.length < 3) {
      _sdnn = 0;
      _rmssd = 0;
      return;
    }

    final rrMs =
        _rrIntervals.map((rr) => (rr * 1000.0) / sampleRate).toList();

    // SDNN — standard deviation of NN intervals
    final mean = rrMs.reduce((a, b) => a + b) / rrMs.length;
    double sumSqDiff = 0;
    for (final rr in rrMs) {
      sumSqDiff += (rr - mean) * (rr - mean);
    }
    _sdnn = sqrt(sumSqDiff / rrMs.length);

    // RMSSD — root mean square of successive differences
    double sumSqSuccDiff = 0;
    for (int i = 1; i < rrMs.length; i++) {
      final d = rrMs[i] - rrMs[i - 1];
      sumSqSuccDiff += d * d;
    }
    _rmssd = sqrt(sumSqSuccDiff / (rrMs.length - 1));
  }

  void _checkIrregularity() {
    if (_rrIntervals.length < 5) {  // need minimum intervals for CV
      _irregularRhythm = false;
      return;
    }
    // Coefficient of variation > 20% → irregular
    final rrMs =
        _rrIntervals.map((rr) => (rr * 1000.0) / sampleRate).toList();
    final mean = rrMs.reduce((a, b) => a + b) / rrMs.length;
    double sumSqDiff = 0;
    for (final rr in rrMs) {
      sumSqDiff += (rr - mean) * (rr - mean);
    }
    final cv = sqrt(sumSqDiff / rrMs.length) / mean;
    _irregularRhythm = cv > 0.20;
  }

  void _updateSignalQuality() {
    if (_recentSamples.length < 100) {
      _signalQuality = 0;
      return;
    }

    double minVal = double.infinity;
    double maxVal = -double.infinity;
    for (final s in _recentSamples) {
      if (s < minVal) minVal = s;
      if (s > maxVal) maxVal = s;
    }
    final amplitude = maxVal - minVal;

    double quality = 0;

    // Amplitude check
    if (amplitude > 200 && amplitude < 4000) {
      quality += 40;
    } else if (amplitude > 100) {
      quality += 20;
    }

    // Peak detection working
    if (_rrIntervals.length >= 3) {
      quality += 30;
      if (_sdnn < 100) quality += 15;
      if (_sdnn < 50) quality += 15;
    } else if (_rrIntervals.isNotEmpty) {
      quality += 15;
    }

    _signalQuality = quality.clamp(0, 100);
  }

  void updateThresholds(double threshold, double hysteresis) {
    _peakThreshold = threshold;
    _peakHysteresis = hysteresis;
  }
}
