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
            
            # Standardize duration (pad or truncate)
            if len(audio) < self.target_samples:
                # Pad with zeros
                audio = np.pad(audio, (0, self.target_samples - len(audio)), mode='constant')
            elif len(audio) > self.target_samples:
                # Truncate
                audio = audio[:self.target_samples]
            
            # Bandpass filter (20-400 Hz)
            audio = self._bandpass_filter(audio)
            
            # Normalize
            audio = self._normalize(audio)
            
            # Extract features
            features = self._extract_features(audio)
            
            logger.info(f"PCG preprocessing complete: {len(features)} features")
            return features
            
        except Exception as e:
            logger.error(f"PCG preprocessing error: {e}")
            raise
    
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
        Extract acoustic features:
        - MFCC (13 coefficients)
        - Spectral centroid
        - Spectral rolloff
        - Spectral bandwidth
        - Zero crossing rate
        """
        features = {}
        
        # MFCCs
        mfccs = librosa.feature.mfcc(
            y=audio, 
            sr=self.sample_rate, 
            n_mfcc=self.n_mfcc
        )
        features['mfcc_mean'] = np.mean(mfccs, axis=1)
        features['mfcc_std'] = np.std(mfccs, axis=1)
        
        # Spectral features
        spectral_centroids = librosa.feature.spectral_centroid(y=audio, sr=self.sample_rate)[0]
        features['spectral_centroid_mean'] = np.mean(spectral_centroids)
        features['spectral_centroid_std'] = np.std(spectral_centroids)
        
        spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=self.sample_rate)[0]
        features['spectral_rolloff_mean'] = np.mean(spectral_rolloff)
        features['spectral_rolloff_std'] = np.std(spectral_rolloff)
        
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=self.sample_rate)[0]
        features['spectral_bandwidth_mean'] = np.mean(spectral_bandwidth)
        features['spectral_bandwidth_std'] = np.std(spectral_bandwidth)
        
        # Zero crossing rate
        zcr = librosa.feature.zero_crossing_rate(audio)[0]
        features['zcr_mean'] = np.mean(zcr)
        features['zcr_std'] = np.std(zcr)
        
        return features
    
    def features_to_array(self, features: Dict[str, np.ndarray]) -> np.ndarray:
        """Convert feature dictionary to flat array for model input."""
        flat = []
        
        # MFCCs (26 features: 13 means + 13 stds)
        flat.extend(features['mfcc_mean'])
        flat.extend(features['mfcc_std'])
        
        # Spectral features (6 features)
        flat.append(features['spectral_centroid_mean'])
        flat.append(features['spectral_centroid_std'])
        flat.append(features['spectral_rolloff_mean'])
        flat.append(features['spectral_rolloff_std'])
        flat.append(features['spectral_bandwidth_mean'])
        flat.append(features['spectral_bandwidth_std'])
        
        # ZCR (2 features)
        flat.append(features['zcr_mean'])
        flat.append(features['zcr_std'])
        
        return np.array(flat)


class PCGSeverityPreprocessor:
    """
    Preprocessing for CNN-based murmur severity model.
    Generates mel-spectrogram or MFCC matrix.
    """
    
    def __init__(
        self,
        sample_rate: int = 22050,
        n_mels: int = 128,
        n_fft: int = 2048,
        hop_length: int = 512,
        use_mel: bool = True
    ):
        self.sample_rate = sample_rate
        self.n_mels = n_mels
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.use_mel = use_mel
        
        logger.info(f"PCGSeverityPreprocessor initialized: mel={use_mel}, n_mels={n_mels}")
    
    def process(self, audio: np.ndarray, original_sr: Optional[int] = None) -> np.ndarray:
        """
        Process PCG audio to spectrogram for CNN.
        
        Returns:
            2D array (time x frequency)
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
    """
    
    def __init__(
        self,
        sample_rate: int = 500,
        window_size: int = 500,
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
