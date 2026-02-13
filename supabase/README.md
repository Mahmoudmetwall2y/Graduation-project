# Supabase Setup Guide

This directory contains all Supabase-related configuration for AscultiCor.

## Quick Setup

### Option 1: Use Existing Supabase Project (Recommended)

1. **Create a Supabase project** at https://app.supabase.com
   - Choose a project name (e.g., "AscultiCor")
   - Select a region close to you
   - Wait for project to provision (~2 minutes)

2. **Get your credentials**:
   - Go to Project Settings > API
   - Copy:
     - Project URL (`SUPABASE_URL`)
     - `anon` public key (`SUPABASE_ANON_KEY`)
     - `service_role` secret key (`SUPABASE_SERVICE_ROLE_KEY`)
   - Add these to your `.env` file

3. **Run migrations**:
   ```bash
   # Install Supabase CLI
   npm install -g supabase

   # Link to your project
   supabase link --project-ref YOUR_PROJECT_REF

   # Push migrations
   supabase db push
   ```

   Or manually via SQL Editor:
   ```bash
   # Copy content of migrations/001_initial_schema.sql
   # Paste into Supabase Dashboard > SQL Editor > New Query
   # Click RUN
   ```

4. **Create users** (via Dashboard):
   - Go to Authentication > Users > Add User
   - Admin: `admin@cardiosense.local` / `cardiosense123`
   - Operator: `operator@cardiosense.local` / `cardiosense123`
   - Note their UUIDs

5. **Update and run seed script**:
   ```bash
   # Edit seed.sql and replace UUIDs with actual user IDs
   # Then run via SQL Editor or:
   psql "$DATABASE_URL" -f seed.sql
   ```

6. **Enable Realtime** (via Dashboard):
   - Go to Database > Replication
   - Enable for these tables:
     - ✅ sessions
     - ✅ predictions
     - ✅ murmur_severity
     - ✅ live_metrics
     - ✅ devices

7. **Create Storage bucket** (via Dashboard):
   - Go to Storage > New Bucket
   - Name: `recordings`
   - Privacy: Private
   - Max file size: 50 MB
   - Allowed MIME types: `audio/*`, `application/octet-stream`

8. **Add Storage policies**:
   Go to Storage > recordings > Policies:

   ```sql
   -- SELECT: Users can view files in their org
   CREATE POLICY "Users can view recordings in their org"
   ON storage.objects FOR SELECT
   TO authenticated
   USING (
     bucket_id = 'recordings' AND
     (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
   );

   -- INSERT: Service role only
   CREATE POLICY "Service role can upload recordings"
   ON storage.objects FOR INSERT
   TO service_role
   WITH CHECK (bucket_id = 'recordings');

   -- DELETE: Admins only
   CREATE POLICY "Admins can delete recordings"
   ON storage.objects FOR DELETE
   TO authenticated
   USING (
     bucket_id = 'recordings' AND
     (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid()) AND
     (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
   );
   ```

### Option 2: Local Supabase (Advanced)

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize in project
supabase init

# Start local services
supabase start

# Migrations are auto-applied
# Seeds need manual run via:
supabase db reset
```

## Database Schema Overview

### Core Tables

- **organizations**: Multi-tenant root
- **profiles**: User profiles with roles (operator/admin)
- **devices**: Registered ESP32 devices
- **sessions**: Recording sessions with status tracking
- **recordings**: Raw signal storage metadata
- **predictions**: ML inference results
- **murmur_severity**: Detailed murmur analysis
- **live_metrics**: Real-time quality metrics
- **audit_logs**: Security audit trail

### RLS Policies

All tables enforce strict organization-level isolation:
- Users can only access data in their org
- Operators can manage their own devices
- Admins can manage all devices in their org
- Service role can write predictions/recordings

## Edge Functions

Edge Functions are located in `functions/` directory.

### Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy device-auth
supabase functions deploy signed-upload-url
supabase functions deploy signed-download-url

# Set environment variables
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx
```

### device-auth Function

```bash
# Test locally
curl -X POST http://localhost:54321/functions/v1/device-auth \
  -H "Content-Type: application/json" \
  -d '{"device_id": "xxx", "device_secret": "demo_secret_2024"}'
```

## Verification

After setup, verify everything works:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';

-- Check organization
SELECT * FROM organizations;

-- Check users
SELECT p.id, p.full_name, p.role, o.name as org_name 
FROM profiles p 
JOIN organizations o ON p.org_id = o.id;

-- Check devices
SELECT d.device_name, p.full_name as owner, d.last_seen_at
FROM devices d
JOIN profiles p ON d.owner_user_id = p.id;
```

## Troubleshooting

### Migrations fail
- Check PostgreSQL version (need 14+)
- Verify uuid-ossp extension is available
- Check for syntax errors in SQL

### RLS policies blocking requests
- Verify user is authenticated
- Check user's org_id matches data org_id
- Test with service_role key (bypasses RLS)

### Realtime not working
- Ensure tables are enabled in Replication settings
- Check WebSocket connection in browser console
- Verify anon key has correct permissions

### Storage uploads fail
- Check bucket exists and is private
- Verify storage policies are created
- Test with signed URL generation

## Production Checklist

Before deploying to production:

- [ ] Change default passwords
- [ ] Rotate service_role key
- [ ] Enable database backups
- [ ] Set up monitoring/alerts
- [ ] Review and tighten RLS policies
- [ ] Enable rate limiting
- [ ] Configure CORS properly
- [ ] Set up custom domain
- [ ] Enable WAF if available
- [ ] Document recovery procedures
