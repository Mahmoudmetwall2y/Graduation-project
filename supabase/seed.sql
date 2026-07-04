-- AscultiCor Seed Data
-- Creates demo organization, users, and devices for testing

-- ============================================================
-- 1. CREATE ORGANIZATION
-- ============================================================

INSERT INTO organizations (id, name, created_at)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'AscultiCor Demo Org',
    NOW()
);

-- ============================================================
-- 2. CREATE USER PROFILE
-- ============================================================

-- User created in Supabase Auth (create this user manually in Supabase Auth dashboard):
-- ID: 4d4187e3-c290-4ea0-9edd-87f1a0d901fa
-- Email: admin@asculticor.local
-- Password: set your own strong password in Supabase Auth dashboard
-- NOTE: Replace with your own dashboard-created user before running in shared environments

INSERT INTO profiles (id, org_id, full_name, role, created_at)
VALUES (
    '4d4187e3-c290-4ea0-9edd-87f1a0d901fa'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Admin User',
    'admin',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. CREATE DEVICE
-- ============================================================

-- Device secret: see project README for demo credentials. DO NOT commit real secrets in comments.
INSERT INTO devices (id, org_id, owner_user_id, device_name, device_secret_hash, created_at)
VALUES (
    '00000000-0000-0000-0000-000000000004'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '4d4187e3-c290-4ea0-9edd-87f1a0d901fa'::uuid,
    'demo-device-001',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5eoKZB8Z8qB3i',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. INSERT AUDIT LOG
-- ============================================================

INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, metadata, created_at)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    'seed_data_created',
    'organization',
    '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object(
        'users_created', 1,
        'devices_created', 1,
        'seed_version', '1.0.0'
    ),
    NOW()
);

-- ============================================================
-- VERIFICATION QUERIES (uncomment to run)
-- ============================================================

-- Check organization
-- SELECT * FROM organizations;

-- Check profile
-- SELECT p.id, p.full_name, p.role, o.name as org_name 
-- FROM profiles p 
-- JOIN organizations o ON p.org_id = o.id;

-- Check devices
-- SELECT d.device_name, d.last_seen_at, p.full_name as owner
-- FROM devices d
-- JOIN profiles p ON d.owner_user_id = p.id;
