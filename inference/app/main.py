"""
FastAPI application for AscultiCor inference service.
Health checks, config endpoint, and MQTT lifecycle management.
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional
import sys

# Configure logging with structured format
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"inference","message":"%(message)s"}',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Import handlers
from .mqtt_handler import MQTTHandler
from .preprocessing import get_preprocessing_version
from .security import SecurityHeadersMiddleware, rate_limit

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
    description="""
    Real-time ML inference for PCG (Phonocardiogram) and ECG (Electrocardiogram) signals.
    
    ## Features
    
    * **Real-time inference** on cardiac signals via MQTT
    * **Health monitoring** with service status and connection state
    * **Configuration management** for signal processing parameters
    * **Session metrics** for active monitoring sessions
    
    ## Security
    
    * Rate limiting: 60 requests/minute (general), 5 requests/minute (auth)
    * CORS protection with configurable origins
    * Security headers (when enabled via SECURITY_HEADERS_ENABLED=true)
    * Input validation on all endpoints
    
    ## Authentication
    
    This service does not require authentication for internal health/metrics endpoints.
    MQTT authentication is handled via device credentials.
    """,
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENABLE_DOCS", "true").lower() == "true" else None,
    redoc_url="/redoc" if os.getenv("ENABLE_DOCS", "true").lower() == "true" else None,
    lifespan=lifespan
)

# F11 fix: Security headers default to enabled (opt-out for local dev only)
if os.getenv("SECURITY_HEADERS_ENABLED", "true").lower() == "true":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*.asculticor.com", "localhost", "127.0.0.1"]
    )
    app.add_middleware(SecurityHeadersMiddleware)
    logger.info("Security headers middleware enabled")

# CORS middleware
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],  # Restrict to necessary methods only
    allow_headers=["Content-Type", "Authorization", "x-internal-token", "x-client-info", "apikey"],  # F12 fix: explicit list
    max_age=600,  # Cache preflight requests for 10 minutes
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


def require_internal_token(request: Request):
    """Protect internal operational endpoints with a shared token."""
    configured = os.getenv("INFERENCE_INTERNAL_TOKEN")
    if not configured:
        raise HTTPException(
            status_code=500,
            detail="INFERENCE_INTERNAL_TOKEN is not configured"
        )

    provided = request.headers.get("x-internal-token")
    if provided != configured:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "AscultiCor Inference Service",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health", response_model=HealthResponse)
@rate_limit(limit_type="general")
async def health_check(request: Request):
    """
    Health check endpoint.
    Returns service status and MQTT connection state.
    Rate limited: 60 requests per minute per IP.
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
@rate_limit(limit_type="general")
async def get_config(request: Request):
    """
    Get current configuration.
    Returns preprocessing settings and limits.
    Rate limited: 60 requests per minute per IP.
    """
    require_internal_token(request)

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
@rate_limit(limit_type="general")
async def get_metrics(request: Request):
    """
    Get current service metrics.
    Returns active sessions and buffer stats.
    Rate limited: 60 requests per minute per IP.
    """
    require_internal_token(request)

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
