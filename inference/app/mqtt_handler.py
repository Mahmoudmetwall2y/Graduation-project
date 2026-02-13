"""
MQTT Handler for real-time signal ingestion.
Manages buffering, reconstruction, and inference triggering.
"""

import os
import json
import struct
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import numpy as np
import paho.mqtt.client as mqtt
from collections import defaultdict
import base64

from .supabase_client import SupabaseClient
from .inference import InferenceEngine

logger = logging.getLogger(__name__)


class SessionBuffer:
    """Buffer for a single session's data stream."""
    
    def __init__(
        self,
        session_id: str,
        org_id: str,
        device_id: str,
        modality: str,
        config: Dict[str, Any]
    ):
        self.session_id = session_id
        self.org_id = org_id
        self.device_id = device_id
        self.modality = modality
        self.config = config
        
        # Buffering
        self.chunks = []
        self.total_bytes = 0
        self.total_samples = 0
        
        # Timing
        self.started_at = datetime.utcnow()
        self.last_chunk_at = datetime.utcnow()
        self.ended = False
        
        # Metadata
        self.valve_position = config.get('valve_position')
        self.sample_rate = config.get('sample_rate_hz', 22050 if modality == 'pcg' else 500)
        self.format = config.get('format', 'pcm_s16le')
        
        logger.info(f"Created buffer for {modality} session {session_id}")
    
    def add_chunk(self, data: bytes):
        """Add binary chunk to buffer."""
        self.chunks.append(data)
        self.total_bytes += len(data)
        self.last_chunk_at = datetime.utcnow()
        
        # Estimate samples (assuming int16 = 2 bytes per sample)
        bytes_per_sample = 2 if 'int16' in self.format or 's16' in self.format else 1
        self.total_samples += len(data) // bytes_per_sample
    
    def get_duration(self) -> float:
        """Get duration in seconds."""
        if self.total_samples > 0 and self.sample_rate > 0:
            return self.total_samples / self.sample_rate
        return 0.0
    
    def reconstruct_signal(self) -> np.ndarray:
        """Reconstruct full signal from chunks."""
        # Concatenate all chunks
        full_data = b''.join(self.chunks)
        
        # Parse based on format
        if 'int16' in self.format or 's16' in self.format:
            # 16-bit signed integer
            signal = np.frombuffer(full_data, dtype=np.int16)
            # Normalize to [-1, 1]
            signal = signal.astype(np.float32) / 32768.0
        else:
            # Fallback: assume float32
            signal = np.frombuffer(full_data, dtype=np.float32)
        
        logger.info(f"Reconstructed {self.modality} signal: {len(signal)} samples")
        return signal
    
    def get_quality_metrics(self) -> Dict[str, Any]:
        """Compute simple quality metrics."""
        if not self.chunks:
            return {}
        
        signal = self.reconstruct_signal()
        
        return {
            'total_samples': int(self.total_samples),
            'duration_sec': float(self.get_duration()),
            'sample_rate': int(self.sample_rate),
            'snr_estimate': float(self._estimate_snr(signal)),
            'clipping_pct': float(self._detect_clipping(signal)),
            'missing_pct': 0.0,  # Simplified
            'buffer_health': 'good'
        }
    
    @staticmethod
    def _estimate_snr(signal: np.ndarray) -> float:
        """Estimate SNR (simplified)."""
        # Simple heuristic: ratio of signal power to noise floor
        signal_power = np.mean(signal ** 2)
        noise_floor = np.percentile(np.abs(signal), 10) ** 2
        if noise_floor > 0:
            snr = 10 * np.log10(signal_power / noise_floor)
            return max(0, min(snr, 60))  # Clamp to [0, 60] dB
        return 30.0
    
    @staticmethod
    def _detect_clipping(signal: np.ndarray) -> float:
        """Detect clipping percentage."""
        clipped = np.abs(signal) > 0.99
        return 100.0 * np.sum(clipped) / len(signal)


class MQTTHandler:
    """
    MQTT handler for AscultiCor streaming.
    Subscribes to device topics, buffers data, triggers inference.
    """
    
    def __init__(self):
        # Configuration
        self.broker = os.getenv("MQTT_BROKER", "mosquitto")
        self.port = int(os.getenv("MQTT_PORT", 1883))
        self.username = os.getenv("MQTT_USERNAME", "cardiosense")
        self.password = os.getenv("MQTT_PASSWORD", "cardiosense123")
        self.keepalive = int(os.getenv("MQTT_KEEPALIVE", 60))
        
        # Limits
        self.pcg_max_duration = float(os.getenv("PCG_MAX_DURATION", 15))
        self.ecg_max_duration = float(os.getenv("ECG_MAX_DURATION", 60))
        self.timeout_sec = int(os.getenv("STREAM_TIMEOUT_SEC", 10))
        self.metrics_update_hz = float(os.getenv("METRICS_UPDATE_HZ", 2))
        
        # State
        self.buffers: Dict[str, SessionBuffer] = {}
        self.running = False
        
        # Clients
        self.supabase = SupabaseClient()
        self.inference_engine = InferenceEngine(
            enable_demo_mode=os.getenv("ENABLE_DEMO_MODE", "true").lower() == "true"
        )
        
        # MQTT client
        self.client = mqtt.Client(client_id="cardiosense-inference")
        self.client.username_pw_set(self.username, self.password)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        
        logger.info(f"MQTTHandler initialized: {self.broker}:{self.port}")
    
    def start(self):
        """Start MQTT connection and monitoring."""
        self.running = True
        
        try:
            logger.info(f"Connecting to MQTT broker: {self.broker}:{self.port}")
            self.client.connect(self.broker, self.port, self.keepalive)
            self.client.loop_start()
            
            # Start timeout monitor
            asyncio.create_task(self._monitor_timeouts())
            asyncio.create_task(self._publish_live_metrics())
            
        except Exception as e:
            logger.error(f"Failed to start MQTT handler: {e}")
            raise
    
    def stop(self):
        """Stop MQTT connection."""
        self.running = False
        self.client.loop_stop()
        self.client.disconnect()
        logger.info("MQTT handler stopped")
    
    def _on_connect(self, client, userdata, flags, rc):
        """Callback for MQTT connection."""
        if rc == 0:
            logger.info("Connected to MQTT broker")
            
            # Subscribe to all org topics
            # Pattern: org/+/device/+/session/+/meta
            client.subscribe("org/+/device/+/session/+/meta", qos=1)
            client.subscribe("org/+/device/+/session/+/pcg", qos=0)
            client.subscribe("org/+/device/+/session/+/ecg", qos=0)
            client.subscribe("org/+/device/+/session/+/heartbeat", qos=0)
            
            logger.info("Subscribed to all device topics")
        else:
            logger.error(f"MQTT connection failed with code {rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        """Callback for MQTT disconnection."""
        if rc != 0:
            logger.warning(f"Unexpected MQTT disconnection (code {rc})")
    
    def _on_message(self, client, userdata, msg):
        """Callback for MQTT message."""
        try:
            topic_parts = msg.topic.split('/')
            
            # Parse topic: org/{orgId}/device/{deviceId}/session/{sessionId}/{type}
            if len(topic_parts) != 8:
                logger.warning(f"Invalid topic format: {msg.topic}")
                return
            
            org_id = topic_parts[1]
            device_id = topic_parts[3]
            session_id = topic_parts[5]
            msg_type = topic_parts[7]
            
            # Route message
            if msg_type == 'meta':
                self._handle_meta_message(org_id, device_id, session_id, msg.payload)
            elif msg_type == 'pcg':
                self._handle_data_chunk(org_id, device_id, session_id, 'pcg', msg.payload)
            elif msg_type == 'ecg':
                self._handle_data_chunk(org_id, device_id, session_id, 'ecg', msg.payload)
            elif msg_type == 'heartbeat':
                asyncio.create_task(self._handle_heartbeat(device_id))
            
        except Exception as e:
            logger.error(f"Error handling message: {e}")
    
    def _handle_meta_message(
        self, 
        org_id: str, 
        device_id: str, 
        session_id: str, 
        payload: bytes
    ):
        """Handle control messages (start/end)."""
        try:
            meta = json.loads(payload.decode('utf-8'))
            msg_type = meta.get('type')
            
            if msg_type == 'start_pcg':
                self._handle_start_pcg(org_id, device_id, session_id, meta)
            elif msg_type == 'end_pcg':
                asyncio.create_task(self._handle_end_pcg(session_id))
            elif msg_type == 'start_ecg':
                self._handle_start_ecg(org_id, device_id, session_id, meta)
            elif msg_type == 'end_ecg':
                asyncio.create_task(self._handle_end_ecg(session_id))
            
        except Exception as e:
            logger.error(f"Error handling meta message: {e}")
    
    def _handle_start_pcg(
        self, 
        org_id: str, 
        device_id: str, 
        session_id: str, 
        config: Dict[str, Any]
    ):
        """Handle start_pcg message."""
        buffer_key = f"{session_id}_pcg"
        
        if buffer_key in self.buffers:
            logger.warning(f"PCG buffer already exists for session {session_id}")
            return
        
        self.buffers[buffer_key] = SessionBuffer(
            session_id=session_id,
            org_id=org_id,
            device_id=device_id,
            modality='pcg',
            config=config
        )
        
        # Update session status
        asyncio.create_task(self.supabase.update_session_status(session_id, 'streaming'))
        
        logger.info(f"Started PCG streaming for session {session_id}")
    
    def _handle_start_ecg(
        self, 
        org_id: str, 
        device_id: str, 
        session_id: str, 
        config: Dict[str, Any]
    ):
        """Handle start_ecg message."""
        buffer_key = f"{session_id}_ecg"
        
        if buffer_key in self.buffers:
            logger.warning(f"ECG buffer already exists for session {session_id}")
            return
        
        self.buffers[buffer_key] = SessionBuffer(
            session_id=session_id,
            org_id=org_id,
            device_id=device_id,
            modality='ecg',
            config=config
        )
        
        asyncio.create_task(self.supabase.update_session_status(session_id, 'streaming'))
        
        logger.info(f"Started ECG streaming for session {session_id}")
    
    def _handle_data_chunk(
        self,
        org_id: str,
        device_id: str,
        session_id: str,
        modality: str,
        payload: bytes
    ):
        """Handle binary data chunk."""
        buffer_key = f"{session_id}_{modality}"
        
        if buffer_key not in self.buffers:
            logger.warning(f"No buffer for {modality} session {session_id}, ignoring chunk")
            return
        
        buffer = self.buffers[buffer_key]
        
        # Check if payload is JSON (fallback format)
        try:
            if payload.startswith(b'{'):
                # JSON format with base64
                chunk_data = json.loads(payload.decode('utf-8'))
                data = base64.b64decode(chunk_data.get('data', ''))
            else:
                # Raw binary
                data = payload
            
            buffer.add_chunk(data)
            
            # Check limits
            duration = buffer.get_duration()
            max_duration = self.pcg_max_duration if modality == 'pcg' else self.ecg_max_duration
            
            if duration >= max_duration:
                logger.warning(f"{modality.upper()} buffer exceeded max duration, ending session")
                asyncio.create_task(self._force_end_session(session_id, modality))
            
        except Exception as e:
            logger.error(f"Error handling {modality} chunk: {e}")
    
    async def _handle_heartbeat(self, device_id: str):
        """Update device last_seen timestamp."""
        await self.supabase.update_device_last_seen(device_id)
    
    async def _handle_end_pcg(self, session_id: str):
        """Handle end_pcg message - finalize and run inference."""
        buffer_key = f"{session_id}_pcg"
        
        if buffer_key not in self.buffers:
            logger.warning(f"No PCG buffer for session {session_id}")
            return
        
        buffer = self.buffers[buffer_key]
        buffer.ended = True
        
        try:
            # Update status
            await self.supabase.update_session_status(session_id, 'processing')
            
            # Reconstruct signal
            audio = buffer.reconstruct_signal()
            
            # Upload to storage
            storage_path = f"{buffer.org_id}/{session_id}/pcg/recording.wav"
            audio_bytes = (audio * 32768).astype(np.int16).tobytes()
            checksum = SupabaseClient.compute_checksum(audio_bytes)
            
            await self.supabase.upload_file(
                bucket='recordings',
                path=storage_path,
                data=audio_bytes,
                content_type='audio/wav'
            )
            
            # Create recording entry
            await self.supabase.create_recording(
                org_id=buffer.org_id,
                session_id=session_id,
                modality='pcg',
                valve_position=buffer.valve_position,
                sample_rate=buffer.sample_rate,
                duration=buffer.get_duration(),
                storage_path=storage_path,
                checksum=checksum
            )
            
            # Run PCG inference
            pcg_result = self.inference_engine.predict_pcg(audio, buffer.sample_rate)
            
            # Store PCG prediction
            await self.supabase.create_prediction(
                org_id=buffer.org_id,
                session_id=session_id,
                modality='pcg',
                model_name=pcg_result['model_name'],
                model_version=pcg_result['model_version'],
                preprocessing_version=pcg_result['preprocessing_version'],
                output_json=pcg_result,
                latency_ms=pcg_result['latency_ms']
            )
            
            # If Murmur detected, run severity analysis
            if pcg_result['label'] == 'Murmur':
                logger.info("Murmur detected, running severity analysis")
                severity_result = self.inference_engine.predict_murmur_severity(
                    audio, 
                    buffer.sample_rate
                )
                
                if severity_result:
                    await self.supabase.create_murmur_severity(
                        org_id=buffer.org_id,
                        session_id=session_id,
                        model_version=severity_result['model_version'],
                        preprocessing_version=severity_result['preprocessing_version'],
                        severity_data=severity_result
                    )
            
            # Audit log
            await self.supabase.create_audit_log(
                org_id=buffer.org_id,
                user_id=None,
                action='pcg_inference_completed',
                entity_type='session',
                entity_id=session_id,
                metadata={
                    'result': pcg_result['label'],
                    'demo_mode': pcg_result['demo_mode']
                }
            )
            
            logger.info(f"PCG inference completed for session {session_id}")
            
        except Exception as e:
            logger.error(f"Error processing PCG: {e}")
            await self.supabase.update_session_status(session_id, 'error')
            await self.supabase.create_audit_log(
                org_id=buffer.org_id,
                user_id=None,
                action='pcg_inference_failed',
                entity_type='session',
                entity_id=session_id,
                metadata={'error': str(e)}
            )
        finally:
            # Clean up buffer
            del self.buffers[buffer_key]
    
    async def _handle_end_ecg(self, session_id: str):
        """Handle end_ecg message - finalize and run inference."""
        buffer_key = f"{session_id}_ecg"
        
        if buffer_key not in self.buffers:
            logger.warning(f"No ECG buffer for session {session_id}")
            return
        
        buffer = self.buffers[buffer_key]
        buffer.ended = True
        
        try:
            # Update status
            await self.supabase.update_session_status(session_id, 'processing')
            
            # Reconstruct signal
            ecg = buffer.reconstruct_signal()
            
            # Upload to storage
            storage_path = f"{buffer.org_id}/{session_id}/ecg/recording.bin"
            ecg_bytes = (ecg * 32768).astype(np.int16).tobytes()
            checksum = SupabaseClient.compute_checksum(ecg_bytes)
            
            await self.supabase.upload_file(
                bucket='recordings',
                path=storage_path,
                data=ecg_bytes,
                content_type='application/octet-stream'
            )
            
            # Create recording entry
            await self.supabase.create_recording(
                org_id=buffer.org_id,
                session_id=session_id,
                modality='ecg',
                valve_position=None,
                sample_rate=buffer.sample_rate,
                duration=buffer.get_duration(),
                storage_path=storage_path,
                checksum=checksum
            )
            
            # Run ECG inference
            ecg_result = self.inference_engine.predict_ecg(ecg, buffer.sample_rate)
            
            # Store ECG prediction
            await self.supabase.create_prediction(
                org_id=buffer.org_id,
                session_id=session_id,
                modality='ecg',
                model_name=ecg_result['model_name'],
                model_version=ecg_result['model_version'],
                preprocessing_version=ecg_result['preprocessing_version'],
                output_json=ecg_result,
                latency_ms=ecg_result['latency_ms']
            )
            
            # Audit log
            await self.supabase.create_audit_log(
                org_id=buffer.org_id,
                user_id=None,
                action='ecg_inference_completed',
                entity_type='session',
                entity_id=session_id,
                metadata={
                    'result': ecg_result['prediction'],
                    'demo_mode': ecg_result['demo_mode']
                }
            )
            
            logger.info(f"ECG inference completed for session {session_id}")
            
            # Check if this was the last modality, mark session done
            pcg_buffer_key = f"{session_id}_pcg"
            if pcg_buffer_key not in self.buffers:
                # PCG already done or not in session
                await self.supabase.update_session_status(
                    session_id, 
                    'done',
                    ended_at=datetime.utcnow().isoformat()
                )
            
        except Exception as e:
            logger.error(f"Error processing ECG: {e}")
            await self.supabase.update_session_status(session_id, 'error')
            await self.supabase.create_audit_log(
                org_id=buffer.org_id,
                user_id=None,
                action='ecg_inference_failed',
                entity_type='session',
                entity_id=session_id,
                metadata={'error': str(e)}
            )
        finally:
            # Clean up buffer
            del self.buffers[buffer_key]
    
    async def _force_end_session(self, session_id: str, modality: str):
        """Force end session when max duration exceeded."""
        if modality == 'pcg':
            await self._handle_end_pcg(session_id)
        else:
            await self._handle_end_ecg(session_id)
    
    async def _monitor_timeouts(self):
        """Monitor for stale buffers and timeout."""
        while self.running:
            try:
                await asyncio.sleep(5)  # Check every 5 seconds
                
                now = datetime.utcnow()
                timeout_delta = timedelta(seconds=self.timeout_sec)
                
                for buffer_key, buffer in list(self.buffers.items()):
                    if buffer.ended:
                        continue
                    
                    # Check if last chunk was too long ago
                    time_since_last = now - buffer.last_chunk_at
                    
                    if time_since_last > timeout_delta:
                        logger.warning(
                            f"Session {buffer.session_id} ({buffer.modality}) timed out "
                            f"after {time_since_last.total_seconds()}s"
                        )
                        
                        # Mark as error
                        await self.supabase.update_session_status(
                            buffer.session_id, 
                            'error'
                        )
                        
                        await self.supabase.create_audit_log(
                            org_id=buffer.org_id,
                            user_id=None,
                            action='session_timeout',
                            entity_type='session',
                            entity_id=buffer.session_id,
                            metadata={
                                'modality': buffer.modality,
                                'timeout_sec': self.timeout_sec,
                                'last_chunk_sec_ago': time_since_last.total_seconds()
                            }
                        )
                        
                        # Clean up
                        del self.buffers[buffer_key]
                        
            except Exception as e:
                logger.error(f"Error in timeout monitor: {e}")
    
    async def _publish_live_metrics(self):
        """Publish live metrics for active buffers."""
        while self.running:
            try:
                interval = 1.0 / self.metrics_update_hz
                await asyncio.sleep(interval)
                
                for buffer_key, buffer in self.buffers.items():
                    if buffer.ended:
                        continue
                    
                    # Compute metrics
                    metrics = {
                        'buffer_fill': {
                            f'{buffer.modality}_seconds': buffer.get_duration(),
                            f'{buffer.modality}_samples': buffer.total_samples
                        },
                        'quality': buffer.get_quality_metrics(),
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    
                    # Publish to DB (or broadcast via Realtime)
                    await self.supabase.create_live_metrics(
                        org_id=buffer.org_id,
                        session_id=buffer.session_id,
                        metrics=metrics
                    )
                    
            except Exception as e:
                logger.error(f"Error publishing live metrics: {e}")
