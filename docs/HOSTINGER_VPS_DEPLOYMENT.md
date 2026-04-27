# Hostinger VPS Deployment

This guide is the exact rollout path for a Hostinger VPS running:

- AscultiCor app on `app.example.com`
- n8n on `n8n.example.com`
- one Ubuntu VPS
- Docker Compose

It builds on the cloud files already in this repo:

- [docker-compose.yml](/d:/cardiosense-project/cardiosense/docker-compose.yml:1)
- [docker-compose.cloud.yml](/d:/cardiosense-project/cardiosense/docker-compose.cloud.yml:1)
- [.env.cloud.example](/d:/cardiosense-project/cardiosense/.env.cloud.example:1)

## 1. DNS

In your Hostinger DNS zone, create:

- `A` record: `app` -> VPS public IP
- `A` record: `n8n` -> VPS public IP

Wait until both resolve correctly:

```bash
nslookup app.example.com
nslookup n8n.example.com
```

If you do **not** have your own domain yet and only want to use the Hostinger VPS hostname, you can still deploy now:

- app on `https://srv1621744.hstgr.cloud`
- n8n either kept private on `127.0.0.1:5678`
- or exposed separately at `https://srv1621744.hstgr.cloud:8443`

That is the safest immediate path for your current VPS details.

## 2. Connect To The VPS

From your local machine:

```bash
ssh root@YOUR_VPS_IP
```

## 3. Install Docker And Basic Tools

Run on the VPS:

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg git ufw certbot
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker
```

## 4. Open The Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8443/tcp
ufw --force enable
ufw status
```

Do not open these publicly unless you have a deliberate reason:

- `1883`
- `9001`
- `3000`
- `8000`
- `5678`

## 5. Clone The Repo

```bash
cd /opt
git clone https://github.com/Mahmoudmetwall2y/Graduation-project.git asculticor
cd asculticor
```

If your cloud deployment changes are still on a branch, check out that branch:

```bash
git checkout 006-detailed-session-report
```

## 6. Create The Cloud Environment File

```bash
cp .env.cloud.example .env
nano .env
```

Fill in at minimum:

- `APP_DOMAIN=app.example.com`
- `N8N_DOMAIN=n8n.example.com`
- `DEVICE_BOOTSTRAP_PUBLIC_BASE_URL=https://app.example.com`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `MQTT_DEVICE_PASSWORD_PEPPER`
- `INTERNAL_API_TOKEN`
- `INFERENCE_INTERNAL_TOKEN`
- `ALLOWED_ORIGINS=https://app.example.com`
- `TRUSTED_HOSTS=app.example.com,localhost,127.0.0.1`
- `CORS_ORIGIN=https://app.example.com`
- `N8N_USER`
- `N8N_PASSWORD`
- `N8N_ENCRYPTION_KEY`
- `N8N_EDITOR_BASE_URL=https://n8n.example.com`
- `N8N_WEBHOOK_URL=https://n8n.example.com/`
- `N8N_PUSH_BACKEND=sse`
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
- `CLAUDE_API_KEY`
- `ASCULTICOR_ALERT_EMAIL_TO`

Recommended for first deployment:

- `MQTT_BIND_ADDRESS=127.0.0.1`
- `MQTT_WS_BIND_ADDRESS=127.0.0.1`
- `FRONTEND_BIND_ADDRESS=127.0.0.1`
- `INFERENCE_BIND_ADDRESS=127.0.0.1`
- `N8N_BIND_ADDRESS=127.0.0.1`

### Temporary values for your current Hostinger hostname

Because you currently gave me:

- VPS IP: `187.127.224.4`
- VPS hostname: `srv1621744.hstgr.cloud`

you can deploy immediately with these values:

```env
APP_DOMAIN=srv1621744.hstgr.cloud
DEVICE_BOOTSTRAP_PUBLIC_BASE_URL=https://srv1621744.hstgr.cloud
DEVICE_BOOTSTRAP_MQTT_HOST=srv1621744.hstgr.cloud

NGINX_SERVER_NAME=srv1621744.hstgr.cloud
ALLOWED_ORIGINS=https://srv1621744.hstgr.cloud
TRUSTED_HOSTS=srv1621744.hstgr.cloud,localhost,127.0.0.1
CORS_ORIGIN=https://srv1621744.hstgr.cloud

N8N_BIND_ADDRESS=127.0.0.1
N8N_DOMAIN=srv1621744.hstgr.cloud
N8N_PROTOCOL=https
N8N_EDITOR_BASE_URL=https://srv1621744.hstgr.cloud:8443
N8N_WEBHOOK_URL=https://srv1621744.hstgr.cloud:8443/
N8N_PUSH_BACKEND=sse
NGINX_N8N_SERVER_NAME=n8n.localhost
NGINX_N8N_ALT_SERVER_NAME=srv1621744.hstgr.cloud
NGINX_N8N_ALT_HTTP_BIND_ADDRESS=127.0.0.1
NGINX_N8N_ALT_HTTP_PORT=8081
NGINX_N8N_ALT_HTTPS_BIND_ADDRESS=0.0.0.0
NGINX_N8N_ALT_HTTPS_PORT=8443
```

This gives you:

- public app on the Hostinger hostname
- public n8n on the same hostname but its own HTTPS port
- no separate n8n domain required yet
- your teammate can open `https://srv1621744.hstgr.cloud:8443`

## 7. Get TLS Certificates

Use one certificate covering both hostnames:

```bash
certbot certonly --standalone -d app.example.com -d n8n.example.com
```

If you are using the Hostinger hostname only for now, use:

```bash
certbot certonly --standalone -d srv1621744.hstgr.cloud
```

After certbot succeeds:

```bash
mkdir -p nginx/certs
cp /etc/letsencrypt/live/app.example.com/fullchain.pem nginx/certs/fullchain.pem
cp /etc/letsencrypt/live/app.example.com/privkey.pem nginx/certs/privkey.pem
```

Because the certificate includes both `app.example.com` and `n8n.example.com`, the defaults in `.env` can stay as:

- `NGINX_SSL_CERT_PATH=/etc/nginx/certs/fullchain.pem`
- `NGINX_SSL_KEY_PATH=/etc/nginx/certs/privkey.pem`
- `NGINX_N8N_SSL_CERT_PATH=/etc/nginx/certs/fullchain.pem`
- `NGINX_N8N_SSL_KEY_PATH=/etc/nginx/certs/privkey.pem`

## 8. Configure Supabase

In Supabase:

- Site URL -> `https://app.example.com`
- Redirect URL -> `https://app.example.com/auth/callback`
- Edge function `CORS_ORIGIN` -> `https://app.example.com`

## 9. Start The Stack

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml up -d --build
```

## 10. Verify

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml ps
curl -f http://127.0.0.1:8000/health
curl -f https://app.example.com
curl -f https://app.example.com/api/health
curl -f https://n8n.example.com
```

If you are using the Hostinger hostname-only deployment with the separate n8n link:

```bash
curl -vk https://srv1621744.hstgr.cloud
curl -vk https://srv1621744.hstgr.cloud:8443
```

Check protected inference endpoints:

```bash
curl -f http://127.0.0.1:8000/config -H "x-internal-token: $INFERENCE_INTERNAL_TOKEN"
curl -f http://127.0.0.1:8000/metrics -H "x-internal-token: $INFERENCE_INTERNAL_TOKEN"
```

## 11. First n8n Login

Open:

- `https://n8n.example.com`

Login with:

- `N8N_USER`
- `N8N_PASSWORD`

If you prefer to keep n8n private even on the Hostinger hostname-only setup, access it with an SSH tunnel instead:

```bash
ssh -L 5678:127.0.0.1:5678 root@187.127.224.4
```

Then open:

- `http://localhost:5678`

Then create credentials inside n8n for:

- Supabase
- Claude or AgentRouter HTTP access if you prefer credentials over environment variables
- Email

For the AscultiCor workflow templates and test steps, follow:

- [N8N_WORKFLOW_IMPLEMENTATION.md](/d:/cardiosense-project/cardiosense/docs/N8N_WORKFLOW_IMPLEMENTATION.md:1)

## 12. First Workflow To Build

Start with the safest one:

- `Schedule Trigger`
- poll `llm_reports` every 1 minute
- process pending rows
- write back `completed` or `error`

This is the best first automation because it adds value immediately without touching the real-time device path.
