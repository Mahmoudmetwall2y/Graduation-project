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

    def check_connectivity(self) -> Dict[str, bool]:
        """Lightweight dependency check used by the health endpoint."""
        database_ok = False
        storage_ok = False

        try:
            self.client.table("organizations").select("id").limit(1).execute()
            database_ok = True
        except Exception as e:
            logger.error(f"Supabase database connectivity check failed: {e}")

        try:
            self.storage.list_buckets()
            storage_ok = True
        except Exception as e:
            logger.error(f"Supabase storage connectivity check failed: {e}")

        return {
            "database": database_ok,
            "storage": storage_ok,
            "ok": database_ok and storage_ok,
        }
    
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
            
            (
                self.client.table("sessions")
                .update(update_data)
                .eq("id", session_id)
                .execute()
            )

            refreshed = self.get_session(session_id)
            if refreshed and refreshed.get("status") == status:
                logger.info(f"Session {session_id} status updated to {status}")
                return True

            logger.warning(f"Session {session_id} was not found when updating status to {status}")
            return False
        except Exception as e:
            logger.error(f"Error updating session status: {e}")
            return False

    def conditional_update_session_status(
        self,
        session_id: str,
        expected_status: str,
        new_status: str,
        ended_at: Optional[str] = None
    ) -> bool:
        """Atomically update session status only if current status matches expected_status.
        
        This prevents race conditions where multiple handlers try to transition
        the same session simultaneously. Returns True if the update was applied.
        """
        try:
            update_data = {"status": new_status}
            if ended_at:
                update_data["ended_at"] = ended_at

            (
                self.client.table("sessions")
                .update(update_data)
                .eq("id", session_id)
                .eq("status", expected_status)  # Only update if status matches
                .execute()
            )
            
            refreshed = self.get_session(session_id)
            if refreshed and refreshed.get("status") == new_status:
                logger.info(
                    f"Session {session_id} status: {expected_status} → {new_status}"
                )
                return True
            logger.debug(
                f"Session {session_id} status was not '{expected_status}', "
                f"skipping transition to '{new_status}'"
            )
            return False
        except Exception as e:
            logger.error(f"Error in conditional status update: {e}")
            return False
    
    def get_stale_sessions(self, max_duration_minutes: int) -> List[Dict[str, Any]]:
        """Get sessions that have been in streaming/processing state for too long."""
        try:
            from datetime import timedelta
            cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=max_duration_minutes)
            
            response = self.client.table("sessions").select("id, org_id, status, created_at").in_(
                "status", ["streaming", "processing"]
            ).lt("created_at", cutoff_time.isoformat()).execute()
            
            return response.data or []
        except Exception as e:
            logger.error(f"Error getting stale sessions: {e}")
            return []

    def ensure_session_exists(self, session_id: str, org_id: str, device_id: str) -> bool:
        """Create a session row for device-originated streams when the UI did not pre-create one."""
        try:
            existing_response = (
                self.client.table("sessions")
                .select("id, org_id, device_id")
                .eq("id", session_id)
                .limit(1)
                .execute()
            )
            existing = existing_response.data[0] if existing_response.data else None

            if existing:
                if existing["device_id"] != device_id or existing["org_id"] != org_id:
                    logger.error(
                        f"Session {session_id} already exists with mismatched ownership "
                        f"(device={existing['device_id']}, org={existing['org_id']})"
                    )
                    return False
                return True

            device_response = (
                self.client.table("devices")
                .select("id, org_id, owner_user_id")
                .eq("id", device_id)
                .limit(1)
                .execute()
            )
            device = device_response.data[0] if device_response.data else None
            if not device:
                logger.error(f"Cannot auto-create session {session_id}: device {device_id} not found")
                return False

            device_org_id = device.get("org_id")
            owner_user_id = device.get("owner_user_id")
            if not owner_user_id:
                logger.error(
                    f"Cannot auto-create session {session_id}: device {device_id} has no owner_user_id"
                )
                return False

            if device_org_id != org_id:
                logger.warning(
                    f"Topic org_id {org_id} did not match device org_id {device_org_id}; "
                    "using the database org_id"
                )

            self.client.table("sessions").insert({
                "id": session_id,
                "org_id": device_org_id,
                "device_id": device_id,
                "created_by": owner_user_id,
                "status": "created",
                "notes": "Auto-created from device stream",
            }).execute()

            logger.info(f"Auto-created session {session_id} for device {device_id}")
            return True
        except Exception as e:
            logger.error(f"Error ensuring session exists: {e}")
            return False
    
    # ========== DEVICE OPERATIONS ==========
    
    def update_device_last_seen(self, device_id: str) -> bool:
        """Update device last_seen_at timestamp."""
        return self.update_device_status(
            device_id,
            {
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
                "status": "online",
            }
        )

    def update_device_status(self, device_id: str, updates: Dict[str, Any]) -> bool:
        """Update device runtime metadata from heartbeat/status messages."""
        allowed_fields = {
            "status",
            "last_seen_at",
            "signal_strength",
            "firmware_version",
            "ip_address",
            "battery_level",
        }
        payload = {
            key: value for key, value in updates.items()
            if key in allowed_fields and value is not None
        }

        if not payload:
            return True

        payload["updated_at"] = datetime.now(timezone.utc).isoformat()

        try:
            self.client.table("devices").update(payload).eq("id", device_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error updating device status: {e}")
            return False

    def create_device_telemetry(
        self,
        device_id: str,
        org_id: str,
        telemetry: Dict[str, Any]
    ) -> bool:
        """Persist device heartbeat/status data for dashboards and alerting."""
        try:
            self.client.table("device_telemetry").insert({
                "device_id": device_id,
                "org_id": org_id,
                "temperature_celsius": telemetry.get("temperature_celsius"),
                "uptime_seconds": telemetry.get("uptime_seconds"),
                "free_heap_bytes": telemetry.get("free_heap_bytes"),
                "wifi_rssi": telemetry.get("wifi_rssi"),
                "battery_voltage": telemetry.get("battery_voltage"),
                "error_count": telemetry.get("error_count", 0),
                "telemetry_json": telemetry.get("telemetry_json", {}),
                "recorded_at": telemetry.get("recorded_at") or datetime.now(timezone.utc).isoformat(),
            }).execute()
            return True
        except Exception as e:
            logger.error(f"Error creating device telemetry: {e}")
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
        """Create murmur severity entry.
        
        The severity CNN outputs keys like systolic_timing, systolic_shape, etc.
        Map them to the DB columns (location_json, timing_json, shape_json, etc.).
        Missing keys are stored as empty dicts.
        """
        try:
            response = self.client.table("murmur_severity").insert({
                "org_id": org_id,
                "session_id": session_id,
                "model_version": model_version,
                "preprocessing_version": preprocessing_version,
                "location_json": severity_data.get('murmur_locations', severity_data.get('location', {})),
                "timing_json": severity_data.get('systolic_timing', severity_data.get('timing', {})),
                "shape_json": severity_data.get('systolic_shape', severity_data.get('shape', {})),
                "grading_json": severity_data.get('systolic_grading', severity_data.get('grading', {})),
                "pitch_json": severity_data.get('systolic_pitch', severity_data.get('pitch', {})),
                "quality_json": severity_data.get('systolic_quality', severity_data.get('quality', {}))
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
