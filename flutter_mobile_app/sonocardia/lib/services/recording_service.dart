import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

// ============================================================
//  RecordingService — Save & replay ECG/PCG sessions
//
//  Stores sessions as compressed JSON in the app documents dir.
//  Each session captures: ECG samples, BPM trend, PCG volume,
//  timestamps, and computed statistics.
// ============================================================

class RecordingSession {
  final String id;
  final DateTime startTime;
  DateTime? endTime;
  final List<double> ecgSamples;
  final List<double> bpmReadings;
  final List<double> pcgVolumes;
  final List<double> pcgSamples;
  int pcgSampleRate;
  double avgBpm;
  double minBpm;
  double maxBpm;
  double sdnn;
  double rmssd;
  bool irregularRhythm;

  RecordingSession({
    required this.id,
    required this.startTime,
    this.endTime,
    List<double>? ecgSamples,
    List<double>? bpmReadings,
    List<double>? pcgVolumes,
    List<double>? pcgSamples,
    this.pcgSampleRate = 2880,
    this.avgBpm = 0,
    this.minBpm = 0,
    this.maxBpm = 0,
    this.sdnn = 0,
    this.rmssd = 0,
    this.irregularRhythm = false,
  })  : ecgSamples = ecgSamples ?? [],
        bpmReadings = bpmReadings ?? [],
        pcgVolumes = pcgVolumes ?? [],
        pcgSamples = pcgSamples ?? [];

  Duration get duration =>
      (endTime ?? DateTime.now()).difference(startTime);

  Map<String, dynamic> toJson() => {
        'id': id,
        'startTime': startTime.toIso8601String(),
        'endTime': endTime?.toIso8601String(),
        'avgBpm': avgBpm,
        'minBpm': minBpm,
        'maxBpm': maxBpm,
        'sdnn': sdnn,
        'rmssd': rmssd,
        'irregularRhythm': irregularRhythm,
        'ecgSamples': ecgSamples,
        'bpmReadings': bpmReadings,
        'pcgVolumes': pcgVolumes,
        'pcgSamples': pcgSamples,
        'pcgSampleRate': pcgSampleRate,
      };

  factory RecordingSession.fromJson(Map<String, dynamic> json) {
    return RecordingSession(
      id: json['id'] as String,
      startTime: DateTime.parse(json['startTime'] as String),
      endTime: json['endTime'] != null
          ? DateTime.parse(json['endTime'] as String)
          : null,
      avgBpm: (json['avgBpm'] as num?)?.toDouble() ?? 0,
      minBpm: (json['minBpm'] as num?)?.toDouble() ?? 0,
      maxBpm: (json['maxBpm'] as num?)?.toDouble() ?? 0,
      sdnn: (json['sdnn'] as num?)?.toDouble() ?? 0,
      rmssd: (json['rmssd'] as num?)?.toDouble() ?? 0,
      irregularRhythm: json['irregularRhythm'] as bool? ?? false,
      ecgSamples: (json['ecgSamples'] as List?)
              ?.map((e) => (e as num).toDouble())
              .toList() ??
          [],
      bpmReadings: (json['bpmReadings'] as List?)
              ?.map((e) => (e as num).toDouble())
              .toList() ??
          [],
      pcgVolumes: (json['pcgVolumes'] as List?)
              ?.map((e) => (e as num).toDouble())
              .toList() ??
          [],
      pcgSamples: (json['pcgSamples'] as List?)
              ?.map((e) => (e as num).toDouble())
              .toList() ??
          [],
      pcgSampleRate: (json['pcgSampleRate'] as num?)?.toInt() ?? 2880,
    );
  }
}

/// Lightweight metadata for listing sessions without loading full data.
class SessionSummary {
  final String id;
  final DateTime startTime;
  final DateTime? endTime;
  final double avgBpm;
  final double minBpm;
  final double maxBpm;
  final bool irregularRhythm;

  SessionSummary({
    required this.id,
    required this.startTime,
    this.endTime,
    this.avgBpm = 0,
    this.minBpm = 0,
    this.maxBpm = 0,
    this.irregularRhythm = false,
  });

  Duration get duration =>
      (endTime ?? DateTime.now()).difference(startTime);
}

class RecordingService {
  static const String _dirName = 'sonocardia_recordings';
  Directory? _recordingsDir;
  RecordingSession? _activeSession;
  // Streaming PCG raw file during recording
  RandomAccessFile? _pcgRawFile;
  int _pcgRawCount = 0; // number of samples written
  String? _pcgRawPath;

  bool get isRecording => _activeSession != null;
  RecordingSession? get activeSession => _activeSession;

  Future<Directory> _getDir() async {
    if (_recordingsDir != null) return _recordingsDir!;
    final appDir = await getApplicationDocumentsDirectory();
    _recordingsDir = Directory('${appDir.path}/$_dirName');
    if (!await _recordingsDir!.exists()) {
      await _recordingsDir!.create(recursive: true);
    }
    return _recordingsDir!;
  }

  /// Start a new recording session.
  RecordingSession startRecording() {
    final now = DateTime.now();
    _activeSession = RecordingSession(
      id: '${now.millisecondsSinceEpoch}',
      startTime: now,
    );

    // Prepare PCG raw file for streaming
    () async {
      try {
        final dir = await _getDir();
        _pcgRawPath = '${dir.path}/${_activeSession!.id}.pcgraw';
        final f = File(_pcgRawPath!);
        _pcgRawFile = await f.open(mode: FileMode.write);
        _pcgRawCount = 0;
      } catch (_) {
        _pcgRawFile = null;
        _pcgRawCount = 0;
      }
    }();

    return _activeSession!;
  }

  /// Add ECG samples to the active session.
  void addEcgSamples(List<double> samples) {
    _activeSession?.ecgSamples.addAll(samples);
  }

  /// Add a BPM reading to the active session.
  void addBpmReading(double bpm) {
    _activeSession?.bpmReadings.add(bpm);
  }

  /// Add a PCG volume reading.
  void addPcgVolume(double volume) {
    _activeSession?.pcgVolumes.add(volume);
  }

  /// Add raw PCG ADC samples from one batch.
  void addPcgSamples(List<double> samples) {
    // Keep in-memory copy for metadata/quick display
    _activeSession?.pcgSamples.addAll(samples);

    // Also stream raw samples to file as little-endian uint16
    if (_pcgRawFile != null) {
      try {
        final buf = Uint8List(samples.length * 2);
        final bd = ByteData.view(buf.buffer);
        for (var i = 0; i < samples.length; i++) {
          final v = samples[i].round().clamp(0, 0xFFFF);
          bd.setUint16(i * 2, v, Endian.little);
        }
        _pcgRawFile!.writeFromSync(buf);
        _pcgRawCount += samples.length;
      } catch (_) {
        // ignore write errors — keep in-memory data
      }
    }
  }

  /// Set the PCG sample rate (from ESP32 pcg_rate field).
  void setPcgSampleRate(int rate) {
    if (_activeSession != null) {
      _activeSession!.pcgSampleRate = rate;
    }
  }

  /// Finalize stats and save to disk. Returns the saved session.
  Future<RecordingSession?> stopRecording({
    double avgBpm = 0,
    double minBpm = 0,
    double maxBpm = 0,
    double sdnn = 0,
    double rmssd = 0,
    bool irregularRhythm = false,
  }) async {
    if (_activeSession == null) return null;

    _activeSession!
      ..endTime = DateTime.now()
      ..avgBpm = avgBpm
      ..minBpm = minBpm
      ..maxBpm = maxBpm
      ..sdnn = sdnn
      ..rmssd = rmssd
      ..irregularRhythm = irregularRhythm;

    await _saveSession(_activeSession!);
    // Close and convert PCG raw file (if present) to WAV matching ESP32 test
    try {
      if (_pcgRawFile != null) {
        await _pcgRawFile!.close();
        // Build WAV file next to session JSON
        final dir = await _getDir();
        final rawPath = _pcgRawPath;
        final wavPath = '${dir.path}/${_activeSession!.id}.pcg.wav';
        final sampleRate = _activeSession!.pcgSampleRate;
        if (rawPath != null) {
          await _buildWavFromRaw(rawPath, wavPath, sampleRate, _pcgRawCount);
        }
      }
    } catch (_) {}

    final session = _activeSession;
    _activeSession = null;
    return session;
  }

  /// Build a 16-bit PCM WAV from a raw little-endian uint16 file written
  /// by the WebSocket packet streamer. This matches the ESP32 test format.
  Future<void> _buildWavFromRaw(
      String rawPath, String wavPath, int sampleRate, int sampleCount) async {
    try {
      final rawFile = File(rawPath);
      if (!await rawFile.exists()) return;
      final data = await rawFile.readAsBytes();
      // Interpret as uint16 LE
      final bd = ByteData.view(data.buffer);
      // Compute DC mean
      double dcSum = 0;
      final int samples = sampleCount;
      for (var i = 0; i < samples; i++) {
        dcSum += bd.getUint16(i * 2, Endian.little);
      }
      final dc = dcSum / samples;
      // Find peak
      double maxAbs = 1.0;
      for (var i = 0; i < samples; i++) {
        final v = bd.getUint16(i * 2, Endian.little) - dc;
        final a = v >= 0 ? v : -v;
        if (a > maxAbs) maxAbs = a;
      }

      final wavFile = File(wavPath);
      final raf = await wavFile.open(mode: FileMode.write);
      final dataSize = samples * 2;
      final hdr = ByteData(44);
      // RIFF header
      hdr.setUint8(0, 'R'.codeUnitAt(0));
      hdr.setUint8(1, 'I'.codeUnitAt(0));
      hdr.setUint8(2, 'F'.codeUnitAt(0));
      hdr.setUint8(3, 'F'.codeUnitAt(0));
      hdr.setUint32(4, 36 + dataSize, Endian.little);
      hdr.setUint8(8, 'W'.codeUnitAt(0));
      hdr.setUint8(9, 'A'.codeUnitAt(0));
      hdr.setUint8(10, 'V'.codeUnitAt(0));
      hdr.setUint8(11, 'E'.codeUnitAt(0));
      // fmt chunk
      hdr.setUint8(12, 'f'.codeUnitAt(0));
      hdr.setUint8(13, 'm'.codeUnitAt(0));
      hdr.setUint8(14, 't'.codeUnitAt(0));
      hdr.setUint8(15, ' '.codeUnitAt(0));
      hdr.setUint32(16, 16, Endian.little);
      hdr.setUint16(20, 1, Endian.little); // PCM
      hdr.setUint16(22, 1, Endian.little); // mono
      hdr.setUint32(24, sampleRate, Endian.little);
      hdr.setUint32(28, sampleRate * 2, Endian.little);
      hdr.setUint16(32, 2, Endian.little);
      hdr.setUint16(34, 16, Endian.little);
      // data chunk header
      hdr.setUint8(36, 'd'.codeUnitAt(0));
      hdr.setUint8(37, 'a'.codeUnitAt(0));
      hdr.setUint8(38, 't'.codeUnitAt(0));
      hdr.setUint8(39, 'a'.codeUnitAt(0));
      hdr.setUint32(40, dataSize, Endian.little);
      await raf.writeFrom(hdr.buffer.asUint8List());

      // Write PCM samples (normalize to 32000 like ESP32 test)
      final outBuf = Uint8List(1024);
      final outBd = ByteData.view(outBuf.buffer);
      var bytePos = 0;
      for (var i = 0; i < samples; i++) {
        final v = bd.getUint16(i * 2, Endian.little) - dc;
        var sv = (v / maxAbs * 32000).round();
        if (sv > 32767) sv = 32767;
        if (sv < -32768) sv = -32768;
        outBd.setInt16(bytePos, sv, Endian.little);
        bytePos += 2;
        if (bytePos >= 512) {
          await raf.writeFrom(outBuf, 0, 512);
          bytePos = 0;
        }
      }
      if (bytePos > 0) {
        await raf.writeFrom(outBuf, 0, bytePos);
      }
      await raf.close();
    } catch (e) {
      // ignore
    }
  }

  Future<void> _saveSession(RecordingSession session) async {
    final dir = await _getDir();
    final file = File('${dir.path}/${session.id}.json');
    final json = jsonEncode(session.toJson());
    await file.writeAsString(json);
  }

  /// List all saved sessions (metadata only, sorted newest first).
  Future<List<SessionSummary>> listSessions() async {
    final dir = await _getDir();
    final files = await dir
        .list()
        .where((f) => f.path.endsWith('.json'))
        .toList();

    final summaries = <SessionSummary>[];
    for (final file in files) {
      try {
        final content = await (file as File).readAsString();
        final json = jsonDecode(content) as Map<String, dynamic>;
        summaries.add(SessionSummary(
          id: json['id'] as String,
          startTime: DateTime.parse(json['startTime'] as String),
          endTime: json['endTime'] != null
              ? DateTime.parse(json['endTime'] as String)
              : null,
          avgBpm: (json['avgBpm'] as num?)?.toDouble() ?? 0,
          minBpm: (json['minBpm'] as num?)?.toDouble() ?? 0,
          maxBpm: (json['maxBpm'] as num?)?.toDouble() ?? 0,
          irregularRhythm: json['irregularRhythm'] as bool? ?? false,
        ));
      } catch (_) {
        // Skip corrupt files
      }
    }

    summaries.sort((a, b) => b.startTime.compareTo(a.startTime));
    return summaries;
  }

  /// Load a full session by ID.
  Future<RecordingSession?> loadSession(String id) async {
    final dir = await _getDir();
    final file = File('${dir.path}/$id.json');
    if (!await file.exists()) return null;

    final content = await file.readAsString();
    final json = jsonDecode(content) as Map<String, dynamic>;
    return RecordingSession.fromJson(json);
  }

  /// Delete a session by ID.
  Future<void> deleteSession(String id) async {
    final dir = await _getDir();
    final file = File('${dir.path}/$id.json');
    if (await file.exists()) {
      await file.delete();
    }
  }

  /// Get the file path for a session (for sharing).
  Future<String?> getSessionFilePath(String id) async {
    final dir = await _getDir();
    final file = File('${dir.path}/$id.json');
    if (await file.exists()) return file.path;
    return null;
  }

  /// Export a human-readable summary text file for sharing.
  Future<String> exportSessionSummary(RecordingSession session) async {
    final dir = await _getDir();
    final file = File('${dir.path}/${session.id}_report.txt');

    final dur = session.duration;
    final durStr = dur.inMinutes > 0
        ? '${dur.inMinutes}m ${dur.inSeconds % 60}s'
        : '${dur.inSeconds}s';

    final buf = StringBuffer();
    buf.writeln('═══════════════════════════════════════');
    buf.writeln('  SONOCARDIA — ECG Session Report');
    buf.writeln('═══════════════════════════════════════');
    buf.writeln();
    buf.writeln('Date     : ${session.startTime.toLocal()}');
    buf.writeln('Duration : $durStr');
    buf.writeln('Samples  : ${session.ecgSamples.length} (360 Hz)');
    buf.writeln();
    buf.writeln('── Heart Rate ──');
    buf.writeln('  Average BPM : ${session.avgBpm.toInt()}');
    buf.writeln('  Min BPM     : ${session.minBpm.toInt()}');
    buf.writeln('  Max BPM     : ${session.maxBpm.toInt()}');
    buf.writeln();
    buf.writeln('── HRV Metrics ──');
    buf.writeln('  SDNN  : ${session.sdnn.toInt()} ms');
    buf.writeln('  RMSSD : ${session.rmssd.toInt()} ms');
    buf.writeln();
    if (session.irregularRhythm) {
      buf.writeln('⚠ Irregular rhythm detected during session.');
      buf.writeln();
    }
    buf.writeln('Generated by Sonocardia');

    await file.writeAsString(buf.toString());
    return file.path;
  }

  /// Export session as a .sono file for sharing.
  /// The .sono format is a JSON file with a signature header.
  Future<String> exportSonoFile(RecordingSession session) async {
    final dir = await _getDir();
    final date = session.startTime.toLocal();
    final dateStr =
        '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    final fileName = 'Sonocardia_${dateStr}_${session.avgBpm.toInt()}BPM.sono';
    final file = File('${dir.path}/$fileName');

    final sonoData = {
      'sonocardia_version': 1,
      'format': 'sono',
      ...session.toJson(),
    };
    await file.writeAsString(jsonEncode(sonoData));
    return file.path;
  }

  /// Import a .sono file into the recordings directory.
  /// Returns the imported session, or null if the file is invalid.
  Future<RecordingSession?> importSonoFile(String filePath) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) return null;

      final content = await file.readAsString();
      final json = jsonDecode(content) as Map<String, dynamic>;

      // Validate it's a .sono file
      if (json['sonocardia_version'] == null || json['format'] != 'sono') {
        return null;
      }

      final session = RecordingSession.fromJson(json);

      // Check if session already exists
      final dir = await _getDir();
      final existing = File('${dir.path}/${session.id}.json');
      if (await existing.exists()) {
        // Already imported — just return the session
        return session;
      }

      // Save as a regular session
      await _saveSession(session);
      return session;
    } catch (_) {
      return null;
    }
  }
}
