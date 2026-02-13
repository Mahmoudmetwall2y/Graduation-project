"""
FastAPI application for AscultiCor inference service.
Health checks, config endpoint, and MQTT lifecycle management.
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Import handlers
from .mqtt_handler import MQTTHandler
from .preprocessing import get_preprocessing_version

# Global MQTT handler
mqtt_handler: Optional[MQTTHandler] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle management for FastAPI app."""
    global mqtt_handler
    
    # Startup
    logger.info("Starting AscultiCor Inference Service")
    
    try:
        mqtt_handler = MQTTHandler()
        mqtt_handler.start()
        logger.info("MQTT handler started successfully")
    except Exception as e:
        logger.error(f"Failed to start MQTT handler: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down AscultiCor Inference Service")
    if mqtt_handler:
        mqtt_handler.stop()


# Create FastAPI app
app = FastAPI(
    title="AscultiCor Inference Service",
    description="Real-time ML inference for PCG and ECG signals",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================================================
# MODELS
# ==========================================================================

class HealthResponse(BaseModel):
    status: str
    mqtt_connected: bool
    demo_mode: bool
    active_sessions: int


class ConfigResponse(BaseModel):
    preprocessing_version: str
    pcg_sample_rate: int
    pcg_target_duration: float
    pcg_max_duration: float
    ecg_sample_rate: int
    ecg_window_size: int
    ecg_max_duration: float
    stream_timeout_sec: int
    metrics_update_hz: float
    demo_mode: bool


# ==========================================================================
# ENDPOINTS
# ==========================================================================

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "AscultiCor Inference Service",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    Returns service status and MQTT connection state.
    """
    global mqtt_handler
    
    if not mqtt_handler:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    mqtt_connected = mqtt_handler.client.is_connected()
    active_sessions = len(mqtt_handler.buffers)
    demo_mode = mqtt_handler.inference_engine.demo_mode_active
    
    return HealthResponse(
        status="healthy" if mqtt_connected else "degraded",
        mqtt_connected=mqtt_connected,
        demo_mode=demo_mode,
        active_sessions=active_sessions
    )


@app.get("/config", response_model=ConfigResponse)
async def get_config():
    """
    Get current configuration.
    Returns preprocessing settings and limits.
    """
    global mqtt_handler
    
    if not mqtt_handler:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    return ConfigResponse(
        preprocessing_version=get_preprocessing_version(),
        pcg_sample_rate=int(os.getenv("PCG_SAMPLE_RATE", 22050)),
        pcg_target_duration=float(os.getenv("PCG_TARGET_DURATION", 10)),
        pcg_max_duration=float(os.getenv("PCG_MAX_DURATION", 15)),
        ecg_sample_rate=int(os.getenv("ECG_SAMPLE_RATE", 500)),
        ecg_window_size=int(os.getenv("ECG_WINDOW_SIZE", 500)),
        ecg_max_duration=float(os.getenv("ECG_MAX_DURATION", 60)),
        stream_timeout_sec=int(os.getenv("STREAM_TIMEOUT_SEC", 10)),
        metrics_update_hz=float(os.getenv("METRICS_UPDATE_HZ", 2)),
        demo_mode=os.getenv("ENABLE_DEMO_MODE", "true").lower() == "true"
    )


@app.get("/metrics")
async def get_metrics():
    """
    Get current service metrics.
    Returns active sessions and buffer stats.
    """
    global mqtt_handler
    
    if not mqtt_handler:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    buffer_stats = []
    for buffer_key, buffer in mqtt_handler.buffers.items():
        buffer_stats.append({
            "session_id": buffer.session_id,
            "modality": buffer.modality,
            "duration_sec": buffer.get_duration(),
            "total_samples": buffer.total_samples,
            "started_at": buffer.started_at.isoformat(),
            "last_chunk_at": buffer.last_chunk_at.isoformat()
        })
    
    return {
        "active_sessions": len(mqtt_handler.buffers),
        "buffers": buffer_stats,
        "mqtt_connected": mqtt_handler.client.is_connected()
    }


@app.post("/simulate")
async def simulate_inference():
    """
    Optional endpoint to test inference pipeline without MQTT.
    For debugging and testing.
    """
    global mqtt_handler
    
    if not mqtt_handler:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    # This could trigger a simulated data flow
    # For now, just return demo mode status
    
    return {
        "message": "Use the demo_publisher.py script for full simulation",
        "demo_mode": mqtt_handler.inference_engine.demo_mode_active
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info"
    )
