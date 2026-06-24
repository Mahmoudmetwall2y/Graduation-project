"""
Deterministic preprocessing for PCG and ECG signals.
All preprocessing must be versioned and reproducible.
"""

import numpy as np
import librosa
from scipy import signal
from typing import Dict, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

# Preprocessing version constant
PREPROCESSING_VERSION = "v1.0.0"



# ─── YAMNet lazy loader ───────────────────────────────────────────────────────
# Loaded once on first PCGPreprocessor.process() call.
# Requires: tensorflow, tensorflow_hub  (already in inference/requirements.txt)
_yamnet_model = None

def _get_yamnet():
    """Return the cached YAMNet model, loading it on first call."""
    global _yamnet_model
    if _yamnet_model is None:
        try:
            import tensorflow_hub as hub
            logger.info("Loading YAMNet from TF Hub (first call)…")
            _yamnet_model = hub.load("https://tfhub.dev/google/yamnet/1")
            logger.info("YAMNet loaded OK")
        except Exception as exc:
            logger.error(f"Failed to load YAMNet: {exc}")
            raise RuntimeError(
                "YAMNet is required for PCG classification. "
                "Ensure tensorflow-hub is installed and network access is available."
            ) from exc
    return _yamnet_model


class PCGPreprocessor:
    """
    Deterministic PCG preprocessing for the NEW XGBoost model.

    Produces a 1224-feature vector:
      • 200 traditional librosa features (13-MFCC + spectral + mel + contrast + chroma)
      • 1024-dim YAMNet neural embedding (mean-pooled across frames)

    This matches the training pipeline in:
      new-models/Xgboost/preprocessing/YAMNet_1presplit.py (and _2, _3, _4)
    and the scaler in:
      new-models/Xgboost/final_scaler.pkl  (n_features_in_ = 1224)

    Audio requirements (from training scripts):
      - Traditional track : 22 050 Hz, 10 s, bandpass 20-400 Hz, librosa.normalize
      - YAMNet track      : 16 000 Hz, 3 s (48 000 samples), peak-normalized
    """

    # Traditional track settings (librosa path)
    SAMPLE_RATE_TRAD: int = 22_050
    DURATION_SEC:     float = 10.0

    # YAMNet track settings
    SAMPLE_RATE_YAM:  int = 16_000
    DURATION_YAM_S:   float = 3.0          # 48 000 samples at 16 kHz

    def __init__(
        self,
        sample_rate: int = 22_050,
        target_duration: float = 10.0,
        bandpass_low: float = 20.0,
        bandpass_high: float = 400.0,
    ):
        self.sample_rate = sample_rate
        self.target_duration = target_duration
        self.target_samples = int(sample_rate * target_duration)
        self.bandpass_low = bandpass_low
        self.bandpass_high = bandpass_high
        logger.info(
            f"PCGPreprocessor (YAMNet, 1224-feature) initialized: "
            f"sr={sample_rate}, duration={target_duration}s"
        )

    # ── public API ────────────────────────────────────────────────────────────

    def process(self, audio: np.ndarray, original_sr: Optional[int] = None) -> np.ndarray:
        """
        Process raw PCG audio to a 1224-feature numpy array.

        Args:
            audio:       Raw float32 audio samples.
            original_sr: Source sample rate.  Will resample as needed.

        Returns:
            numpy array of shape (1224,)
        """
        try:
            import tensorflow as tf
        except ImportError as exc:
            raise RuntimeError(
                "tensorflow is required for PCG classification."
            ) from exc

        # ── Traditional track (22 050 Hz, 10 s) ──────────────────────────────
        audio_trad = self._prepare_traditional(audio, original_sr)
        trad_features = self._extract_traditional(audio_trad)   # (200,)

        # ── YAMNet track (16 000 Hz, 3 s) ─────────────────────────────────────
        audio_yam = self._prepare_yamnet(audio, original_sr)    # (48 000,)
        audio_tf = tf.convert_to_tensor(audio_yam, dtype=tf.float32)
        _scores, embeddings, _spec = _get_yamnet()(audio_tf)
        yamnet_embedding = np.mean(embeddings.numpy(), axis=0)  # (1024,)

        combined = np.concatenate([trad_features, yamnet_embedding]).astype(np.float32)
        assert combined.shape == (1224,), (
            f"Feature shape mismatch: expected (1224,), got {combined.shape}"
        )
        logger.info(f"PCG preprocessing complete: {combined.shape[0]} features")
        return combined

    def features_to_array(self, features: np.ndarray) -> np.ndarray:
        """
        Pass-through: process() already returns a flat array.
        Kept for API compatibility with inference.py.
        """
        return features

    # ── private helpers ───────────────────────────────────────────────────────

    def _prepare_traditional(
        self, audio: np.ndarray, original_sr: Optional[int]
    ) -> np.ndarray:
        """Resample → bandpass → pad/crop → peak-normalize (22 050 Hz, 10 s)."""
        if original_sr and original_sr != self.SAMPLE_RATE_TRAD:
            audio = librosa.resample(
                audio, orig_sr=original_sr, target_sr=self.SAMPLE_RATE_TRAD
            )
        audio = self._bandpass_filter(audio, self.SAMPLE_RATE_TRAD)
        audio = librosa.util.normalize(audio)
        target = int(self.SAMPLE_RATE_TRAD * self.DURATION_SEC)
        if len(audio) < target:
            audio = np.pad(audio, (0, target - len(audio)))
        else:
            audio = audio[:target]
        return audio

    def _prepare_yamnet(
        self, audio: np.ndarray, original_sr: Optional[int]
    ) -> np.ndarray:
        """Resample → pad/crop → peak-normalize (16 000 Hz, 3 s = 48 000 samples)."""
        sr_src = original_sr if original_sr else self.sample_rate
        if sr_src != self.SAMPLE_RATE_YAM:
            audio = librosa.resample(
                audio, orig_sr=sr_src, target_sr=self.SAMPLE_RATE_YAM
            )
        target = int(self.SAMPLE_RATE_YAM * self.DURATION_YAM_S)  # 48 000
        if len(audio) < target:
            audio = np.pad(audio, (0, target - len(audio)))
        else:
            audio = audio[:target]
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val
        return audio.astype(np.float32)

    def _bandpass_filter(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """Butterworth bandpass (SOS form, same as training script)."""
        from scipy.signal import butter, sosfilt
        nyq = sr / 2.0
        sos = butter(
            4,
            [self.bandpass_low / nyq, self.bandpass_high / nyq],
            btype="band",
            output="sos",
        )
        return sosfilt(sos, audio)

    def _extract_traditional(self, audio: np.ndarray) -> np.ndarray:
        """
        Extract 200-dim traditional feature vector matching extract_features()
        in the YAMNet training scripts.

        Feature breakdown (200 total):
          13-MFCC mean + std              = 26
          spectral centroid  mean + std   =  2
          spectral rolloff   mean + std   =  2
          spectral bandwidth mean + std   =  2
          zero-crossing rate mean + std   =  2
          chroma (12)        mean + std   = 24
          spectral contrast (7) mean+std  = 14
          mel-spectrogram (128) mean only = 128
                                      ─────────
                                          200
        Then z-score standardized across the 200 values (matching training).
        """
        sr = self.SAMPLE_RATE_TRAD

        mfcc     = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
        sc       = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
        rolloff  = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
        bw       = librosa.feature.spectral_bandwidth(y=audio, sr=sr)[0]
        zcr      = librosa.feature.zero_crossing_rate(y=audio)[0]
        chroma   = librosa.feature.chroma_stft(y=audio, sr=sr)
        contrast = librosa.feature.spectral_contrast(y=audio, sr=sr)
        mel      = librosa.feature.melspectrogram(y=audio, sr=sr)
        mel_db   = librosa.power_to_db(mel)

        feat = np.concatenate([
            np.mean(mfcc, axis=1), np.std(mfcc, axis=1),       # 26
            [np.mean(sc),   np.std(sc)],                         #  2
            [np.mean(rolloff), np.std(rolloff)],                 #  2
            [np.mean(bw),   np.std(bw)],                         #  2
            [np.mean(zcr),  np.std(zcr)],                        #  2
            np.mean(chroma, axis=1), np.std(chroma, axis=1),    # 24
            np.mean(contrast, axis=1), np.std(contrast, axis=1), # 14
            np.mean(mel_db, axis=1),                             # 128
        ])

        # Per-vector z-score standardization (exact match to training script)
        eps = 1e-8
        feat = (feat - np.mean(feat)) / (np.std(feat) + eps)
        return feat.astype(np.float32)


class PCGPreprocessorLegacy:
    """
    Legacy PCGPreprocessor — produces 558 features (40-MFCC + full librosa set).

    This was the preprocessing for models/model1_xgboost/xgboost_model.pkl.
    Kept for reference and backward compatibility testing.
    NOT used in production since the registry now points to the new 1224-feature model.
    """

    def __init__(
        self,
        sample_rate: int = 22050,
        target_duration: float = 10.0,
        bandpass_low: float = 20.0,
        bandpass_high: float = 400.0,
        n_mfcc: int = 40,
    ):
        self.sample_rate = sample_rate
        self.target_duration = target_duration
        self.target_samples = int(sample_rate * target_duration)
        self.bandpass_low = bandpass_low
        self.bandpass_high = bandpass_high
        self.n_mfcc = n_mfcc

    def process(self, audio: np.ndarray, original_sr: Optional[int] = None) -> np.ndarray:
        if original_sr and original_sr != self.sample_rate:
            audio = librosa.resample(audio, orig_sr=original_sr, target_sr=self.sample_rate)
        from scipy.signal import butter, filtfilt
        nyq = self.sample_rate / 2.0
        b, a = butter(4, [self.bandpass_low / nyq, self.bandpass_high / nyq], btype="band")
        audio = filtfilt(b, a, audio)
        if len(audio) < self.target_samples:
            audio = np.pad(audio, (0, self.target_samples - len(audio)))
        else:
            audio = audio[:self.target_samples]
        std = np.std(audio)
        if std > 0:
            audio = (audio - np.mean(audio)) / std
        return self._extract_features_to_array(audio)

    def features_to_array(self, features: np.ndarray) -> np.ndarray:
        return features

    def _extract_features_to_array(self, audio: np.ndarray) -> np.ndarray:
        n_fft, hop = 2048, 512
        sr = self.sample_rate
        mfcc     = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=40, n_fft=n_fft, hop_length=hop)
        d_mfcc   = librosa.feature.delta(mfcc)
        d2_mfcc  = librosa.feature.delta(mfcc, order=2)
        sc       = librosa.feature.spectral_centroid(y=audio, sr=sr)
        rolloff  = librosa.feature.spectral_rolloff(y=audio, sr=sr)
        bw       = librosa.feature.spectral_bandwidth(y=audio, sr=sr)
        zcr      = librosa.feature.zero_crossing_rate(audio)
        chroma   = librosa.feature.chroma_stft(y=audio, sr=sr, n_fft=n_fft, hop_length=hop)
        mel      = librosa.feature.melspectrogram(y=audio, sr=sr, n_fft=n_fft, hop_length=hop, n_mels=128)
        mel_db   = librosa.power_to_db(mel, ref=np.max)
        rms      = librosa.feature.rms(y=audio)
        contrast = librosa.feature.spectral_contrast(y=audio, sr=sr, n_fft=n_fft, hop_length=hop)
        flatness = librosa.feature.spectral_flatness(y=audio)
        tonnetz  = librosa.feature.tonnetz(y=librosa.effects.harmonic(audio), sr=sr)
        flat = np.concatenate([
            np.mean(mfcc, axis=1),    np.std(mfcc, axis=1),
            np.mean(d_mfcc, axis=1),  np.std(d_mfcc, axis=1),
            np.mean(d2_mfcc, axis=1), np.std(d2_mfcc, axis=1),
            [np.mean(sc)],   [np.std(sc)],
            [np.mean(rolloff)], [np.std(rolloff)],
            [np.mean(bw)],   [np.std(bw)],
            [np.mean(zcr)],  [np.std(zcr)],
            np.mean(chroma, axis=1), np.std(chroma, axis=1),
            np.mean(mel_db, axis=1), np.std(mel_db, axis=1),
            [np.mean(rms)],  [np.std(rms)],
            np.mean(contrast, axis=1), np.std(contrast, axis=1),
            [np.mean(flatness)], [np.std(flatness)],
            np.mean(tonnetz, axis=1), np.std(tonnetz, axis=1),
        ])
        return flat.astype(np.float32)


class PCGSeverityPreprocessor:
    """
    Preprocessing for CNN-based murmur severity model.
    Generates mel-spectrogram or MFCC matrix.
    The output time axis is fixed to `target_time_frames` (default 216)
    to match the trained CNN's expected input shape (128, 216, 1).
    """
    
    def __init__(
        self,
        sample_rate: int = 22050,
        n_mels: int = 128,
        n_fft: int = 2048,
        hop_length: int = 512,
        target_time_frames: int = 216,
        use_mel: bool = True
    ):
        self.sample_rate = sample_rate
        self.n_mels = n_mels
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.target_time_frames = target_time_frames
        self.use_mel = use_mel
        
        logger.info(f"PCGSeverityPreprocessor initialized: mel={use_mel}, n_mels={n_mels}, target_frames={target_time_frames}")
    
    def process(self, audio: np.ndarray, original_sr: Optional[int] = None) -> np.ndarray:
        """
        Process PCG audio to spectrogram for CNN.
        
        Returns:
            2D array of shape (n_mels, target_time_frames)
        """
        try:
            # Resample if needed
            if original_sr and original_sr != self.sample_rate:
                audio = librosa.resample(audio, orig_sr=original_sr, target_sr=self.sample_rate)
            
            # Normalize
            audio = self._normalize(audio)
            
            # Generate spectrogram
            if self.use_mel:
                spectrogram = librosa.feature.melspectrogram(
                    y=audio,
                    sr=self.sample_rate,
                    n_mels=self.n_mels,
                    n_fft=self.n_fft,
                    hop_length=self.hop_length
                )
                # Convert to dB
                spectrogram = librosa.power_to_db(spectrogram, ref=np.max)
            else:
                # MFCC
                spectrogram = librosa.feature.mfcc(
                    y=audio,
                    sr=self.sample_rate,
                    n_mfcc=self.n_mels,
                    n_fft=self.n_fft,
                    hop_length=self.hop_length
                )
            
            # Pad or truncate time axis to match trained CNN input shape
            n_time = spectrogram.shape[1]
            if n_time < self.target_time_frames:
                pad_width = self.target_time_frames - n_time
                spectrogram = np.pad(spectrogram, ((0, 0), (0, pad_width)), mode='constant', constant_values=spectrogram.min())
            elif n_time > self.target_time_frames:
                start = max(0, (n_time - self.target_time_frames) // 2)
                spectrogram = spectrogram[:, start:start + self.target_time_frames]
            
            logger.info(f"Severity preprocessing complete: shape={spectrogram.shape}")
            return spectrogram
            
        except Exception as e:
            logger.error(f"Severity preprocessing error: {e}")
            raise
    
    def _normalize(self, audio: np.ndarray) -> np.ndarray:
        """Z-score normalization."""
        mean = np.mean(audio)
        std = np.std(audio)
        if std > 0:
            return (audio - mean) / std
        return audio - mean


class ECGPreprocessor:
    """
    Deterministic ECG preprocessing for the AuscultICor v26 SL model.

    Default parameters match the AuscultICor_v26_SL.keras training configuration:
      sample_rate = 125 Hz  (MIT-BIH native sampling rate)
      window_size = 500     (samples per beat window after resampling)

    The MQTT handler receives raw ECG from the ESP32 (500 Hz capture rate)
    and resamples it to 125 Hz before windowing.

    NOTE: Do NOT change sample_rate or window_size without retraining the model.
    Both values are also configurable via env vars ECG_SAMPLE_RATE / ECG_WINDOW_SIZE.
    """
    
    def __init__(
        self,
        sample_rate: int = 125,    # MIT-BIH native rate (matches AuscultICor v26 SL)
        window_size: int = 500,    # samples per beat window (matches AuscultICor v26 SL)
        bandpass_low: float = 0.5,
        bandpass_high: float = 50.0
    ):
        self.sample_rate = sample_rate
        self.window_size = window_size
        self.bandpass_low = bandpass_low
        self.bandpass_high = bandpass_high
        
        logger.info(f"ECGPreprocessor initialized: sr={sample_rate}, window={window_size}")
    
    def process(self, ecg: np.ndarray, original_sr: Optional[int] = None) -> np.ndarray:
        """
        Process ECG signal for BiLSTM.
        
        Returns:
            Processed ECG window
        """
        try:
            # Resample if needed
            if original_sr and original_sr != self.sample_rate:
                ecg = signal.resample(ecg, int(len(ecg) * self.sample_rate / original_sr))
                logger.info(f"Resampled ECG from {original_sr} to {self.sample_rate} Hz")
            
            # Bandpass filter (0.5-50 Hz)
            ecg = self._bandpass_filter(ecg)
            
            # Baseline correction
            ecg = self._baseline_correction(ecg)
            
            # Denoise (simple moving average)
            ecg = self._denoise(ecg)
            
            # Take window
            if len(ecg) < self.window_size:
                # Pad
                ecg = np.pad(ecg, (0, self.window_size - len(ecg)), mode='edge')
            elif len(ecg) > self.window_size:
                # Take last window
                ecg = ecg[-self.window_size:]
            
            # Z-score normalization
            ecg = self._normalize(ecg)
            
            logger.info(f"ECG preprocessing complete: shape={ecg.shape}")
            return ecg
            
        except Exception as e:
            logger.error(f"ECG preprocessing error: {e}")
            raise
    
    def _bandpass_filter(self, ecg: np.ndarray) -> np.ndarray:
        """Apply Butterworth bandpass filter."""
        nyquist = self.sample_rate / 2.0
        low = self.bandpass_low / nyquist
        high = self.bandpass_high / nyquist
        
        b, a = signal.butter(4, [low, high], btype='band')
        filtered = signal.filtfilt(b, a, ecg)
        return filtered
    
    def _baseline_correction(self, ecg: np.ndarray) -> np.ndarray:
        """Remove baseline wander."""
        # High-pass filter at 0.5 Hz
        nyquist = self.sample_rate / 2.0
        cutoff = 0.5 / nyquist
        b, a = signal.butter(1, cutoff, btype='high')
        return signal.filtfilt(b, a, ecg)
    
    def _denoise(self, ecg: np.ndarray, window: int = 5) -> np.ndarray:
        """Simple moving average denoising."""
        kernel = np.ones(window) / window
        return np.convolve(ecg, kernel, mode='same')
    
    def _normalize(self, ecg: np.ndarray) -> np.ndarray:
        """Z-score normalization."""
        mean = np.mean(ecg)
        std = np.std(ecg)
        if std > 0:
            return (ecg - mean) / std
        return ecg - mean


def get_preprocessing_version() -> str:
    """Get current preprocessing version."""
    return PREPROCESSING_VERSION
