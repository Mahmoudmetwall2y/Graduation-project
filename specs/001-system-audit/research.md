# Research: System Audit Fixes

## Unknown 1: Real-Time Frontend WebSocket Connection

**Decision:** Use `mqtt` (MQTT.js) library over native WebSockets in the React/Next.js frontend.
**Rationale:** The existing backend Mosquitto broker exposes port `9001` configured for raw MQTT-over-WebSockets. Using `mqtt.js` natively parses QoS levels, handles auto-reconnection, and matches the pub/sub payload system the Python Inference Engine already leverages, without requiring an intermediate Python WebSocket relay server.
**Alternatives considered:** 
1. `socket.io` -> Requires spinning up a Node.js WebSocket relay since Mosquitto natively speaks MQTT, not socket.io.
2. Raw `WebSocket` API -> Manually parsing MQTT binary packets in Javascript is highly error-prone.

## Unknown 2: Fallback Polling Mechanism

**Decision:** Retain the `fetch('/api/devices')` route but wrap it in a fallback hook triggered by `mqtt.client.on('offline')`.
**Rationale:** Maximizes clinical safety. If the WS port is firewalled, the dashboard reverts gracefully to Supabase REST latency.
**Alternatives considered:** Relying strictly on MQTT persistence layers, which wouldn't pass corporate firewalls blocking port 9001.

## Unknown 3: Secure Traffic Proxy

**Decision:** Reverse Proxy `NGINX` wrapping `1883`, `9001`, and `8000` via single Docker service.
**Rationale:** Prevents CORS and mixed-content blocking (HTTPS sites cannot securely connect to `ws://` endpoints).
**Alternatives considered:** Traefik or Caddy. NGINX was chosen for simplicity and low overhead matching existing Docker networks.
