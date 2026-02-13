"""
ML Inference Engine with Demo Mode support.
Loads models at startup, falls back to deterministic mocks if missing.
"""

import os
import numpy as np
from typing import Dict, Any, Optional, Tuple
import logging
import time
from pathlib import Path

from .preprocessing import (
    PCGPreprocessor,
    PCGSeverityPreprocessor,
    ECGPreprocessor,
    get_preprocessing_version
)

logger = logging.getLogger(__name__)

# Model file paths
MODELS_DIR = Path(__file__).parent.parent / "models"
PCG_MODEL_PATH = MODELS_DIR / "pcg_classifier.pkl"
SEVERITY_MODEL_PATH = MODELS_DIR / "murmur_severity.h5"
ECG_MODEL_PATH = MODELS_DIR / "ecg_predictor.h5"


class InferenceEngine:
    """
    Main inference engine that orchestrates all 3 models.
    Supports Demo Mode when models are missing.
    """
    
    def __init__(self, enable_demo_mode: bool = True):
        self.enable_demo_mode = enable_demo_mode
        self.demo_mode_active = False
        
        # Initialize preprocessors
        self.pcg_preprocessor = PCGPreprocessor()
        self.severity_preprocessor = PCGSeverityPreprocessor()
        self.ecg_preprocessor = ECGPreprocessor()
        
        # Load models
        self._load_models()
        
        logger.info(f"InferenceEngine initialized (demo_mode: {self.demo_mode_active})")
    
    def _load_models(self):
        """Load ML models or activate demo mode."""
        try:
            # Try to load PCG classifier (XGBoost)
            if PCG_MODEL_PATH.exists():
                import pickle
                with open(PCG_MODEL_PATH, 'rb') as f:
                    self.pcg_model = pickle.load(f)
                logger.info(f"Loaded PCG model from {PCG_MODEL_PATH}")
            else:
                raise FileNotFoundError(f"PCG model not found: {PCG_MODEL_PATH}")
            
            # Try to load Severity model (Keras/TF)
            if SEVERITY_MODEL_PATH.exists():
                from tensorflow import keras
                self.severity_model = keras.models.load_model(SEVERITY_MODEL_PATH)
                logger.info(f"Loaded Severity model from {SEVERITY_MODEL_PATH}")
            else:
                raise FileNotFoundError(f"Severity model not found: {SEVERITY_MODEL_PATH}")
            
            # Try to load ECG model (Keras/TF)
            if ECG_MODEL_PATH.exists():
                from tensorflow import keras
                self.ecg_model = keras.models.load_model(ECG_MODEL_PATH)
                logger.info(f"Loaded ECG model from {ECG_MODEL_PATH}")
            else:
                raise FileNotFoundError(f"ECG model not found: {ECG_MODEL_PATH}")
            
            self.demo_mode_active = False
            
        except Exception as e:
            if self.enable_demo_mode:
                logger.warning(f"Model loading failed, activating DEMO MODE: {e}")
                self.pcg_model = None
                self.severity_model = None
                self.ecg_model = None
                self.demo_mode_active = True
            else:
                logger.error(f"Model loading failed and demo mode disabled: {e}")
                raise
    
    def predict_pcg(self, audio: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """
        Run PCG classification.
        
        Returns:
            {
                'label': str,  # Normal, Murmur, Artifact
                'probabilities': dict,
                'model_version': str,
                'preprocessing_version': str,
                'latency_ms': int,
                'demo_mode': bool
            }
        """
        start_time = time.time()
        
        try:
            # Preprocess
            features = self.pcg_preprocessor.process(audio, original_sr=sample_rate)
            feature_array = self.pcg_preprocessor.features_to_array(features)
            feature_array = feature_array.reshape(1, -1)  # Add batch dimension
            
            # Predict
            if self.demo_mode_active:
                result = self._demo_pcg_prediction(audio)
            else:
                probs = self.pcg_model.predict_proba(feature_array)[0]
                classes = ['Normal', 'Murmur', 'Artifact']
                label = classes[np.argmax(probs)]
                
                result = {
                    'label': label,
                    'probabilities': {
                        'Normal': float(probs[0]),
                        'Murmur': float(probs[1]),
                        'Artifact': float(probs[2])
                    }
                }
            
            # Add metadata
            latency = int((time.time() - start_time) * 1000)
            result.update({
                'model_name': 'pcg_xgboost_classifier',
                'model_version': 'v1.0.0' if not self.demo_mode_active else 'demo',
                'preprocessing_version': get_preprocessing_version(),
                'latency_ms': latency,
                'demo_mode': self.demo_mode_active
            })
            
            logger.info(f"PCG prediction: {result['label']} ({latency}ms)")
            return result
            
        except Exception as e:
            logger.error(f"PCG prediction error: {e}")
            raise
    
    def predict_murmur_severity(
        self, 
        audio: np.ndarray, 
        sample_rate: int
    ) -> Optional[Dict[str, Any]]:
        """
        Run murmur severity analysis (only if PCG == Murmur).
        
        Returns 6 heads:
        - location
        - timing
        - shape
        - grading
        - pitch
        - quality
        """
        start_time = time.time()
        
        try:
            # Preprocess
            spectrogram = self.severity_preprocessor.process(audio, original_sr=sample_rate)
            
            # Add batch and channel dimensions
            spectrogram = np.expand_dims(spectrogram, axis=0)  # Batch
            spectrogram = np.expand_dims(spectrogram, axis=-1)  # Channel
            
            # Predict
            if self.demo_mode_active:
                result = self._demo_severity_prediction()
            else:
                # Model outputs 6 heads
                predictions = self.severity_model.predict(spectrogram)
                
                # Parse outputs (assuming multi-head model)
                location_labels = ['AV', 'MV', 'PV', 'TV']
                timing_labels = ['systolic', 'diastolic', 'continuous']
                shape_labels = ['crescendo', 'decrescendo', 'plateau', 'crescendo-decrescendo']
                grading_labels = ['I/VI', 'II/VI', 'III/VI', 'IV/VI', 'V/VI', 'VI/VI']
                pitch_labels = ['low', 'medium', 'high']
                quality_labels = ['blowing', 'harsh', 'rumbling', 'musical']
                
                result = {
                    'location': self._parse_head(predictions[0][0], location_labels),
                    'timing': self._parse_head(predictions[1][0], timing_labels),
                    'shape': self._parse_head(predictions[2][0], shape_labels),
                    'grading': self._parse_head(predictions[3][0], grading_labels),
                    'pitch': self._parse_head(predictions[4][0], pitch_labels),
                    'quality': self._parse_head(predictions[5][0], quality_labels)
                }
            
            # Add metadata
            latency = int((time.time() - start_time) * 1000)
            result.update({
                'model_name': 'murmur_severity_cnn',
                'model_version': 'v1.0.0' if not self.demo_mode_active else 'demo',
                'preprocessing_version': get_preprocessing_version(),
                'latency_ms': latency,
                'demo_mode': self.demo_mode_active
            })
            
            logger.info(f"Severity prediction completed ({latency}ms)")
            return result
            
        except Exception as e:
            logger.error(f"Severity prediction error: {e}")
            raise
    
    def predict_ecg(self, ecg: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """
        Run ECG prediction.
        
        Returns:
            {
                'prediction': str,
                'confidence': float,
                'model_version': str,
                'preprocessing_version': str,
                'latency_ms': int,
                'demo_mode': bool
            }
        """
        start_time = time.time()
        
        try:
            # Preprocess
            processed = self.ecg_preprocessor.process(ecg, original_sr=sample_rate)
            
            # Add batch and time dimensions
            processed = processed.reshape(1, -1, 1)  # (batch, time, features)
            
            # Predict
            if self.demo_mode_active:
                result = self._demo_ecg_prediction(ecg)
            else:
                prediction = self.ecg_model.predict(processed)
                
                # Parse output (assuming binary or multi-class)
                labels = ['Normal', 'Abnormal']  # Simplified
                pred_class = np.argmax(prediction[0])
                confidence = float(np.max(prediction[0]))
                
                result = {
                    'prediction': labels[pred_class],
                    'confidence': confidence,
                    'probabilities': {
                        labels[i]: float(prediction[0][i])
                        for i in range(len(labels))
                    }
                }
            
            # Add metadata
            latency = int((time.time() - start_time) * 1000)
            result.update({
                'model_name': 'ecg_bilstm_predictor',
                'model_version': 'v1.0.0' if not self.demo_mode_active else 'demo',
                'preprocessing_version': get_preprocessing_version(),
                'latency_ms': latency,
                'demo_mode': self.demo_mode_active
            })
            
            logger.info(f"ECG prediction: {result['prediction']} ({latency}ms)")
            return result
            
        except Exception as e:
            logger.error(f"ECG prediction error: {e}")
            raise
    
    def _parse_head(self, probs: np.ndarray, labels: list) -> Dict[str, Any]:
        """Parse multi-class head output."""
        pred_idx = np.argmax(probs)
        return {
            'predicted': labels[pred_idx],
            'probabilities': {
                labels[i]: float(probs[i])
                for i in range(len(labels))
            }
        }
    
    # ========== DEMO MODE PREDICTIONS ==========
    
    def _demo_pcg_prediction(self, audio: np.ndarray) -> Dict[str, Any]:
        """Deterministic demo PCG prediction based on audio characteristics."""
        # Simple heuristic: use audio energy
        energy = np.mean(np.abs(audio))
        
        if energy < 0.05:
            # Low energy -> Artifact
            return {
                'label': 'Artifact',
                'probabilities': {
                    'Normal': 0.15,
                    'Murmur': 0.20,
                    'Artifact': 0.65
                }
            }
        elif energy > 0.15:
            # High energy -> Murmur
            return {
                'label': 'Murmur',
                'probabilities': {
                    'Normal': 0.25,
                    'Murmur': 0.60,
                    'Artifact': 0.15
                }
            }
        else:
            # Medium energy -> Normal
            return {
                'label': 'Normal',
                'probabilities': {
                    'Normal': 0.70,
                    'Murmur': 0.20,
                    'Artifact': 0.10
                }
            }
    
    def _demo_severity_prediction(self) -> Dict[str, Any]:
        """Deterministic demo severity prediction."""
        return {
            'location': {
                'predicted': 'MV',
                'probabilities': {'AV': 0.15, 'MV': 0.55, 'PV': 0.20, 'TV': 0.10}
            },
            'timing': {
                'predicted': 'systolic',
                'probabilities': {'systolic': 0.65, 'diastolic': 0.25, 'continuous': 0.10}
            },
            'shape': {
                'predicted': 'crescendo-decrescendo',
                'probabilities': {
                    'crescendo': 0.15,
                    'decrescendo': 0.20,
                    'plateau': 0.10,
                    'crescendo-decrescendo': 0.55
                }
            },
            'grading': {
                'predicted': 'III/VI',
                'probabilities': {
                    'I/VI': 0.05, 'II/VI': 0.15, 'III/VI': 0.40,
                    'IV/VI': 0.25, 'V/VI': 0.10, 'VI/VI': 0.05
                }
            },
            'pitch': {
                'predicted': 'medium',
                'probabilities': {'low': 0.20, 'medium': 0.55, 'high': 0.25}
            },
            'quality': {
                'predicted': 'blowing',
                'probabilities': {
                    'blowing': 0.50, 'harsh': 0.25, 'rumbling': 0.15, 'musical': 0.10
                }
            }
        }
    
    def _demo_ecg_prediction(self, ecg: np.ndarray) -> Dict[str, Any]:
        """Deterministic demo ECG prediction based on signal characteristics."""
        # Simple heuristic: use variance
        variance = np.var(ecg)
        
        if variance > 1.5:
            # High variance -> Abnormal
            return {
                'prediction': 'Abnormal',
                'confidence': 0.72,
                'probabilities': {
                    'Normal': 0.28,
                    'Abnormal': 0.72
                }
            }
        else:
            # Low variance -> Normal
            return {
                'prediction': 'Normal',
                'confidence': 0.81,
                'probabilities': {
                    'Normal': 0.81,
                    'Abnormal': 0.19
                }
            }
