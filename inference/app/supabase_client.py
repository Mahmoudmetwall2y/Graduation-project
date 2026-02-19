"""
Supabase client wrapper for database operations and storage.
All methods are synchronous since the supabase-py client is synchronous.
"""

import os
from typing import Dict, Any, Optional, List
import logging
from datetime import datetime, timezone
from supabase import create_client, Client
import hashlib
import json

logger = logging.getLogger(__name__)


class SupabaseClient:
    """Wrapper for Supabase operations."""
    
    def __init__(self):
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        
        self.client: Client = create_client(url, key)
        self.storage = self.client.storage
        logger.info("Supabase client initialized")
    
    # ========== SESSION OPERATIONS ==========
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session by ID."""
        try:
            response = self.client.table("sessions").select("*").eq("id", session_id).single().execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting session {session_id}: {e}")
            return None
    
    def update_session_status(
        self, 
        session_id: str, 
        status: str,
        ended_at: Optional[str] = None
    ) -> bool:
        """Update session status."""
        try:
            update_data = {"status": status}
            if ended_at:
                update_data["ended_at"] = ended_at
            
            self.client.table("sessions").update(update_data).eq("id", session_id).execute()
            logger.info(f"Session {session_id} status updated to {status}")
            return True
        except Exception as e:
            logger.error(f"Error updating session status: {e}")
            return False
    
    # ========== DEVICE OPERATIONS ==========
    
    def update_device_last_seen(self, device_id: str) -> bool:
        """Update device last_seen_at timestamp."""
        try:
            self.client.table("devices").update({
                "last_seen_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", device_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error updating device last_seen: {e}")
            return False
    
    # ========== RECORDING OPERATIONS ==========
    
    def create_recording(
        self,
        org_id: str,
        session_id: str,
        modality: str,
        valve_position: Optional[str],
        sample_rate: int,
        duration: float,
        storage_path: str,
        checksum: str
    ) -> Optional[str]:
        """Create recording entry."""
        try:
            response = self.client.table("recordings").insert({
                "org_id": org_id,
                "session_id": session_id,
                "modality": modality,
                "valve_position": valve_position,
                "sample_rate_hz": sample_rate,
                "duration_sec": duration,
                "storage_path": storage_path,
                "checksum": checksum
            }).execute()
            
            recording_id = response.data[0]["id"]
            logger.info(f"Created recording {recording_id}")
            return recording_id
        except Exception as e:
            logger.error(f"Error creating recording: {e}")
            return None
    
    # ========== PREDICTION OPERATIONS ==========
    
    def create_prediction(
        self,
        org_id: str,
        session_id: str,
        modality: str,
        model_name: str,
        model_version: str,
        preprocessing_version: str,
        output_json: Dict[str, Any],
        latency_ms: int
    ) -> Optional[str]:
        """Create prediction entry."""
        try:
            response = self.client.table("predictions").insert({
                "org_id": org_id,
                "session_id": session_id,
                "modality": modality,
                "model_name": model_name,
                "model_version": model_version,
                "preprocessing_version": preprocessing_version,
                "output_json": output_json,
                "latency_ms": latency_ms
            }).execute()
            
            prediction_id = response.data[0]["id"]
            logger.info(f"Created prediction {prediction_id}")
            return prediction_id
        except Exception as e:
            logger.error(f"Error creating prediction: {e}")
            return None
    
    def create_murmur_severity(
        self,
        org_id: str,
        session_id: str,
        model_version: str,
        preprocessing_version: str,
        severity_data: Dict[str, Any]
    ) -> Optional[str]:
        """Create murmur severity entry."""
        try:
            response = self.client.table("murmur_severity").insert({
                "org_id": org_id,
                "session_id": session_id,
                "model_version": model_version,
                "preprocessing_version": preprocessing_version,
                "location_json": severity_data['location'],
                "timing_json": severity_data['timing'],
                "shape_json": severity_data['shape'],
                "grading_json": severity_data['grading'],
                "pitch_json": severity_data['pitch'],
                "quality_json": severity_data['quality']
            }).execute()
            
            severity_id = response.data[0]["id"]
            logger.info(f"Created murmur severity {severity_id}")
            return severity_id
        except Exception as e:
            logger.error(f"Error creating murmur severity: {e}")
            return None
    
    # ========== LIVE METRICS OPERATIONS ==========
    
    def create_live_metrics(
        self,
        org_id: str,
        session_id: str,
        metrics: Dict[str, Any]
    ) -> bool:
        """Create live metrics entry."""
        try:
            self.client.table("live_metrics").insert({
                "org_id": org_id,
                "session_id": session_id,
                "metrics_json": metrics
            }).execute()
            return True
        except Exception as e:
            logger.error(f"Error creating live metrics: {e}")
            return False
    
    # ========== STORAGE OPERATIONS ==========
    
    def upload_file(
        self,
        bucket: str,
        path: str,
        data: bytes,
        content_type: str = "application/octet-stream"
    ) -> bool:
        """Upload file to Supabase Storage."""
        try:
            self.storage.from_(bucket).upload(
                path,
                data,
                file_options={"content-type": content_type}
            )
            logger.info(f"Uploaded file to {bucket}/{path}")
            return True
        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            return False
    
    # ========== AUDIT LOG OPERATIONS ==========
    
    def create_audit_log(
        self,
        org_id: str,
        user_id: Optional[str],
        action: str,
        entity_type: str,
        entity_id: Optional[str],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Create audit log entry."""
        try:
            self.client.table("audit_logs").insert({
                "org_id": org_id,
                "user_id": user_id,
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "metadata": metadata or {}
            }).execute()
            return True
        except Exception as e:
            logger.error(f"Error creating audit log: {e}")
            return False
    
    # ========== UTILITY FUNCTIONS ==========
    
    @staticmethod
    def compute_checksum(data: bytes) -> str:
        """Compute SHA-256 checksum of data."""
        return hashlib.sha256(data).hexdigest()
