-- AscultiCor Database Migration
-- Migration: 019_add_composite_indexes
-- Description: Add composite indexes for common query patterns
-- Created: 2026-02-25

-- Add composite index for sessions: org + status filtering (common in dashboard)
CREATE INDEX IF NOT EXISTS idx_sessions_org_status_created 
ON sessions(org_id, status, created_at DESC);

-- Add composite index for devices: org + online status + last_seen
CREATE INDEX IF NOT EXISTS idx_devices_org_status_lastseen 
ON devices(org_id, last_seen_at DESC);

-- Add composite index for predictions: session + modality + created (common in session detail)
CREATE INDEX IF NOT EXISTS idx_predictions_session_modality 
ON predictions(session_id, modality, created_at DESC);

-- Add composite index for live_metrics: session + recent (real-time queries)
CREATE INDEX IF NOT EXISTS idx_live_metrics_session_recent 
ON live_metrics(session_id, created_at DESC);

-- Add composite index for audit_logs: org + user + recent (admin queries)
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_user_recent 
ON audit_logs(org_id, user_id, created_at DESC);

-- Verify indexes were created
DO $
BEGIN
    RAISE NOTICE 'Composite indexes created successfully';
END $;

-- Add comment for documentation
COMMENT ON INDEX idx_sessions_org_status_created 
IS 'Optimizes dashboard session queries filtering by organization and status';
COMMENT ON INDEX idx_devices_org_status_lastseen 
IS 'Optimizes device status queries with organization context';
COMMENT ON INDEX idx_predictions_session_modality 
IS 'Optimizes session detail prediction queries';
COMMENT ON INDEX idx_live_metrics_session_recent 
IS 'Optimizes real-time metric queries during active sessions';
COMMENT ON INDEX idx_audit_logs_org_user_recent 
IS 'Optimizes admin audit log queries';
