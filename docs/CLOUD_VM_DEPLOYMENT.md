# AscultiCor Cloud VM Deployment

This is the least disruptive cloud move for the current codebase:

- one Linux VM
- Docker Compose
- managed Supabase
- NGINX as the only public entrypoint
- `frontend`, `inference`, `mosquitto`, and optional `n8n` on the same Docker network

It matches the current architecture, so the application code needs only small configuration changes.

## What Changed In The Repo

- `docker-compose.yml` is now parameterized for bind addresses, ports, server name, and TLS paths.
- `docker-compose.cloud.yml` adds the cloud-only pieces:
  - real certificate mount for NGINX
  - optional `n8n` service
- `nginx/default.conf.template` now renders at container start from environment variables.
- `inference/app/main.py` now reads `ALLOWED_ORIGINS` and `TRUSTED_HOSTS` from environment safely.
- `.env.cloud.example` provides a staging-ready environment template.

## Recommended Architecture

Public:

- `https://app.example.com` -> NGINX -> frontend
- `https://n8n.example.com` -> NGINX -> n8n

Private/internal only:

- `frontend:3000`
- `inference:8000`
- `mosquitto:1883`
- `n8n:5678` unless you intentionally expose it

## 1. Provision The VM

Recommended baseline:

- Ubuntu 22.04 or Debian 12
- 4 vCPU
- 8 GB RAM
- 60+ GB SSD

Open these firewall ports:

- `80/tcp`
- `443/tcp`

Keep these closed to the public internet unless you have a deliberate security design:

- `1883`
- `9001`
- `3000`
- `8000`
- `5678`

## 2. Point DNS To The VM

Create an `A` record:

- `app.example.com` -> your VM public IP
- `n8n.example.com` -> your VM public IP

## 3. Prepare Environment Variables

Copy the cloud template:

```bash
cp .env.cloud.example .env
```

Edit `.env` and set at minimum:

- `APP_DOMAIN`
- `N8N_DOMAIN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `MQTT_DEVICE_PASSWORD_PEPPER`
- `INTERNAL_API_TOKEN`
- `INFERENCE_INTERNAL_TOKEN`
- `NGINX_SERVER_NAME`
- `NGINX_N8N_SERVER_NAME`
- `ALLOWED_ORIGINS`
- `TRUSTED_HOSTS`
- `CORS_ORIGIN`
- `N8N_USER`
- `N8N_PASSWORD`
- `N8N_ENCRYPTION_KEY`

Important defaults in the template:

- `FRONTEND_BIND_ADDRESS=127.0.0.1`
- `INFERENCE_BIND_ADDRESS=127.0.0.1`
- `MQTT_BIND_ADDRESS=127.0.0.1`

That means only NGINX is public by default.

## 4. Add Real TLS Certificates

Put your certificate files in [nginx/certs](/d:/cardiosense-project/cardiosense/nginx/certs/.gitkeep):

- `fullchain.pem`
- `privkey.pem`

The cloud template expects:

- `NGINX_SSL_CERT_PATH=/etc/nginx/certs/fullchain.pem`
- `NGINX_SSL_KEY_PATH=/etc/nginx/certs/privkey.pem`

It also supports a separate n8n certificate if you need one:

- `NGINX_N8N_SSL_CERT_PATH`
- `NGINX_N8N_SSL_KEY_PATH`

## 5. Configure Supabase For The Cloud Domain

In Supabase Auth settings, add your real domain:

- Site URL: `https://app.example.com`
- Redirect URL: `https://app.example.com/auth/callback`

Also make sure edge functions use:

- `CORS_ORIGIN=https://app.example.com`

## 6. Deploy The Stack

For the application only:

```bash
docker compose --env-file .env -f docker-compose.yml up -d --build
```

For the application plus `n8n`:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml up -d --build
```

## 7. Verify The Deployment

Check rendered Compose config:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml config > /dev/null
```

Check containers:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml ps
```

Check health endpoints from the VM:

```bash
curl -f https://app.example.com/
curl -f http://127.0.0.1:3000/api/health
curl -f http://127.0.0.1:8000/health
curl -f https://n8n.example.com/
```

Check internal protected inference endpoints:

```bash
curl -f http://127.0.0.1:8000/config -H "x-internal-token: $INFERENCE_INTERNAL_TOKEN"
curl -f http://127.0.0.1:8000/metrics -H "x-internal-token: $INFERENCE_INTERNAL_TOKEN"
```

## 8. Device Provisioning In Cloud

For cloud-connected devices, use bootstrap provisioning instead of hardcoded broker IPs.

On the ESP32:

```text
SET device_id <device id>
SET device_secret <device secret>
SET bootstrap_url https://app.example.com/api/device/bootstrap
SET wifi_ssid <wifi>
SET wifi_pass <password>
REBOOT
```

The firmware already supports HTTPS bootstrap and CA pinning in [AscultiCor_esp32.ino](/d:/cardiosense-project/cardiosense/firmware/asculticor_esp32/AscultiCor_esp32.ino:441).

## 9. Important Boundary

This deployment is ready for:

- remote dashboard access
- remote teammate access
- n8n integration on the same VM
- internal service-to-service communication

This deployment is **not** a hardened internet-facing MQTT production design yet.

If you want remote ESP32 devices to talk directly to the VM over the public internet, you should add one of these before opening the broker broadly:

- MQTT over TLS
- VPN/Tailscale
- private network tunnel
- managed IoT broker

Until then, leave:

- `MQTT_BIND_ADDRESS=127.0.0.1`
- `MQTT_WS_BIND_ADDRESS=127.0.0.1`

## 10. n8n Access Pattern

The cloud profile now assumes the recommended n8n shape:

- app on `app.example.com`
- n8n on `n8n.example.com`

This follows current n8n guidance more closely than putting n8n on a subpath behind a reverse proxy.

Inside the Docker network, `n8n` can already reach:

- `http://frontend:3000`
- `http://inference:8000`
- `mosquitto:1883`

## 11. Recommended Next Step

After the VM is live, the first workflow to activate is the LLM queue replacement:

- keep report queue insertion in the frontend
- run `n8n` on the same VM
- let `n8n` poll `llm_reports`
- replace the current GitHub cron path
