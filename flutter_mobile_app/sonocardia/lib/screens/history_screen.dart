import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../services/recording_service.dart';

// ============================================================
//  HistoryScreen — Browse & review past recording sessions
// ============================================================

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final RecordingService _service = RecordingService();
  List<SessionSummary>? _sessions;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadSessions();
  }

  /// Called externally when the tab becomes visible.
  void reload() => _loadSessions();

  /// Import a .sono file — can be called externally via dynamic dispatch.
  Future<void> importSonoFile([String? path]) => _importSonoFile(path);

  Future<void> _loadSessions() async {
    setState(() => _loading = true);
    final sessions = await _service.listSessions();
    if (mounted) {
      setState(() {
        _sessions = sessions;
        _loading = false;
      });
    }
  }

  Future<void> _deleteSession(String id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Recording?'),
        content: const Text('This action cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: FilledButton.styleFrom(backgroundColor: Colors.red[700]),
              child: const Text('Delete')),
        ],
      ),
    );
    if (confirm == true) {
      await _service.deleteSession(id);
      _loadSessions();
    }
  }

  void _openSession(SessionSummary summary) async {
    final session = await _service.loadSession(summary.id);
    if (session == null || !mounted) return;

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _SessionDetailScreen(session: session),
      ),
    );
  }

  Future<void> _importSonoFile([String? filePath]) async {
    String? path = filePath;

    if (path == null) {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.any,
        allowMultiple: false,
      );
      if (result == null || result.files.isEmpty) return;
      path = result.files.single.path;
      if (path == null) return;
    }

    if (!path.endsWith('.sono')) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please select a .sono file')),
        );
      }
      return;
    }

    final session = await _service.importSonoFile(path);
    if (!mounted) return;

    if (session != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Imported: ${session.avgBpm.toInt()} BPM session'),
        ),
      );
      _loadSessions();
      // Open the imported session
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => _SessionDetailScreen(session: session),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid .sono file')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.history, color: Colors.cyanAccent),
            SizedBox(width: 8),
            Text('Recording History'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.file_open),
            tooltip: 'Import .sono file',
            onPressed: _importSonoFile,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _sessions == null || _sessions!.isEmpty
              ? _buildEmpty()
              : _buildList(),
    );
  }

  Widget _buildEmpty() {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.folder_open, size: 64, color: Colors.grey),
          SizedBox(height: 12),
          Text('No recordings yet',
              style: TextStyle(fontSize: 18, color: Colors.grey)),
          SizedBox(height: 4),
          Text('Tap Record on the Monitor tab to start',
              style: TextStyle(fontSize: 13, color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _buildList() {
    return RefreshIndicator(
      onRefresh: _loadSessions,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: _sessions!.length,
        itemBuilder: (context, index) {
          final s = _sessions![index];
          return _buildSessionCard(s);
        },
      ),
    );
  }

  Widget _buildSessionCard(SessionSummary s) {
    final dur = s.duration;
    final durStr = dur.inMinutes > 0
        ? '${dur.inMinutes}m ${dur.inSeconds % 60}s'
        : '${dur.inSeconds}s';
    final dateStr = _formatDate(s.startTime);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => _openSession(s),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              // BPM circle
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _bpmColor(s.avgBpm).withValues(alpha: 0.15),
                  border: Border.all(
                      color: _bpmColor(s.avgBpm).withValues(alpha: 0.4)),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      s.avgBpm > 0 ? s.avgBpm.toInt().toString() : '--',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: _bpmColor(s.avgBpm)),
                    ),
                    Text('BPM',
                        style: TextStyle(
                            fontSize: 8,
                            color: _bpmColor(s.avgBpm))),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              // Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(dateStr,
                        style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        _miniStat(Icons.timer_outlined, durStr),
                        const SizedBox(width: 12),
                        _miniStat(Icons.swap_vert,
                            '${s.minBpm.toInt()}-${s.maxBpm.toInt()}'),
                        if (s.irregularRhythm) ...[
                          const SizedBox(width: 12),
                          const Icon(Icons.warning_amber,
                              size: 14, color: Colors.orangeAccent),
                          const SizedBox(width: 2),
                          const Text('Irregular',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.orangeAccent)),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              // Delete
              IconButton(
                icon: const Icon(Icons.delete_outline,
                    color: Colors.grey, size: 20),
                onPressed: () => _deleteSession(s.id),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _miniStat(IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: Colors.grey),
        const SizedBox(width: 3),
        Text(text, style: const TextStyle(fontSize: 12, color: Colors.grey)),
      ],
    );
  }

  Color _bpmColor(double bpm) {
    if (bpm <= 0) return Colors.grey;
    if (bpm < 60) return Colors.lightBlueAccent;
    if (bpm <= 100) return Colors.greenAccent;
    if (bpm <= 140) return Colors.orangeAccent;
    return Colors.redAccent;
  }

  String _formatDate(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';

    final months = [
      '',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${months[dt.month]} ${dt.day}, ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

// ============================================================
//  Session Detail Screen — Playback & sharing
// ============================================================

class _SessionDetailScreen extends StatefulWidget {
  final RecordingSession session;

  const _SessionDetailScreen({required this.session});

  @override
  State<_SessionDetailScreen> createState() => _SessionDetailScreenState();
}

class _SessionDetailScreenState extends State<_SessionDetailScreen> {
  final RecordingService _service = RecordingService();

  // ── Playback state ──
  late final double _actualEcgRate; // computed from wall-clock duration
  static const int _displayWindow = 900; // ~2.5 s of data on screen
  Timer? _playbackTimer;
  int _playbackIndex = 0;
  bool _isPlaying = false;
  double _playbackSpeed = 1.0;

  // Pre-computed centered ECG (EMA baseline subtracted, same as monitor)
  List<double> _centeredEcg = [];

  // ── PCG audio playback ──
  final AudioPlayer _pcgPlayer = AudioPlayer();
  String? _pcgWavPath;

  @override
  void initState() {
    super.initState();
    // Compute actual ECG sample rate from wall-clock recording duration.
    // The ESP32 loop can't sustain 360 Hz due to PCG oversampling overhead,
    // so we derive the real rate from timestamps.
    final dur = widget.session.duration;
    final durSec = dur.inMilliseconds / 1000.0;
    final ecgLen = widget.session.ecgSamples.length;
    _actualEcgRate = (durSec > 0.5 && ecgLen > 0) ? ecgLen / durSec : 360;
    _computeCenteredEcg();
    _preparePcgAudio();
  }

  @override
  void dispose() {
    _playbackTimer?.cancel();
    _pcgPlayer.stop();
    _pcgPlayer.dispose();
    super.dispose();
  }

  /// Compute baseline-subtracted ECG using the same per-sample EMA
  /// that the monitor screen uses (alpha = 0.002), so the playback
  /// waveform looks identical to what was shown live.
  void _computeCenteredEcg() {
    final raw = widget.session.ecgSamples;
    if (raw.isEmpty) {
      _centeredEcg = [];
      return;
    }
    _centeredEcg = List<double>.filled(raw.length, 0);
    double baseline = raw[0];
    for (int i = 0; i < raw.length; i++) {
      baseline += (raw[i] - baseline) * 0.002;
      _centeredEcg[i] = raw[i] - baseline;
    }
  }

  // ── PCG audio ──

  Future<void> _preparePcgAudio() async {
    final samples = widget.session.pcgSamples;
    if (samples.isEmpty) return;

    // Compute actual PCG rate from wall-clock duration (same as ECG).
    final dur = widget.session.duration;
    final durSec = dur.inMilliseconds / 1000.0;
    final actualPcgRate =
        (durSec > 0.5 && samples.isNotEmpty) ? samples.length / durSec : 5760;
    final wavBytes = _buildPcgWav(samples, sampleRate: actualPcgRate.round());
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/pcg_${widget.session.id}.wav');
    await file.writeAsBytes(wavBytes);
    _pcgWavPath = file.path;
  }

  /// Build a raw 16-bit mono WAV from raw ADC samples.
  /// No DSP — just DC removal + normalise + upsample to 8000 Hz
  /// for mobile audio compatibility.  Matches test_pcg_audio.py output.
  static Uint8List _buildPcgWav(List<double> rawSamples,
      {int sampleRate = 5760}) {
    final n = rawSamples.length;
    if (n == 0) return Uint8List(0);

    // ── 1. Remove DC offset ──
    double sum = 0;
    for (final s in rawSamples) {
      sum += s;
    }
    final dc = sum / n;

    // ── 2. Find peak for normalisation ──
    double maxAbs = 1;
    for (int i = 0; i < n; i++) {
      final a = (rawSamples[i] - dc).abs();
      if (a > maxAbs) maxAbs = a;
    }

    // ── 3. Upsample to 8000 Hz via nearest-neighbor ──
    // (matches test_pcg_audio.py: no interpolation smoothing)
    const int targetRate = 8000;
    final int outLen;
    final bool needsUpsample = sampleRate < targetRate;
    if (needsUpsample) {
      outLen = (n * targetRate / sampleRate).round();
    } else {
      outLen = n; // already at or above 8000 — keep as-is
    }

    // ── 4. Write WAV (same normalisation as test_pcg_audio.py: 32000 peak) ──
    final int wavRate = needsUpsample ? targetRate : sampleRate;
    final dataSize = outLen * 2;
    final bytes = ByteData(44 + dataSize);

    _wavAscii(bytes, 0, 'RIFF');
    bytes.setUint32(4, 36 + dataSize, Endian.little);
    _wavAscii(bytes, 8, 'WAVE');

    _wavAscii(bytes, 12, 'fmt ');
    bytes.setUint32(16, 16, Endian.little);
    bytes.setUint16(20, 1, Endian.little); // PCM
    bytes.setUint16(22, 1, Endian.little); // mono
    bytes.setUint32(24, wavRate, Endian.little);
    bytes.setUint32(28, wavRate * 2, Endian.little);
    bytes.setUint16(32, 2, Endian.little);
    bytes.setUint16(34, 16, Endian.little);

    _wavAscii(bytes, 36, 'data');
    bytes.setUint32(40, dataSize, Endian.little);

    if (needsUpsample) {
      final double step = sampleRate / targetRate; // < 1.0
      for (int i = 0; i < outLen; i++) {
        final int srcIdx = (i * step).floor().clamp(0, n - 1);
        final double v = (rawSamples[srcIdx] - dc) / maxAbs;
        int sv = (v * 32000).round();
        if (sv > 32767) sv = 32767;
        if (sv < -32768) sv = -32768;
        bytes.setInt16(44 + i * 2, sv, Endian.little);
      }
    } else {
      for (int i = 0; i < n; i++) {
        final double v = (rawSamples[i] - dc) / maxAbs;
        int sv = (v * 32000).round();
        if (sv > 32767) sv = 32767;
        if (sv < -32768) sv = -32768;
        bytes.setInt16(44 + i * 2, sv, Endian.little);
      }
    }

    return bytes.buffer.asUint8List();
  }

  static void _wavAscii(ByteData bd, int offset, String s) {
    for (int i = 0; i < s.length; i++) {
      bd.setUint8(offset + i, s.codeUnitAt(i));
    }
  }

  // ── Playback controls ──

  void _togglePlayback() {
    if (_isPlaying) {
      _pausePlayback();
    } else {
      _startPlayback();
    }
  }

  void _startPlayback() {
    if (widget.session.ecgSamples.isEmpty) return;
    if (_playbackIndex >= widget.session.ecgSamples.length) {
      _playbackIndex = 0;
    }

    // Advance by a batch of samples each tick to simulate real-time.
    // batch = actualRate * 0.05 at 1× speed.
    final batchSize = (_actualEcgRate * 0.05 * _playbackSpeed).round().clamp(1, 360);
    const tickMs = 50;

    _playbackTimer = Timer.periodic(
      const Duration(milliseconds: tickMs),
      (_) {
        setState(() {
          _playbackIndex += batchSize;
          if (_playbackIndex >= widget.session.ecgSamples.length) {
            _playbackIndex = widget.session.ecgSamples.length;
            _pausePlayback();
          }
        });
      },
    );
    setState(() => _isPlaying = true);

    // Sync PCG audio with ECG graph playback
    if (_pcgWavPath != null) {
      final seekMs = (_playbackIndex / _actualEcgRate * 1000).round();
      _pcgPlayer.play(DeviceFileSource(_pcgWavPath!)).then((_) {
        _pcgPlayer.seek(Duration(milliseconds: seekMs));
        _pcgPlayer.setPlaybackRate(_playbackSpeed);
      });
    }
  }

  void _pausePlayback() {
    _playbackTimer?.cancel();
    _playbackTimer = null;
    _pcgPlayer.pause();
    setState(() => _isPlaying = false);
  }

  void _stopPlayback() {
    _pausePlayback();
    _pcgPlayer.stop();
    setState(() => _playbackIndex = 0);
  }

  // ── Share ──

  Future<void> _shareSession() async {
    final session = widget.session;
    final sonoPath = await _service.exportSonoFile(session);

    await Share.shareXFiles(
      [XFile(sonoPath, mimeType: 'application/octet-stream')],
      subject: 'Sonocardia ECG Report — ${session.avgBpm.toInt()} BPM',
      text:
          'ECG Session Report\n'
          'Avg BPM: ${session.avgBpm.toInt()}\n'
          'Duration: ${session.duration.inSeconds}s\n'
          'Open this .sono file in the Sonocardia app to replay the ECG.',
    );
  }

  // ── Build ──

  @override
  Widget build(BuildContext context) {
    final dur = widget.session.duration;
    final durStr = dur.inMinutes > 0
        ? '${dur.inMinutes}m ${dur.inSeconds % 60}s'
        : '${dur.inSeconds}s';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Session Detail'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            tooltip: 'Share via WhatsApp or other apps',
            onPressed: _shareSession,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          _buildStatsGrid(durStr),
          const SizedBox(height: 16),
          if (widget.session.ecgSamples.isNotEmpty) _buildPlaybackCard(),
          const SizedBox(height: 16),
          if (widget.session.bpmReadings.length >= 2) _buildBpmTrend(),
          const SizedBox(height: 16),
          _buildShareCard(),
        ],
      ),
    );
  }

  Widget _buildPlaybackCard() {
    final samples = _centeredEcg;
    final totalSamples = samples.length;

    // Determine which window of samples to show
    final windowEnd = _playbackIndex > 0 ? _playbackIndex : _displayWindow;
    final windowStart =
        (windowEnd - _displayWindow).clamp(0, totalSamples);
    final actualEnd = windowEnd.clamp(0, totalSamples);

    // Offset so signal is right-aligned within the fixed-width window
    final visibleCount = actualEnd - windowStart;
    final xOffset = _displayWindow - visibleCount;

    final spots = <FlSpot>[];
    for (int i = windowStart; i < actualEnd; i++) {
      spots.add(FlSpot(
        (i - windowStart + xOffset).toDouble(),
        samples[i],
      ));
    }

    final progress = totalSamples > 0 ? _playbackIndex / totalSamples : 0.0;
    final currentTimeSec = _playbackIndex / _actualEcgRate;
    final totalTimeSec = totalSamples / _actualEcgRate;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.monitor_heart, color: Colors.greenAccent, size: 18),
                const SizedBox(width: 6),
                const Text('ECG Playback',
                    style: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w600)),
                if (widget.session.pcgSamples.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  const Icon(Icons.hearing,
                      color: Colors.deepPurpleAccent, size: 16),
                  const Text(' + Sound',
                      style: TextStyle(
                          fontSize: 13, color: Colors.deepPurpleAccent)),
                ],
              ],
            ),
            const SizedBox(height: 12),
            // ECG waveform
            SizedBox(
              height: 240,
              child: spots.length >= 2
                  ? LineChart(
                      LineChartData(
                        minX: 0,
                        maxX: _displayWindow.toDouble(),
                        minY: -800,
                        maxY: 800,
                        clipData: const FlClipData.all(),
                        gridData: FlGridData(
                          show: true,
                          drawVerticalLine: true,
                          horizontalInterval: 500,
                          verticalInterval: _actualEcgRate / 4,
                          getDrawingHorizontalLine: (value) => FlLine(
                            color: value == 0
                                ? Colors.white24
                                : const Color(0x0DFFA4A4),
                            strokeWidth: value == 0 ? 1.2 : 0.5,
                          ),
                          getDrawingVerticalLine: (value) => const FlLine(
                            color: Color(0x0DFFA4A4),
                            strokeWidth: 0.5,
                          ),
                        ),
                        titlesData: const FlTitlesData(show: false),
                        borderData: FlBorderData(
                          show: true,
                          border: Border.all(color: Colors.white12),
                        ),
                        lineBarsData: [
                          LineChartBarData(
                            spots: spots,
                            isCurved: false,
                            color: Colors.greenAccent,
                            barWidth: 1.5,
                            dotData: const FlDotData(show: false),
                            belowBarData: BarAreaData(
                              show: true,
                              color: Colors.greenAccent.withValues(alpha: 0.05),
                            ),
                          ),
                        ],
                        lineTouchData: const LineTouchData(enabled: false),
                      ),
                      duration: Duration.zero,
                    )
                  : const Center(
                      child: Text('Press play to start',
                          style: TextStyle(color: Colors.grey))),
            ),
            const SizedBox(height: 10),
            // Progress slider
            SliderTheme(
              data: SliderThemeData(
                trackHeight: 3,
                thumbShape:
                    const RoundSliderThumbShape(enabledThumbRadius: 6),
                overlayShape:
                    const RoundSliderOverlayShape(overlayRadius: 14),
                activeTrackColor: Colors.greenAccent,
                inactiveTrackColor: Colors.white12,
                thumbColor: Colors.greenAccent,
              ),
              child: Slider(
                value: progress.clamp(0.0, 1.0),
                onChanged: (v) {
                  setState(() {
                    _playbackIndex = (v * totalSamples).round();
                  });
                  if (_pcgWavPath != null) {
                    final seekMs =
                        (_playbackIndex / _actualEcgRate * 1000).round();
                    _pcgPlayer.seek(Duration(milliseconds: seekMs));
                  }
                },
                onChangeStart: (_) {
                  if (_isPlaying) _pausePlayback();
                },
              ),
            ),
            // Time + controls
            Row(
              children: [
                Text(
                  '${currentTimeSec.toStringAsFixed(1)}s / ${totalTimeSec.toStringAsFixed(1)}s',
                  style: const TextStyle(fontSize: 11, color: Colors.grey),
                ),
                const Spacer(),
                // Speed selector
                DropdownButton<double>(
                  value: _playbackSpeed,
                  underline: const SizedBox(),
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                  items: const [
                    DropdownMenuItem(value: 0.5, child: Text('0.5×')),
                    DropdownMenuItem(value: 1.0, child: Text('1×')),
                    DropdownMenuItem(value: 2.0, child: Text('2×')),
                    DropdownMenuItem(value: 5.0, child: Text('5×')),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    final wasPlaying = _isPlaying;
                    if (wasPlaying) _pausePlayback();
                    setState(() => _playbackSpeed = v);
                    if (wasPlaying) _startPlayback();
                  },
                ),
                const SizedBox(width: 8),
                // Stop
                IconButton(
                  icon: const Icon(Icons.stop, size: 22),
                  color: Colors.grey,
                  onPressed: _stopPlayback,
                  tooltip: 'Stop',
                ),
                // Play / Pause
                IconButton(
                  icon: Icon(
                    _isPlaying ? Icons.pause_circle : Icons.play_circle,
                    size: 32,
                  ),
                  color: Colors.greenAccent,
                  onPressed: _togglePlayback,
                  tooltip: _isPlaying ? 'Pause' : 'Play',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildShareCard() {
    return Card(
      child: InkWell(
        onTap: _shareSession,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 14),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.share, color: Colors.greenAccent),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Share Recording',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
                    SizedBox(height: 2),
                    Text('Send via WhatsApp, email, or other apps',
                        style: TextStyle(fontSize: 12, color: Colors.grey)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatsGrid(String durStr) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(child: _statItem('Duration', durStr, Icons.timer)),
                Expanded(
                    child: _statItem('Avg BPM',
                        widget.session.avgBpm.toInt().toString(), Icons.favorite)),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                    child: _statItem(
                        'Min BPM',
                        widget.session.minBpm.toInt().toString(),
                        Icons.arrow_downward)),
                Expanded(
                    child: _statItem(
                        'Max BPM',
                        widget.session.maxBpm.toInt().toString(),
                        Icons.arrow_upward)),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                    child: _statItem('SDNN',
                        '${widget.session.sdnn.toInt()} ms', Icons.timeline)),
                Expanded(
                    child: _statItem('RMSSD',
                        '${widget.session.rmssd.toInt()} ms', Icons.analytics)),
              ],
            ),
            if (widget.session.irregularRhythm) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.orangeAccent.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                      color: Colors.orangeAccent.withValues(alpha: 0.3)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.warning_amber,
                        color: Colors.orangeAccent, size: 18),
                    SizedBox(width: 8),
                    Text('Irregular rhythm detected',
                        style: TextStyle(
                            color: Colors.orangeAccent, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _statItem(String label, String value, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.grey),
        const SizedBox(width: 6),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.bold)),
            Text(label,
                style: const TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
      ],
    );
  }

  Widget _buildBpmTrend() {
    final readings = widget.session.bpmReadings;
    final spots = <FlSpot>[];
    for (int i = 0; i < readings.length; i++) {
      spots.add(FlSpot(i.toDouble(), readings[i]));
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.trending_up, color: Colors.pinkAccent, size: 18),
                SizedBox(width: 6),
                Text('Heart Rate Trend',
                    style: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 140,
              child: LineChart(
                LineChartData(
                  clipData: const FlClipData.all(),
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: 20,
                    getDrawingHorizontalLine: (value) => const FlLine(
                      color: Colors.white10,
                      strokeWidth: 0.5,
                    ),
                  ),
                  titlesData: FlTitlesData(
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 36,
                        interval: 20,
                        getTitlesWidget: (value, meta) => Text(
                          value.toInt().toString(),
                          style: const TextStyle(
                              fontSize: 10, color: Colors.grey),
                        ),
                      ),
                    ),
                    bottomTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    topTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    rightTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                  ),
                  borderData: FlBorderData(
                    show: true,
                    border: Border.all(color: Colors.white12),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved: true,
                      color: Colors.pinkAccent,
                      barWidth: 2,
                      dotData: const FlDotData(show: false),
                      belowBarData: BarAreaData(
                        show: true,
                        color: Colors.pinkAccent.withValues(alpha: 0.1),
                      ),
                    ),
                  ],
                  lineTouchData: const LineTouchData(enabled: false),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
