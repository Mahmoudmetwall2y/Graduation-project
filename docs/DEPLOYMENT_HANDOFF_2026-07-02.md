# AscultiCor Deployment Handoff

This document records the deployment state as of 2026-07-02. It intentionally
contains no passwords, API keys, private keys, or tokens.

## Production

- Hetzner public IPv4: `94.130.24.242`
- Tailscale IPv4: `100.98.95.38`
- Server: Ubuntu 22.04, 4 vCPU, 8 GB RAM, 75 GB root disk, 4 GB swap
- Application directory: `/opt/asculticor`
- Production Git branch: `main`
- Public entrypoint: NGINX on ports 80/443
- Internal services bind to loopback or the Docker network

Running services:

- Next.js frontend
- FastAPI inference
- Mosquitto
- NGINX
- n8n
- firmware builder/flasher

## GitHub Deployment

- Repository: `Mahmoudmetwall2y/Graduation-project`
- CI runs frontend, inference, security, and migration checks
- Production deployment runs only after successful CI on `main`
- GitHub Actions joins Tailscale as ephemeral `tag:ci`
- Deployment reaches the server privately over Tailscale SSH
- Server command: `/usr/local/sbin/asculticor-deploy`
- GitHub environment: `production`
- Repository variable: `PRODUCTION_DEPLOY_ENABLED=true`

## Backups

- Hetzner Object Storage bucket: `asculticor-production-backups`
- Backups are encrypted client-side with restic
- Nightly systemd timer: `asculticor-backup.timer`
- Local retention: 14 days
- Restic retention: 14 daily, 8 weekly, 12 monthly
- Upload, full integrity check, and restore test passed

## Supabase

- Project reference used by production: `rwuidbxtvtomiebyrupa`
- Admin profile was confirmed as `role='admin'`
- Recursive profile-role RLS was repaired by:
  `supabase/migrations/20260701235138_fix_profile_role_rls.sql`
- The migration was applied manually through Supabase SQL Editor

## n8n

- Internal endpoint: `http://127.0.0.1:5678`
- Secure temporary access uses an SSH tunnel to local port 5678
- n8n can reach `frontend:3000`, `inference:8000`, and `mosquitto:1883`
- No workflows were imported at the last check
- Import templates from `n8n/workflows/`, test manually, then activate
- Future public URL: `https://n8n.mahmoudmetwall2y.online`

## DNS and HTTPS

- Domain: `mahmoudmetwall2y.online`
- Intended root and subdomain records point to `94.130.24.242`
- Nameservers were changed from Vercel to Hostinger and were still propagating
- Current IP-based HTTPS certificate is self-signed
- Install trusted certificates after public DNS resolves to Hetzner

## ML Status

- PCG XGBoost model loads successfully
- Murmur severity CNN loads successfully
- ECG model does not load because its Keras artifact embeds an unserializable
  `ecg_forecast_loss` function; the AI team is preparing a clean export
- Production scikit-learn is pinned to 1.8.0 to match the PCG scaler artifact

## Secure Files to Transfer to the New Windows Installation

Transfer these using encrypted removable storage or a password manager. Never
commit them to Git or send them through chat:

- `C:\Users\Admin\.ssh\asculticor_hetzner_ed25519`
- `C:\Users\Admin\.ssh\asculticor_hetzner_ed25519.pub`
- `C:\Users\Admin\.ssh\asculticor_restic_password`
- `C:\Users\Admin\.ssh\known_hosts`
- `hetzner-AscultiCor\terraform\terraform.tfvars`
- `hetzner-AscultiCor\terraform\terraform.tfstate`
- `hetzner-AscultiCor\terraform\terraform.tfstate.backup`
- the project root `.env` if it is still needed locally

Also reinstall and authenticate:

- Git
- GitHub CLI (`gh auth login`)
- Terraform
- Tailscale, using the same tailnet account
- Docker Desktop if local Compose development is required

## Immediate Remaining Tasks

1. Verify Hostinger DNS propagation.
2. Install trusted TLS for the application and n8n domains.
3. Update Supabase Site URL and exact redirect URLs to the final HTTPS domain.
4. Import and test n8n workflows and email credentials.
5. Replace and validate the corrected ECG model artifact.
6. Rotate any password that was shared in chat.
