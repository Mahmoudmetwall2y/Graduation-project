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


class PCGPreprocessor:
    """
    Deterministic PCG preprocessing for XGBoost classifier.
    """
    
    def __init__(
        self,
        sample_rate: int = 22050,
        target_duration: float = 10.0,
        bandpass_low: float = 20.0,
        bandpass_high: float = 400.0,
        n_mfcc: int = 13
    ):
        self.sample_rate = sample_rate
        self.target_duration = target_duration
        self.target_samples = int(sample_rate * target_duration)
        self.bandpass_low = bandpass_low
        self.bandpass_high = bandpass_high
        self.n_mfcc = n_mfcc
        
        logger.info(f"PCGPreprocessor initialized: sr={sample_rate}, duration={target_duration}s")
    
    def process(self, audio: np.ndarray, original_sr: Optional[int] = None) -> Dict[str, np.ndarray]:
        """
        Process PCG audio to features for XGBoost.
        
        Args:
            audio: Raw audio samples
            original_sr: Original sample rate (will resample if different)
        
        Returns:
            Dictionary of features
        """
        try:
            # Resample if needed
            if original_sr and original_sr != self.sample_rate:
                audio = librosa.resample(audio, orig_sr=original_sr, target_sr=self.sample_rate)
                logger.info(f"Resampled from {original_sr} to {self.sample_rate} Hz")

            # Filter before selecting the analysis window so the centered crop
            # is taken from a clinically cleaner signal.
            audio = self._bandpass_filter(audio)

            # Standardize duration (pad or centered crop)
            if len(audio) < self.target_samples:
                # Pad with zeros
                audio = np.pad(audio, (0, self.target_samples - len(audio)), mode='constant')
            elif len(audio) > self.target_samples:
                audio = self._center_crop(audio, self.target_samples)
            
            # Normalize
            audio = self._normalize(audio)
            
            # Extract features
            features = self._extract_features(audio)
            
            logger.info(f"PCG preprocessing complete: {len(features)} features")
            return features
            
        except Exception as e:
            logger.error(f"PCG preprocessing error: {e}")
            raise

    @staticmethod
    def _center_crop(audio: np.ndarray, target_samples: int) -> np.ndarray:
        """Crop the stable center of a longer clip to reduce start/end handling noise."""
        start = max(0, (len(audio) - target_samples) // 2)
        end = start + target_samples
        return audio[start:end]
    
    def _bandpass_filter(self, audio: np.ndarray) -> np.ndarray:
        """Apply Butterworth bandpass filter."""
        nyquist = self.sample_rate / 2.0
        low = self.bandpass_low / nyquist
        high = self.bandpass_high / nyquist
        
        b, a = signal.butter(4, [low, high], btype='band')
        filtered = signal.filtfilt(b, a, audio)
        return filtered
    
    def _normalize(self, audio: np.ndarray) -> np.ndarray:
        """Z-score normalization."""
        mean = np.mean(audio)
        std = np.std(audio)
        if std > 0:
            return (audio - mean) / std
        return audio - mean
    
    def _extract_features(self, audio: np.ndarray) -> Dict[str, np.ndarray]:
        """
        Extract acoustic features matching training pipeline (558 features):
        - MFCC (40)
        - Chroma (12)
        - Mel Spectrogram (128)
        - Spectral Centroid, Bandwidth, Rolloff, ZCR, RMS
        """
        features = {}
        target_len = self.target_samples
        n_fft = 2048
        hop_length = 512
        
        # 1. MFCCs (40)
        mfcc = librosa.feature.mfcc(y=audio, sr=self.sample_rate, n_mfcc=40, n_fft=n_fft, hop_length=hop_length)
        features['mfcc_mean'] = np.mean(mfcc, axis=1)
        features['mfcc_std'] = np.std(mfcc, axis=1)
        
        # 2. Delta MFCCs
        delta_mfcc = librosa.feature.delta(mfcc)
        features['delta_mfcc_mean'] = np.mean(delta_mfcc, axis=1)
        features['delta_mfcc_std'] = np.std(delta_mfcc, axis=1)
        
        # 3. Delta-Delta MFCCs
        delta2_mfcc = librosa.feature.delta(mfcc, order=2)
        features['delta2_mfcc_mean'] = np.mean(delta2_mfcc, axis=1)
        features['delta2_mfcc_std'] = np.std(delta2_mfcc, axis=1)
        
        # 4. Spectral Centroid
        sc = librosa.feature.spectral_centroid(y=audio, sr=self.sample_rate)
        features['sc_mean'] = np.array([np.mean(sc)])
        features['sc_std'] = np.array([np.std(sc)])
        
        # 5. Spectral Rolloff
        sr_ = librosa.feature.spectral_rolloff(y=audio, sr=self.sample_rate)
        features['sr_mean'] = np.array([np.mean(sr_)])
        features['sr_std'] = np.array([np.std(sr_)])
        
        # 6. Spectral Bandwidth
        sb = librosa.feature.spectral_bandwidth(y=audio, sr=self.sample_rate)
        features['sb_mean'] = np.array([np.mean(sb)])
        features['sb_std'] = np.array([np.std(sb)])
        
        # 7. Zero-Crossing Rate
        zcr = librosa.feature.zero_crossing_rate(audio)
        features['zcr_mean'] = np.array([np.mean(zcr)])
        features['zcr_std'] = np.array([np.std(zcr)])
        
        # 8. Chroma Features (12)
        chroma = librosa.feature.chroma_stft(y=audio, sr=self.sample_rate, n_fft=n_fft, hop_length=hop_length)
        features['chroma_mean'] = np.mean(chroma, axis=1)
        features['chroma_std'] = np.std(chroma, axis=1)
        
        # 9. Mel Spectrogram statistics (128)
        mel = librosa.feature.melspectrogram(y=audio, sr=self.sample_rate, n_fft=n_fft, hop_length=hop_length, n_mels=128)
        mel_db = librosa.power_to_db(mel, ref=np.max)
        features['mel_mean'] = np.mean(mel_db, axis=1)
        features['mel_std'] = np.std(mel_db, axis=1)
        
        # 10. RMS Energy
        rms = librosa.feature.rms(y=audio)
        features['rms_mean'] = np.array([np.mean(rms)])
        features['rms_std'] = np.array([np.std(rms)])
        
        # 11. Spectral Contrast
        contrast = librosa.feature.spectral_contrast(y=audio, sr=self.sample_rate, n_fft=n_fft, hop_length=hop_length)
        features['contrast_mean'] = np.mean(contrast, axis=1)
        features['contrast_std'] = np.std(contrast, axis=1)

        # 12. Spectral Flatness
        flatness = librosa.feature.spectral_flatness(y=audio)
        features['flatness_mean'] = np.array([np.mean(flatness)])
        features['flatness_std'] = np.array([np.std(flatness)])

        # 13. Tonnetz
        tonnetz = librosa.feature.tonnetz(y=librosa.effects.harmonic(audio), sr=self.sample_rate)
        features['tonnetz_mean'] = np.mean(tonnetz, axis=1)
        features['tonnetz_std'] = np.std(tonnetz, axis=1)
        
        return features
    
    def features_to_array(self, features: Dict[str, np.ndarray]) -> np.ndarray:
        """Convert feature dictionary to flat array for model input."""
        flat = []
        
        # Ensure order matches validate_models.py exactly
        flat.extend(features['mfcc_mean'])
        flat.extend(features['mfcc_std'])
        flat.extend(features['delta_mfcc_mean'])
        flat.extend(features['delta_mfcc_std'])
        flat.extend(features['delta2_mfcc_mean'])
        flat.extend(features['delta2_mfcc_std'])
        flat.extend(features['sc_mean'])
        flat.extend(features['sc_std'])
        flat.extend(features['sr_mean'])
        flat.extend(features['sr_std'])
        flat.extend(features['sb_mean'])
        flat.extend(features['sb_std'])
        flat.extend(features['zcr_mean'])
        flat.extend(features['zcr_std'])
        flat.extend(features['chroma_mean'])
        flat.extend(features['chroma_std'])
        flat.extend(features['mel_mean'])
        flat.extend(features['mel_std'])
        flat.extend(features['rms_mean'])
        flat.extend(features['rms_std'])
        flat.extend(features['contrast_mean'])
        flat.extend(features['contrast_std'])
        flat.extend(features['flatness_mean'])
        flat.extend(features['flatness_std'])
        flat.extend(features['tonnetz_mean'])
        flat.extend(features['tonnetz_std'])
        
        return np.array(flat)


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
    Deterministic ECG preprocessing for BiLSTM.
    Sample rate and window size match the MIT-BIH training configuration.
    """
    
    def __init__(
        self,
        sample_rate: int = 360,   # MIT-BIH native rate (matches training)
        window_size: int = 300,   # matches WINDOW_SIZE in training script
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
