# Hostinger VPS Device Setup

For real ESP32 devices, never send `localhost`, Docker service names, or container IPs.

VPS example:

```env
NEXT_PUBLIC_DEPLOYMENT_MODE=vps
NEXT_PUBLIC_APP_URL=https://asculticor.example.com
DEVICE_BOOTSTRAP_URL=https://asculticor.example.com/api/device/bootstrap
MQTT_PUBLIC_HOST=asculticor.example.com
MQTT_PUBLIC_PORT=1883
MQTT_PUBLIC_USE_TLS=false
MQTT_BIND_ADDRESS=0.0.0.0
```

Firewall checklist:

- Open HTTP/HTTPS for dashboard and bootstrap.
- Open MQTT port `1883` only when protected by credentials and firewall rules.
- Prefer MQTT TLS or a VPN before production exposure.
- Keep Supabase service role key server-only.

NGINX/API routing:

- `/api/device/bootstrap` must route to the Next.js frontend API.
- MQTT is not HTTP and must be exposed as a broker listener, not an NGINX location.

Needs manual test: confirm ESP32 can reach the VPS domain from the target Wi-Fi network.

