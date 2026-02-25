-- AscultiCor Database Migration
-- Migration: 018_fix_service_role_sessions_insert
-- Description: Add INSERT policy for service role on sessions table
--              This allows inference service to create sessions programmatically
-- Created: 2026-02-25

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add INSERT policy for service role on sessions
-- This enables the inference service to create sessions when devices start streaming
CREATE POLICY "Service role can insert sessions"
    ON sessions FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Verify the policy was created
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Service role can insert sessions' 
        AND tablename = 'sessions'
    ) THEN
        RAISE NOTICE 'Policy "Service role can insert sessions" created successfully on sessions table';
    ELSE
        RAISE WARNING 'Failed to create policy on sessions table';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON POLICY "Service role can insert sessions" ON sessions 
IS 'Allows inference service to create sessions when devices initiate streaming';
