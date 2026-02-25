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
                
                # Parse outputs — labels match SONOCARDIA paper exactly
                location_labels = [
                    'AV', 'MV', 'PV', 'TV',
                    'Left heart', 'Right heart',
                    'AV+Right', 'MV+Right',
                    'Multiple (3+)', 'Other'
                ]
                timing_labels = [
                    'Early-systolic', 'Mid-systolic', 'Late-systolic',
                    'Holosystolic', 'Unknown'
                ]
                shape_labels = [
                    'Crescendo', 'Decrescendo',
                    'Crescendo-decrescendo', 'Plateau', 'Unknown'
                ]
                grading_labels = [
                    'I/VI', 'II/VI', 'III/VI',
                    'IV/VI', 'V/VI', 'VI/VI', 'Unknown'
                ]
                pitch_labels = ['Low', 'Medium', 'High', 'Unknown']
                quality_labels = ['Blowing', 'Harsh', 'Musical', 'Unknown']
                
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
                
                # Parse output — 5-class beat classification per paper
                # N=Normal, SVEB=Supraventricular, VEB=Ventricular,
                # F=Fusion, Q=Unknown
                labels = ['Normal', 'SVEB', 'VEB', 'Fusion', 'Unknown']
                pred_class = np.argmax(prediction[0])
                confidence = float(np.max(prediction[0]))
                
                result = {
                    'prediction': labels[pred_class],
                    'confidence': confidence,
                    'probabilities': {
                        labels[i]: float(prediction[0][i])
                        for i in range(min(len(labels), len(prediction[0])))
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
    
    def _demo_pcg_prediction(self, audio: np.ndarray, scenario: str = 'normal') -> Dict[str, Any]:
        """Deterministic demo PCG prediction based on scenario and audio characteristics."""
        # Map scenarios to expected labels
        scenario_labels = {
            'normal': 'Normal',
            'tachycardia': 'Normal',
            'bradycardia': 'Normal',
            'systolic_murmur': 'Murmur',
            'diastolic_murmur': 'Murmur',
            'combined_murmur': 'Murmur',
            'abnormal_ecg': 'Normal',  # PCG may still be normal
            'afib': 'Normal',  # PCG may still be normal
        }
        
        expected_label = scenario_labels.get(scenario, 'Normal')
        
        if expected_label == 'Murmur':
            return {
                'label': 'Murmur',
                'probabilities': {
                    'Normal': 0.20,
                    'Murmur': 0.70,
                    'Artifact': 0.10
                }
            }
        elif expected_label == 'Artifact':
            return {
                'label': 'Artifact',
                'probabilities': {
                    'Normal': 0.15,
                    'Murmur': 0.20,
                    'Artifact': 0.65
                }
            }
        else:
            # Normal
            return {
                'label': 'Normal',
                'probabilities': {
                    'Normal': 0.75,
                    'Murmur': 0.15,
                    'Artifact': 0.10
                }
            }
    
    def _demo_severity_prediction(self) -> Dict[str, Any]:
        """Deterministic demo severity prediction (labels match SONOCARDIA paper)."""
        return {
            'location': {
                'predicted': 'MV',
                'probabilities': {
                    'AV': 0.10, 'MV': 0.45, 'PV': 0.12, 'TV': 0.08,
                    'Left heart': 0.08, 'Right heart': 0.05,
                    'AV+Right': 0.04, 'MV+Right': 0.03,
                    'Multiple (3+)': 0.03, 'Other': 0.02
                }
            },
            'timing': {
                'predicted': 'Mid-systolic',
                'probabilities': {
                    'Early-systolic': 0.10, 'Mid-systolic': 0.50,
                    'Late-systolic': 0.15, 'Holosystolic': 0.20,
                    'Unknown': 0.05
                }
            },
            'shape': {
                'predicted': 'Crescendo-decrescendo',
                'probabilities': {
                    'Crescendo': 0.15, 'Decrescendo': 0.18,
                    'Crescendo-decrescendo': 0.50, 'Plateau': 0.12,
                    'Unknown': 0.05
                }
            },
            'grading': {
                'predicted': 'III/VI',
                'probabilities': {
                    'I/VI': 0.05, 'II/VI': 0.12, 'III/VI': 0.38,
                    'IV/VI': 0.22, 'V/VI': 0.10, 'VI/VI': 0.05,
                    'Unknown': 0.08
                }
            },
            'pitch': {
                'predicted': 'Medium',
                'probabilities': {
                    'Low': 0.18, 'Medium': 0.50, 'High': 0.25,
                    'Unknown': 0.07
                }
            },
            'quality': {
                'predicted': 'Blowing',
                'probabilities': {
                    'Blowing': 0.48, 'Harsh': 0.28,
                    'Musical': 0.15, 'Unknown': 0.09
                }
            }
        }
    
    def _demo_ecg_prediction(self, ecg: np.ndarray) -> Dict[str, Any]:
        """Deterministic demo ECG prediction (5-class per SONOCARDIA paper)."""
        # Simple heuristic: use variance
        variance = np.var(ecg)
        
        if variance > 2.0:
            # Very high variance -> Ventricular ectopic
            return {
                'prediction': 'VEB',
                'confidence': 0.68,
                'probabilities': {
                    'Normal': 0.12, 'SVEB': 0.10,
                    'VEB': 0.68, 'Fusion': 0.06,
                    'Unknown': 0.04
                }
            }
        elif variance > 1.0:
            # Medium-high variance -> Supraventricular ectopic
            return {
                'prediction': 'SVEB',
                'confidence': 0.62,
                'probabilities': {
                    'Normal': 0.20, 'SVEB': 0.62,
                    'VEB': 0.08, 'Fusion': 0.05,
                    'Unknown': 0.05
                }
            }
        else:
            # Low variance -> Normal
            return {
                'prediction': 'Normal',
                'confidence': 0.81,
                'probabilities': {
                    'Normal': 0.81, 'SVEB': 0.08,
                    'VEB': 0.05, 'Fusion': 0.03,
                    'Unknown': 0.03
                }
            }
