import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../services/ecg_processor.dart';
import '../services/heart_sound_service.dart';
import '../services/recording_service.dart';
import '../widgets/animated_heart.dart';
import '../widgets/vital_tile.dart';

// ============================================================
//  MonitorScreen — Advanced real-time cardiac dashboard
//
//  Features:
//    • Real-time ECG waveform with hospital-style grid
//    • Animated BPM display with beating heart icon
//    • HRV metrics (SDNN, RMSSD)
//    • Signal quality meter
//    • PCG volume visualization
//    • Session recording
//    • Arrhythmia detection flag
//    • Flatline alarm
// ============================================================

class MonitorScreen extends StatefulWidget {
  const MonitorScreen({super.key});

  @override
  State<MonitorScreen> createState() => MonitorScreenState();
}

class MonitorScreenState extends State<MonitorScreen> {
  // ── WebSocket ──
  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  bool _connected = false;
  String _status = 'Disconnected';
  bool _autoReconnect = false;
  Timer? _reconnectTimer;

  // ── Auto-scan ──
  bool _scanning = false;
  int _scanProgress = 0;
  int _scanTotal = 0;

  // ── UI refresh throttle ──
  bool _frameScheduled = false;

  // ── Text controllers ──
  final _ipCtrl = TextEditingController(text: '192.168.1.100');
  final _portCtrl = TextEditingController(text: '8765');

  // ── ECG data ──
  final List<FlSpot> _ecgPoints = [];
  int _sampleIdx = 0;
  static const int _maxPoints = 900; // ~2.5 s at 360 Hz
  double _ecgBaseline = 2048;

  // ── PCG ──
  double _volume = 0;
  int _pcgRaw = 0;
  final List<double> _volumeHistory = [];
  static const int _maxVolHistory = 60;

  // ── Stats ──
  int _msgCount = 0;
  double _displayBpm = 0;

  // ── Actual sample-rate estimation from ESP32 timestamps ──
  int? _firstTs;           // first ESP32 "ts" (ms)
  int _samplesReceived = 0; // total ECG samples since _firstTs

  // ── Services ──
  final HeartSoundService _soundService = HeartSoundService();
  final EcgProcessor _ecgProcessor = EcgProcessor();
  final RecordingService _recordingService = RecordingService();

  // ── Animated heart key ──
  final GlobalKey<AnimatedHeartState> _heartKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _soundService.init();
    _soundService.onFlatlineChanged = () {
      if (mounted) setState(() {});
    };
    _ecgProcessor.onRPeak = () {
      _heartKey.currentState?.beat();
      _soundService.onRPeakDetected();
    };
    _ecgProcessor.onBpmUpdate = (bpm) {
      if (_recordingService.isRecording) {
        _recordingService.addBpmReading(bpm);
      }
      if (mounted) {
        _displayBpm = bpm;
        setState(() {}); // refresh UI to show updated BPM
      }
    };
  }

  @override
  void dispose() {
    _reconnectTimer?.cancel();
    _scanning = false;
    _disconnect();
    _soundService.dispose();
    _ipCtrl.dispose();
    _portCtrl.dispose();
    super.dispose();
  }

  // ────────────────── Connection ──────────────────

  void _connect() {
    final ip = _ipCtrl.text.trim();
    final port = _portCtrl.text.trim();
    if (ip.isEmpty || port.isEmpty) return;

    final uri = Uri.parse('ws://$ip:$port');
    setState(() => _status = 'Connecting to $uri …');
    _autoReconnect = true;

    try {
      _channel = IOWebSocketChannel.connect(
        uri,
        pingInterval: const Duration(seconds: 5),
      );
      _sub = _channel!.stream.listen(
        _onMessage,
        onError: (e) => _onClosed('Error: $e'),
        onDone: () => _onClosed('Connection closed'),
      );
      setState(() {
        _connected = true;
        _status = 'Connected to $uri';
        _msgCount = 0;
      });
      _soundService.onConnected();
      _ecgProcessor.reset();
      _displayBpm = 0;
      _firstTs = null;
      _samplesReceived = 0;
      // Start a short auto-calibration (5s) to set a sensible threshold
      _ecgProcessor.startAutoCalibration(5);
    } catch (e) {
      setState(() => _status = 'Failed: $e');
      _scheduleReconnect();
    }
  }

  void _disconnect() {
    _autoReconnect = false;
    _reconnectTimer?.cancel();
    _soundService.onDisconnected();
    _sub?.cancel();
    _channel?.sink.close();
    _sub = null;
    _channel = null;
    if (mounted) {
      setState(() {
        _connected = false;
        _status = 'Disconnected';
        _displayBpm = 0;
      });
    }
  }

  void _onClosed(String reason) {
    _soundService.onDisconnected();
    _sub = null;
    _channel = null;
    if (mounted) {
      setState(() {
        _connected = false;
        _status = reason;
        _displayBpm = 0;
      });
    }
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (!_autoReconnect || !mounted) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 2), () {
      if (mounted && !_connected && _autoReconnect) {
        setState(() => _status = 'Reconnecting…');
        _connect();
      }
    });
  }

  // ────────────────── Auto-scan ──────────────────

  Future<void> _autoScan() async {
    if (_scanning || _connected) return;

    final port = int.tryParse(_portCtrl.text.trim()) ?? 8765;
    String? subnet;

    // Get the device's own IP to determine the subnet
    setState(() {
      _scanning = true;
      _status = 'Detecting local network…';
    });

    try {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
      );
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          final ip = addr.address;
          if (!ip.startsWith('127.')) {
            final parts = ip.split('.');
            if (parts.length == 4) {
              subnet = '${parts[0]}.${parts[1]}.${parts[2]}';
              break;
            }
          }
        }
        if (subnet != null) break;
      }
    } catch (_) {}

    if (subnet == null) {
      // Fallback: use first 3 octets from the IP field
      final parts = _ipCtrl.text.trim().split('.');
      if (parts.length == 4) {
        subnet = '${parts[0]}.${parts[1]}.${parts[2]}';
      } else {
        subnet = '192.168.1';
      }
    }

    if (!mounted) return;
    setState(() {
      _status = 'Scanning $subnet.* on port $port …';
      _scanProgress = 0;
      _scanTotal = 254;
    });

    // Scan in parallel batches of 20 for speed
    const batchSize = 20;
    for (int start = 1; start <= 254 && _scanning && mounted; start += batchSize) {
      final end = (start + batchSize - 1).clamp(start, 254);
      final futures = <Future<String?>>[];

      for (int host = start; host <= end; host++) {
        final ip = '$subnet.$host';
        futures.add(_tryConnect(ip, port));
      }

      final results = await Future.wait(futures);

      if (!mounted || !_scanning) break;
      setState(() => _scanProgress = end);

      for (final foundIp in results) {
        if (foundIp != null) {
          // Found the ESP32!
          setState(() {
            _scanning = false;
            _ipCtrl.text = foundIp;
          });
          _connect();
          return;
        }
      }
    }

    if (mounted) {
      setState(() {
        _scanning = false;
        _status = 'Scan complete — ESP32 not found on $subnet.*';
      });
    }
  }

  Future<String?> _tryConnect(String ip, int port) async {
    try {
      final socket = await Socket.connect(
        ip,
        port,
        timeout: const Duration(milliseconds: 800),
      );
      socket.destroy();
      return ip;
    } catch (_) {
      return null;
    }
  }

  void _stopScan() {
    _scanning = false;
    if (mounted) {
      setState(() => _status = 'Scan stopped');
    }
  }

  // ────────────────── Data handling ──────────────────

  void _onMessage(dynamic raw) {
    try {
      final map = jsonDecode(raw as String) as Map<String, dynamic>;

      final ecgField = map['ecg'];
      final List<double> batchSamples = [];

      if (ecgField is List) {
        for (final v in ecgField) {
          final val = (v as num).toDouble();
          batchSamples.add(val);
          _ecgProcessor.processSample(val);
          _ecgBaseline += (val - _ecgBaseline) * 0.002;
          final centered = val - _ecgBaseline;
          _ecgPoints.add(FlSpot(_sampleIdx.toDouble(), centered));
          _sampleIdx++;
        }
      } else if (ecgField is num) {
        final val = ecgField.toDouble();
        batchSamples.add(val);
        _ecgProcessor.processSample(val);
        _ecgBaseline += (val - _ecgBaseline) * 0.002;
        final centered = val - _ecgBaseline;
        _ecgPoints.add(FlSpot(_sampleIdx.toDouble(), centered));
        _sampleIdx++;
      }

      if (_ecgPoints.length > _maxPoints) {
        _ecgPoints.removeRange(0, _ecgPoints.length - _maxPoints);
      }

      if (map['volume'] is num) {
        _volume = (map['volume'] as num).toDouble().clamp(0, 100);
        _volumeHistory.add(_volume);
        if (_volumeHistory.length > _maxVolHistory) {
          _volumeHistory.removeAt(0);
        }
      }
      // Collect raw PCG samples from batch for recording
      List<double>? pcgBatch;
      final pcgField = map['pcg'];
      if (pcgField is List) {
        pcgBatch = pcgField.map((e) => (e as num).toDouble()).toList();
        if (pcgBatch.isNotEmpty) {
          _pcgRaw = pcgBatch.last.toInt();
        }
      } else if (pcgField is num) {
        _pcgRaw = pcgField.toInt();
      }

      // Recording
      if (_recordingService.isRecording) {
        _recordingService.addEcgSamples(batchSamples);
        _recordingService.addPcgVolume(_volume);
        if (pcgBatch != null && pcgBatch.isNotEmpty) {
          _recordingService.addPcgSamples(pcgBatch);
        }
        if (map['pcg_rate'] is num) {
          _recordingService.setPcgSampleRate((map['pcg_rate'] as num).toInt());
        }
      }

      _msgCount++;
      // ── Estimate actual ECG sample rate from ESP32 timestamps ──
      if (map['ts'] is num && batchSamples.isNotEmpty) {
        final ts = (map['ts'] as num).toInt();
        _samplesReceived += batchSamples.length;
        if (_firstTs == null) {
          _firstTs = ts;
        } else {
          final elapsedMs = ts - _firstTs!;
          // Update rate after ≥ 2 seconds of data to get a stable estimate
          if (elapsedMs >= 2000) {
            final actualRate = (_samplesReceived * 1000.0 / elapsedMs).round();
            // Sanity: only accept rates in a reasonable range
            if (actualRate >= 100 && actualRate <= 1000) {
              _ecgProcessor.sampleRate = actualRate;
            }
            // Reset window so estimate stays fresh
            _firstTs = ts;
            _samplesReceived = 0;
          }
        }
      }
      // Check for BPM timeout (no peaks recently)
      _ecgProcessor.checkForBpmTimeout();
      _scheduleFrame();
    } catch (_) {}
  }

  void _scheduleFrame() {
    if (_frameScheduled) return;
    _frameScheduled = true;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      _frameScheduled = false;
      if (mounted) setState(() {});
    });
    SchedulerBinding.instance.scheduleFrame();
  }

  // ────────────────── Recording ──────────────────

  void _toggleRecording() async {
    if (_recordingService.isRecording) {
      final session = await _recordingService.stopRecording(
        avgBpm: _ecgProcessor.avgBpm,
        minBpm: _ecgProcessor.minBpm,
        maxBpm: _ecgProcessor.maxBpm,
        sdnn: _ecgProcessor.sdnn,
        rmssd: _ecgProcessor.rmssd,
        irregularRhythm: _ecgProcessor.irregularRhythm,
      );
      if (mounted && session != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Session saved (${session.duration.inSeconds}s, '
              '${session.avgBpm.toInt()} avg BPM)',
            ),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } else {
      _recordingService.startRecording();
    }
    setState(() {});
  }

  // ────────────────── Build ──────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: _buildAppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            _buildConnectionCard(),
            const SizedBox(height: 6),
            _buildStatusRow(),
            const SizedBox(height: 10),
            _buildHeartRateSection(),
            const SizedBox(height: 10),
            _buildEcgCard(),
            const SizedBox(height: 10),
            _buildVitalStatsRow(),
            const SizedBox(height: 10),
            _buildVolumeCard(),
          ],
        ),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    return AppBar(
      title: const Row(
        children: [
          Icon(Icons.monitor_heart, color: Colors.redAccent),
          SizedBox(width: 8),
          Text('Sonocardia'),
        ],
      ),
      actions: [
        // Recording indicator
        if (_recordingService.isRecording)
          const Padding(
            padding: EdgeInsets.only(right: 4),
            child: Center(
              child: Row(
                children: [
                  Icon(Icons.fiber_manual_record,
                      color: Colors.redAccent, size: 12),
                  SizedBox(width: 4),
                  Text('REC',
                      style: TextStyle(
                          color: Colors.redAccent,
                          fontWeight: FontWeight.bold,
                          fontSize: 12)),
                ],
              ),
            ),
          ),
        // Arrhythmia flag
        if (_connected && _ecgProcessor.irregularRhythm)
          const Padding(
            padding: EdgeInsets.only(right: 4),
            child: Center(
              child: Text('IRREGULAR',
                  style: TextStyle(
                      color: Colors.orangeAccent,
                      fontWeight: FontWeight.bold,
                      fontSize: 11)),
            ),
          ),
        // Flatline
        if (_connected && _soundService.isFlatline)
          const Padding(
            padding: EdgeInsets.only(right: 4),
            child: Center(
              child: Text('FLATLINE',
                  style: TextStyle(
                      color: Colors.redAccent,
                      fontWeight: FontWeight.bold,
                      fontSize: 13)),
            ),
          ),
        if (_connected)
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Center(
              child: Text('$_msgCount pkts',
                  style: const TextStyle(fontSize: 12)),
            ),
          ),
        // Mute/unmute
        IconButton(
          icon: Icon(
            _soundService.enabled ? Icons.volume_up : Icons.volume_off,
            color: _soundService.enabled ? Colors.white : Colors.grey,
          ),
          tooltip: _soundService.enabled ? 'Mute' : 'Unmute',
          onPressed: () {
            setState(() {
              _soundService.enabled = !_soundService.enabled;
            });
          },
        ),
      ],
    );
  }

  // ────────────────── Connection card ──────────────────

  Widget _buildConnectionCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: TextField(
                    controller: _ipCtrl,
                    decoration: const InputDecoration(
                      labelText: 'ESP32 IP',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    enabled: !_connected && !_scanning,
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 80,
                  child: TextField(
                    controller: _portCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Port',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    enabled: !_connected && !_scanning,
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: _scanning
                      ? null
                      : (_connected ? _disconnect : _connect),
                  icon: Icon(_connected ? Icons.link_off : Icons.link),
                  label: Text(_connected ? 'Stop' : 'Connect'),
                  style: FilledButton.styleFrom(
                    backgroundColor:
                        _connected ? Colors.red[700] : Colors.green[700],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: _scanning
                      ? OutlinedButton.icon(
                          onPressed: _stopScan,
                          icon: const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                            ),
                          ),
                          label: Text(
                            'Scanning… $_scanProgress/$_scanTotal',
                            style: const TextStyle(fontSize: 12),
                          ),
                        )
                      : OutlinedButton.icon(
                          onPressed:
                              _connected ? null : _autoScan,
                          icon: const Icon(Icons.radar, size: 18),
                          label: const Text('Auto Scan'),
                        ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ────────────────── Status row ──────────────────

  Widget _buildStatusRow() {
    return Row(
      children: [
        Icon(Icons.circle,
            size: 10,
            color: _connected ? Colors.greenAccent : Colors.redAccent),
        const SizedBox(width: 6),
        Expanded(
          child: Text(_status,
              style: TextStyle(
                  fontSize: 12,
                  color: _connected ? Colors.greenAccent : Colors.grey)),
        ),
      ],
    );
  }

  // ────────────────── Heart Rate Section ──────────────────

  Widget _buildHeartRateSection() {
    final bpm = _displayBpm;
    String bpmStr;
    if (bpm == -1) {
      bpmStr = '...';
    } else {
      bpmStr = bpm > 0 ? bpm.toInt().toString() : '--';
    }

    // Heart rate zone color
    Color bpmColor;
    String zoneLabel;
    if (bpm <= 0) {
      bpmColor = Colors.grey;
      zoneLabel = 'No data';
    } else if (bpm < 60) {
      bpmColor = Colors.lightBlueAccent;
      zoneLabel = 'Bradycardia';
    } else if (bpm <= 100) {
      bpmColor = Colors.greenAccent;
      zoneLabel = 'Normal';
    } else if (bpm <= 140) {
      bpmColor = Colors.orangeAccent;
      zoneLabel = 'Elevated';
    } else {
      bpmColor = Colors.redAccent;
      zoneLabel = 'Tachycardia';
    }

    final quality = _ecgProcessor.signalQuality;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            // Animated heart + BPM
            Expanded(
              flex: 3,
              child: Row(
                children: [
                  AnimatedHeart(key: _heartKey, size: 44, color: bpmColor),
                  const SizedBox(width: 14),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(bpmStr,
                              style: TextStyle(
                                  fontSize: 44,
                                  fontWeight: FontWeight.bold,
                                  color: bpmColor,
                                  height: 1)),
                          const Padding(
                            padding: EdgeInsets.only(bottom: 6, left: 4),
                            child: Text('BPM',
                                style:
                                    TextStyle(fontSize: 14, color: Colors.grey)),
                          ),
                        ],
                      ),
                      Text(zoneLabel,
                          style: TextStyle(
                              fontSize: 12,
                              color: bpmColor,
                              fontWeight: FontWeight.w500)),
                    ],
                  ),
                ],
              ),
            ),
            // Signal quality + record button
            Expanded(
              flex: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // Signal quality
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        quality > 70
                            ? Icons.signal_cellular_alt
                            : quality > 30
                                ? Icons.signal_cellular_alt_2_bar
                                : Icons.signal_cellular_alt_1_bar,
                        size: 16,
                        color: quality > 70
                            ? Colors.greenAccent
                            : quality > 30
                                ? Colors.orangeAccent
                                : Colors.redAccent,
                      ),
                      const SizedBox(width: 4),
                      Text('${quality.toInt()}%',
                          style: TextStyle(
                              fontSize: 12,
                              color: quality > 70
                                  ? Colors.greenAccent
                                  : quality > 30
                                      ? Colors.orangeAccent
                                      : Colors.redAccent)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('Signal Quality',
                      style:
                          TextStyle(fontSize: 10, color: Colors.grey[600])),
                  const SizedBox(height: 8),
                  // Record button
                  SizedBox(
                    height: 32,
                    child: FilledButton.icon(
                      onPressed: _connected ? _toggleRecording : null,
                      icon: Icon(
                        _recordingService.isRecording
                            ? Icons.stop_rounded
                            : Icons.fiber_manual_record,
                        size: 16,
                      ),
                      label: Text(
                          _recordingService.isRecording ? 'Stop' : 'Record',
                          style: const TextStyle(fontSize: 12)),
                      style: FilledButton.styleFrom(
                        backgroundColor: _recordingService.isRecording
                            ? Colors.red[800]
                            : Colors.red[900],
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ────────────────── ECG chart card ──────────────────

  Widget _buildEcgCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Row(
                children: [
                  const Icon(Icons.show_chart,
                      color: Colors.greenAccent, size: 20),
                  const SizedBox(width: 6),
                  const Text('ECG Signal',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  const Spacer(),
                  if (_ecgProcessor.beatCount > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.greenAccent.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '${_ecgProcessor.beatCount} beats detected',
                        style: const TextStyle(
                            fontSize: 10, color: Colors.greenAccent),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(height: 300, child: _buildEcgChart()),
          ],
        ),
      ),
    );
  }

  Widget _buildEcgChart() {
    if (_ecgPoints.length < 2) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.monitor_heart_outlined,
                size: 48, color: Colors.grey),
            SizedBox(height: 8),
            Text('Waiting for ECG data…',
                style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }

    final spots = _ecgPoints;
    final samplesPerSecond = _ecgProcessor.sampleRate.toDouble();
    // Fixed-width window: signal grows from the right edge.
    final maxX = spots.last.x;
    final minX = maxX - _maxPoints;
    final visibleStartX = minX;
    return LineChart(
      LineChartData(
        minX: minX,
        maxX: maxX,
        minY: -800,
        maxY: 800,
        clipData: const FlClipData.all(),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: true,
          horizontalInterval: 500,
          verticalInterval: samplesPerSecond / 4, // 0.25 s grid
          getDrawingHorizontalLine: (value) => FlLine(
            color: value == 0
                ? Colors.white24
                : const Color(0x0DFFA4A4), // faint red grid
            strokeWidth: value == 0 ? 1.2 : 0.5,
          ),
          getDrawingVerticalLine: (value) => const FlLine(
            color: Color(0x0DFFA4A4),
            strokeWidth: 0.5,
          ),
        ),
        titlesData: FlTitlesData(
          leftTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 24,
              interval: samplesPerSecond,
              getTitlesWidget: (value, meta) {
                final tSec = (value - visibleStartX) / samplesPerSecond;
                if (tSec < -0.001) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '${tSec.toStringAsFixed(1)}s',
                    style: const TextStyle(fontSize: 10, color: Colors.grey),
                  ),
                );
              },
            ),
          ),
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
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
    );
  }

  // ────────────────── Vital Stats Row ──────────────────

  Widget _buildVitalStatsRow() {
    return Row(
      children: [
        Expanded(
          child: VitalTile(
            label: 'AVG BPM',
            value: _displayBpm > 0
                ? _displayBpm.toInt().toString()
                : '--',
            icon: Icons.favorite_border,
            color: Colors.pinkAccent,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: VitalTile(
            label: 'SDNN',
            value: _ecgProcessor.sdnn > 0
                ? _ecgProcessor.sdnn.toInt().toString()
                : '--',
            unit: 'ms',
            icon: Icons.timeline,
            color: Colors.amberAccent,
            subtitle: 'HRV',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: VitalTile(
            label: 'RMSSD',
            value: _ecgProcessor.rmssd > 0
                ? _ecgProcessor.rmssd.toInt().toString()
                : '--',
            unit: 'ms',
            icon: Icons.analytics_outlined,
            color: Colors.cyanAccent,
            subtitle: 'HRV',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: VitalTile(
            label: 'RANGE',
            value: _ecgProcessor.maxBpm > 0
                ? '${_ecgProcessor.minBpm.toInt()}-${_ecgProcessor.maxBpm.toInt()}'
                : '--',
            icon: Icons.swap_vert,
            color: Colors.tealAccent,
          ),
        ),
      ],
    );
  }

  // ────────────────── Volume bar card ──────────────────

  Widget _buildVolumeCard() {
    final pct = _volume / 100.0;
    final Color barColor;
    if (pct < 0.3) {
      barColor = Colors.green;
    } else if (pct < 0.6) {
      barColor = Colors.amber;
    } else {
      barColor = Colors.redAccent;
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.graphic_eq,
                    color: Colors.cyanAccent, size: 20),
                const SizedBox(width: 6),
                const Text('Heart Sound (PCG)',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: barColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${_volume.toInt()}%',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: barColor),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Volume bar with segments
            SizedBox(
              height: 28,
              child: Row(
                children: List.generate(20, (i) {
                  final segPct = (i + 1) / 20.0;
                  final active = pct >= segPct;
                  Color segColor;
                  if (segPct < 0.3) {
                    segColor = Colors.green;
                  } else if (segPct < 0.6) {
                    segColor = Colors.amber;
                  } else {
                    segColor = Colors.redAccent;
                  }
                  return Expanded(
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 1),
                      decoration: BoxDecoration(
                        color: active
                            ? segColor
                            : segColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  );
                }),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Raw ADC: $_pcgRaw',
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
