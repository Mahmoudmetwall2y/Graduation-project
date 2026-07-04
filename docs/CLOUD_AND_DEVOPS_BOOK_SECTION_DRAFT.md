# Part V: Cloud And DevOps

This part documents the workstream responsible for deploying, securing, monitoring, and maintaining the AscultiCor / SonoCardia platform. The Cloud and DevOps layer connects the other project components into one reproducible system: ESP32 device communication through MQTT, FastAPI inference, Supabase backend services, the Next.js clinical dashboard, n8n automation, and the NGINX deployment layer.

The main goal of this part is to show how the project can move from separate development components into an integrated cloud-based prototype that can be started, tested, secured, and operated in a controlled way. The target deployment for the graduation project is a Hostinger VPS with public IP `187.127.224.4` and hostname `srv1621744.hstgr.cloud`. In the first cloud rollout, the clinical dashboard is served at `https://srv1621744.hstgr.cloud`, and n8n can be exposed for trusted team access at `https://srv1621744.hstgr.cloud:8443` or kept private through an SSH tunnel.

Author note on figures: the prompts in this draft are not final book text. Use each prompt to generate the diagram, insert the generated image at the matching placeholder, keep the caption, and remove the prompt block before final submission.

---

## Chapter 18: Security, Privacy, And Compliance

### 18.1 Security Objective

The security objective of AscultiCor / SonoCardia is to protect patient-related data, isolate each organization, secure connected devices, protect privileged service credentials, and keep an audit trail of sensitive actions. Because the platform handles ECG recordings, PCG recordings, patient records, clinical notes, AI predictions, and generated reports, the system must be designed with privacy and operational safety from the beginning.

In this project, security is applied at several layers. Supabase Auth verifies user identity. The database schema uses organization-scoped Row Level Security to prevent one organization from accessing another organization's data. Backend services use server-side service-role credentials only where privileged access is required. Devices use a bootstrap process and MQTT credentials instead of relying only on hardcoded network settings. The cloud deployment uses NGINX, TLS, environment-based configuration, internal service tokens, and private container networking to reduce public exposure.

The platform is a graduation project and decision-support prototype, not a certified medical product. Therefore, this chapter does not claim full medical regulatory compliance. Instead, it documents the controls implemented during the project and the additional controls required before production clinical use.

### 18.2 Authentication And Authorization

User authentication is handled through Supabase Auth. A user signs in through the web dashboard, and Supabase issues an authenticated session that the frontend can use when reading or writing data. The application stores additional user metadata in the `profiles` table, including the user's organization and role.

The platform follows an organization-based authorization model. Each user belongs to an organization, and most data records include an `org_id` field. This design allows the same system to support multiple clinics, labs, or project groups while keeping their data separated. The major role types used by the project are admin, clinician, operator, and readonly. Admin users can manage organization-level resources, devices, and users. Clinicians and operators can work with patients, sessions, and reports according to their permissions. Readonly users can inspect information but should not modify clinical or device records.

Route protection is handled by combining the Supabase session, frontend checks, backend API validation, and database policies. Even if a user bypasses a dashboard page, the database policies remain the final protection layer. This is important because client-side checks improve user experience, but they should not be treated as the only security boundary.

### 18.3 Row Level Security

Row Level Security, or RLS, is the main database isolation control in AscultiCor / SonoCardia. The Supabase database stores shared tables such as organizations, profiles, devices, patients, sessions, recordings, predictions, live metrics, LLM reports, alerts, notes, and audit logs. Since these tables can contain records from different organizations, each query must be restricted to the current user's organization.

The database migrations enable RLS and define policies that compare the row's `org_id` with the organization of the authenticated user. For example, a user can view sessions, patients, devices, predictions, and reports only when those rows belong to the same organization. Admin-only policies are used for sensitive actions such as managing organization settings, deleting records, or viewing audit logs.

Some actions are performed by backend services rather than by a browser user. For example, the inference service inserts recordings, predictions, live metrics, and audit events after receiving MQTT data from a device. These operations use Supabase service-role access because they are server-side system actions. The service-role key bypasses RLS, so it must never be exposed to the browser, firmware, public repositories, screenshots, or client-side code. In the deployment, service-role credentials are stored only as server environment variables for backend containers and automation services that require them.

**Figure 18.1 Placeholder: Security And Organization Isolation Model**

Insert Figure 18.1 here, immediately after the Row Level Security explanation. This position is correct because the figure visually summarizes the security model discussed in Sections 18.2 and 18.3.

Caption: Figure 18.1 shows how Supabase Auth, user profiles, organization membership, Row Level Security, protected API routes, device bootstrap credentials, internal service tokens, TLS, and audit logs work together to protect the platform.

Draft generation prompt, remove before final submission:

```text
Create a security model diagram for AscultiCor / SonoCardia. Show organization isolation, Supabase Auth, Row Level Security policies, protected API routes, service role only on backend, device bootstrap secret, per-device MQTT credentials, audit logs, rate limiting, TLS, environment secret protection, and n8n internal token protection. Professional cybersecurity architecture style, white background.
```

### 18.4 Device Security

Device security is important because ESP32 devices are the entry point for physiological signals. The final device design should avoid permanent shared credentials whenever possible. AscultiCor / SonoCardia uses a bootstrap flow in which an administrator creates a device record, assigns it to an organization, and stores a hashed device secret. The technician configures the ESP32 with the device ID, device secret, WiFi settings, and bootstrap endpoint.

When the device calls the bootstrap API, the backend validates the provided secret against the stored hash. If the credentials are valid, the backend returns the organization ID and MQTT connection details. The implementation supports per-device MQTT credentials, which is safer than using one shared broker password for every device. The bootstrap request is also written to the audit log so that device provisioning activity can be reviewed later.

The Mosquitto broker uses authentication and an ACL file. A runtime synchronization script reads device MQTT credentials from Supabase and regenerates the Mosquitto password and ACL configuration. The ACL design restricts each device to its own topic namespace, such as its organization and device path. This reduces the impact of a compromised device because it should not be able to publish into another device's topic path.

For local development, MQTT may be bound to `127.0.0.1` or a trusted LAN address. For a hardened cloud deployment, the broker should not be opened directly to the public internet without additional protection. Safer options include MQTT over TLS, a VPN or private tunnel, or a managed IoT broker. Device credential rotation should also be planned so that a lost or compromised device can be disabled without changing credentials for all devices.

In the Hostinger VPS deployment, this device boundary is especially important. The dashboard can be made public at `https://srv1621744.hstgr.cloud`, but the MQTT broker should remain private during the first rollout by keeping `MQTT_BIND_ADDRESS=127.0.0.1` and `MQTT_WS_BIND_ADDRESS=127.0.0.1`. This means the initial cloud deployment is ready for dashboard access, automation, and backend verification, while direct remote ESP32 publishing requires a later MQTT hardening step.

### 18.5 API And Application Security

The application security model uses several controls. First, public browser traffic is routed through NGINX over HTTPS. NGINX forwards requests to the frontend, MQTT WebSocket endpoint, and inference API through the internal Docker network. This keeps direct container ports away from the public internet.

On the Hostinger VPS, the public hostname is `srv1621744.hstgr.cloud`. The intended public surface is HTTPS on port `443` for the dashboard and, if needed, HTTPS on port `8443` for n8n. The internal service ports remain bound to loopback or Docker networking. This prevents users from directly reaching the Next.js runtime port, FastAPI runtime port, MQTT broker port, or n8n runtime port.

Second, backend services use environment variables for secrets and configuration. Important variables include the Supabase URL, Supabase anon key, service-role key, MQTT credentials, internal API token, inference internal token, allowed origins, trusted hosts, and TLS certificate paths. Real secret values must not be documented in the book, committed to source control, or shared in screenshots.

Third, internal operational endpoints are protected with shared internal tokens. The frontend and n8n workflows use `INTERNAL_API_TOKEN` for protected application tasks such as report queue processing and workflow actions. The inference service uses `INFERENCE_INTERNAL_TOKEN` for protected operational endpoints such as configuration and metrics. This prevents casual public access to sensitive operational information.

Fourth, the inference service includes security middleware features. It supports CORS restrictions through `ALLOWED_ORIGINS`, trusted host validation through `TRUSTED_HOSTS`, security headers when enabled, and rate limiting for API endpoints. Security headers include protections such as content type restrictions, frame denial, HSTS, referrer policy, permissions policy, and a configurable Content Security Policy.

Finally, input validation is applied at API boundaries. Device bootstrap requires both `device_id` and `device_secret`. Session, device, report, and automation routes validate the required fields before performing database updates. This is especially important because the system connects many components: browser users, ESP32 devices, MQTT messages, automation workflows, and external LLM providers.

### 18.6 Privacy And Data Retention

AscultiCor stores health-related data, including patient metadata, ECG and PCG recordings, live signal metrics, AI predictions, notes, alerts, and generated reports. These records should be treated as sensitive even in a prototype environment.

The project uses several privacy controls. Supabase Storage should store recordings in a private bucket. Storage policies should allow authenticated users to view recordings only inside their organization, while uploads from backend inference services use the service role. Database RLS prevents cross-organization access to patient and session records. Audit logs record events such as device creation, device update, session start, note addition, deletion, bootstrap requests, and other sensitive operations.

For demonstrations and academic testing, de-identification should be used whenever possible. Patient names, emails, and identifiers can be replaced with synthetic values. Real clinical data should not be uploaded unless the team has explicit permission, a clear retention policy, and approval from the responsible institution. Generated reports should also be reviewed as decision-support text rather than treated as final clinical diagnosis.

Data retention should be defined before production use. The project should specify how long raw recordings, predictions, audit logs, and generated reports are kept. Shorter retention may be appropriate for test data, while longer retention may be needed for validated research records. Backups must follow the same privacy rules as the primary database, because a backup can contain the same sensitive information.

### 18.7 Incident Response

Incident response defines how the team reacts when security controls fail or suspicious activity occurs. The most likely incidents for this project are leaked environment variables, exposed service-role keys, compromised device credentials, suspicious audit log events, accidental public exposure of MQTT, or accidental sharing of patient data.

If a Supabase service-role key or internal API token is leaked, the first response should be to revoke or rotate the affected key immediately. After rotation, the `.env` file on the VM and any deployment secrets must be updated, containers must be restarted, and the audit logs should be reviewed for unusual access. Any screenshots, chat messages, or repository commits containing the secret should be removed or invalidated.

If a device is compromised, the device record should be disabled or its credentials rotated. The Mosquitto credential synchronization process should then reload the broker configuration so the compromised credentials no longer work. The team should review MQTT logs, device telemetry, session records, and audit logs to identify whether invalid data was sent.

If patient data is exposed, the team should identify the affected records, remove public access, preserve logs for investigation, and notify the responsible supervisor or institution. For a production medical system, this process would require a formal privacy and compliance workflow. For the graduation prototype, documenting these steps demonstrates that the team understands the operational responsibility of handling sensitive health information.

### Table 18.1: Security Control Checklist

| Security Control | Implemented Approach | Production Recommendation |
| --- | --- | --- |
| User authentication | Supabase Auth sessions | Enforce strong passwords and organization onboarding rules |
| Authorization | User profiles, roles, route checks | Review role permissions before production use |
| Organization isolation | Supabase RLS by `org_id` | Add automated RLS regression tests |
| Service-role protection | Service role used only in backend services | Store in managed secret storage and rotate regularly |
| Device provisioning | Device ID, hashed secret, bootstrap API | Add expiry and one-time bootstrap credentials |
| MQTT access control | Mosquitto authentication and per-device ACLs | Use MQTT over TLS, VPN, or managed IoT broker |
| API protection | Internal tokens for operational endpoints | Use stronger service-to-service authentication |
| CORS and trusted hosts | Configured by environment variables | Restrict to production domains only |
| Security headers | Enabled in inference service | Apply consistent headers at NGINX and frontend layers |
| Audit logs | Stored in Supabase `audit_logs` | Add alerting for suspicious actions |
| Data privacy | Private storage and organization-scoped access | Formalize retention, consent, and deletion policy |
| Backups | Planned through Supabase and VM artifacts | Encrypt backups and test restore procedures |

---

## Chapter 19: Deployment, Docker, NGINX, Cloud VM, And Operations

### 19.1 DevOps Objective

The DevOps objective is to make AscultiCor / SonoCardia reproducible, deployable, secure, observable, and maintainable. The project contains multiple services written with different technologies: a Next.js frontend, a FastAPI inference service, a Mosquitto MQTT broker, Supabase backend services, optional n8n automation, ML model artifacts, and ESP32 firmware. Without a structured deployment layer, these components would be difficult to run consistently across team laptops, demo machines, and the cloud VM.

Docker Compose is used to package and run the local and cloud services. NGINX acts as the secure public entry point. Environment variables separate configuration from source code. Health endpoints, service logs, and operational checklists help the team verify that the system is running correctly. The final result is a deployment design that supports local development, cloud staging, and future production hardening.

### 19.2 Local Development Environment

The local development environment is designed to let team members run the complete platform with minimal manual setup. A developer copies the environment template, fills in the required Supabase and MQTT values, applies the database migrations, and starts the services with Docker Compose.

The core local services are the Mosquitto broker, the FastAPI inference service, the Next.js frontend, and NGINX. The frontend provides the dashboard and API routes. The inference service subscribes to MQTT topics, buffers ECG and PCG samples, runs ML inference, and writes results to Supabase. Mosquitto routes device and simulator messages. NGINX provides a reverse proxy layer and can also expose MQTT over WebSockets for browser or device communication patterns.

Supabase remains a managed external service in the recommended setup. It provides authentication, PostgreSQL database tables, RLS policies, private storage, and edge functions. This reduces the operational burden on the team because the VM does not have to run a separate PostgreSQL database or object storage service.

Local testing should verify that containers start successfully, the frontend can reach Supabase, the inference service can connect to MQTT, models are loaded, and test data can flow from device or simulator to dashboard. The main local command is:

```bash
docker compose up --build -d
```

Recommended local quality checks include frontend linting, frontend type checking, frontend production build, and Python compile checks for the inference service.

### 19.3 Docker Compose Architecture

Docker Compose defines the runtime architecture of the platform. The base Compose file starts the main application containers and connects them to a shared Docker bridge network named `asculticor-network`. Containers communicate with each other through service names such as `frontend`, `inference`, and `mosquitto`.

The base services are:

| Service | Main Responsibility | Important Interfaces |
| --- | --- | --- |
| `frontend` | Runs the Next.js dashboard and application API routes | Browser traffic, Supabase, MQTT command publishing, inference API calls |
| `inference` | Runs FastAPI, subscribes to MQTT, loads ML models, writes predictions | MQTT broker, Supabase database and storage, protected health/config endpoints |
| `mosquitto` | MQTT broker for device data and control topics | MQTT TCP, MQTT WebSocket, per-device credentials and ACLs |
| `nginx` | Reverse proxy and TLS termination layer | Public HTTP/HTTPS, frontend routing, MQTT WebSocket routing, inference proxy |
| `n8n` | Optional workflow automation engine | Internal frontend/inference APIs, Supabase, email or LLM providers |

The inference container mounts the `models` directory read-only so that trained model artifacts can be deployed without changing application code. Mosquitto uses persistent volumes for broker data and logs. The optional n8n cloud profile uses a persistent `n8n_data` volume for workflow and credential storage.

**Figure 19.1 Placeholder: Local Docker Compose Deployment**

Insert Figure 19.1 here, immediately after the Docker Compose service table. This position is correct because the reader has just learned the role of each container and is ready to see their relationships.

Caption: Figure 19.1 shows the local Docker Compose deployment, including the Next.js frontend, FastAPI inference service, Mosquitto MQTT broker, NGINX reverse proxy, optional n8n automation container, shared Docker network, exposed ports, persistent volumes, and managed Supabase connection.

Draft generation prompt, remove before final submission:

```text
Create a local Docker Compose deployment diagram. Show containers: Next.js frontend, FastAPI inference service, Mosquitto MQTT broker, NGINX reverse proxy if enabled, optional n8n, and external Supabase cloud. Show internal network connections and ports conceptually. White background, DevOps architecture style.
```

### 19.4 Cloud VM Deployment

The cloud deployment uses one Hostinger VPS running Linux and Docker Compose. The selected VPS is identified by the public IP address `187.127.224.4` and the Hostinger-provided hostname `srv1621744.hstgr.cloud`. This hostname is important because it gives the team an immediately usable public address even before buying or configuring a custom domain.

The deployment keeps the same service architecture used in local development. The Next.js frontend, FastAPI inference service, Mosquitto broker, NGINX reverse proxy, and optional n8n automation service run as Docker containers on the VM. Supabase remains a managed cloud service outside the VM and provides authentication, PostgreSQL database tables, Row Level Security, storage, and edge functions.

The cloud architecture follows a simple security rule: NGINX is the main public entry point. Public users access the dashboard through HTTPS at `https://srv1621744.hstgr.cloud`. NGINX forwards web requests to the frontend container and can proxy selected internal routes to other services. The frontend container listens on port `3000` inside the deployment, the inference container listens on port `8000`, Mosquitto listens on `1883` for MQTT and `9001` for MQTT over WebSockets, and n8n listens on `5678`. These service ports should remain private to the VM or Docker network unless the team intentionally exposes them.

For the hostname-only Hostinger deployment, n8n has two possible access patterns. The safer option is to bind n8n to `127.0.0.1:5678` and access it through an SSH tunnel during administration. The more convenient team-demo option is to expose n8n through NGINX on the same hostname but a separate HTTPS port, `https://srv1621744.hstgr.cloud:8443`. In both cases, n8n requires basic authentication and an encryption key so that workflow credentials are not stored as plain text.

TLS certificates are mounted into the NGINX container from `nginx/certs`. In production-like deployment, certificates should be generated through a trusted certificate authority such as Let's Encrypt. The NGINX template supports TLS for the main application domain and also supports n8n either through a separate subdomain or a separate HTTPS port when a subdomain is not available.

The cloud Compose overlay, `docker-compose.cloud.yml`, adds cloud-specific behavior. It mounts real certificate files, includes the n8n service, configures n8n basic authentication, sets the n8n encryption key, and connects n8n to the same Docker network as the application. From inside the network, n8n can call `http://frontend:3000`, `http://inference:8000`, and `mosquitto:1883` without exposing those services publicly.

#### 19.4.1 Hostinger VPS Target

The target Hostinger deployment values are:

| Item | Value |
| --- | --- |
| VPS provider | Hostinger |
| Public IP | `187.127.224.4` |
| Hostname | `srv1621744.hstgr.cloud` |
| Main application URL | `https://srv1621744.hstgr.cloud` |
| Optional n8n URL | `https://srv1621744.hstgr.cloud:8443` |
| Main deployment directory | `/opt/asculticor` |
| Main Compose files | `docker-compose.yml` and `docker-compose.cloud.yml` |
| Public entrypoint | NGINX |
| Managed backend | Supabase |

The recommended VM operating system is Ubuntu or Debian. Docker Engine, the Docker Compose plugin, Git, UFW, Certbot, and basic networking tools are installed on the VM before deployment.

#### 19.4.2 Firewall And Public Port Plan

The firewall should expose only the ports required for administration and public access:

| Port | Purpose | Public Exposure Decision |
| --- | --- | --- |
| `22/tcp` | SSH administration | Open only for trusted administrators |
| `80/tcp` | HTTP and certificate challenge | Open for NGINX and Certbot |
| `443/tcp` | HTTPS application | Open for the dashboard |
| `8443/tcp` | Optional HTTPS n8n access | Open only if n8n is intentionally public for the team |
| `3000/tcp` | Next.js frontend container | Keep private |
| `8000/tcp` | FastAPI inference container | Keep private |
| `1883/tcp` | MQTT broker | Keep private unless MQTT TLS/VPN is added |
| `9001/tcp` | MQTT WebSocket listener | Keep private unless intentionally proxied |
| `5678/tcp` | n8n container | Keep private behind NGINX or SSH tunnel |

This port plan allows the team to demonstrate the cloud dashboard without exposing every internal service. It also clearly separates the current staging deployment from a fully hardened IoT production deployment.

#### 19.4.3 Hostinger Environment Configuration

The cloud deployment uses `.env.cloud.example` as the template for the VM `.env` file. The actual `.env` file must stay on the server and must not be committed to Git. The following values are safe to document because they are hostnames or non-secret deployment settings:

```env
APP_DOMAIN=srv1621744.hstgr.cloud
DEVICE_BOOTSTRAP_PUBLIC_BASE_URL=https://srv1621744.hstgr.cloud
DEVICE_BOOTSTRAP_MQTT_HOST=srv1621744.hstgr.cloud

NGINX_SERVER_NAME=srv1621744.hstgr.cloud
ALLOWED_ORIGINS=https://srv1621744.hstgr.cloud
TRUSTED_HOSTS=srv1621744.hstgr.cloud,localhost,127.0.0.1
CORS_ORIGIN=https://srv1621744.hstgr.cloud

FRONTEND_BIND_ADDRESS=127.0.0.1
INFERENCE_BIND_ADDRESS=127.0.0.1
MQTT_BIND_ADDRESS=127.0.0.1
MQTT_WS_BIND_ADDRESS=127.0.0.1

N8N_BIND_ADDRESS=127.0.0.1
N8N_DOMAIN=srv1621744.hstgr.cloud
N8N_PROTOCOL=https
N8N_EDITOR_BASE_URL=https://srv1621744.hstgr.cloud:8443
N8N_WEBHOOK_URL=https://srv1621744.hstgr.cloud:8443/
NGINX_N8N_ALT_SERVER_NAME=srv1621744.hstgr.cloud
NGINX_N8N_ALT_HTTPS_BIND_ADDRESS=0.0.0.0
NGINX_N8N_ALT_HTTPS_PORT=8443
```

The same file also contains secrets such as `SUPABASE_SERVICE_ROLE_KEY`, `MQTT_PASSWORD`, `MQTT_DEVICE_PASSWORD_PEPPER`, `INTERNAL_API_TOKEN`, `INFERENCE_INTERNAL_TOKEN`, `N8N_PASSWORD`, `N8N_ENCRYPTION_KEY`, and optional LLM provider keys. Those values must be filled on the VPS but not shown in the graduation book.

#### 19.4.4 Rollout Procedure

The rollout procedure starts by connecting to the VPS:

```bash
ssh root@187.127.224.4
```

The server is updated and prepared with Docker, Git, UFW, and Certbot. The repository is then cloned under `/opt`:

```bash
cd /opt
git clone https://github.com/Mahmoudmetwall2y/Graduation-project.git asculticor
cd asculticor
```

The environment file is created from the cloud template:

```bash
cp .env.cloud.example .env
nano .env
```

After filling the non-secret Hostinger values and the required private secrets, TLS certificates are generated for the Hostinger hostname:

```bash
certbot certonly --standalone -d srv1621744.hstgr.cloud
mkdir -p nginx/certs
cp /etc/letsencrypt/live/srv1621744.hstgr.cloud/fullchain.pem nginx/certs/fullchain.pem
cp /etc/letsencrypt/live/srv1621744.hstgr.cloud/privkey.pem nginx/certs/privkey.pem
```

Supabase Auth must also be configured for the cloud hostname:

| Supabase Setting | Hostinger Value |
| --- | --- |
| Site URL | `https://srv1621744.hstgr.cloud` |
| Redirect URL | `https://srv1621744.hstgr.cloud/auth/callback` |
| Edge Function CORS Origin | `https://srv1621744.hstgr.cloud` |

The recommended cloud deployment command is:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml up -d --build
```

Before considering the deployment successful, the rendered Compose configuration should be checked:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml config > /dev/null
```

#### 19.4.5 Device Connectivity Boundary

The Hostinger deployment is suitable for remote dashboard access, teammate testing, n8n automation, report generation, and service-to-service communication on the VM. However, the safe first rollout does not treat public MQTT as production-ready. With `MQTT_BIND_ADDRESS=127.0.0.1`, the MQTT broker is not reachable directly from remote ESP32 devices over the public internet.

If physical ESP32 devices must publish directly to the Hostinger VPS from outside the local network, the team should first add MQTT over TLS, a VPN or private tunnel, or a managed IoT broker. Only after that hardening should ports such as `1883` or `9001` be opened beyond the VM. This boundary is important because ECG and PCG streams are sensitive and because MQTT credentials should not be exposed through an unencrypted public broker.

**Figure 19.2 Placeholder: Cloud Deployment Architecture**

Insert Figure 19.2 here, immediately after the Cloud VM deployment explanation. This position is correct because the section has already explained NGINX, TLS, public/private boundaries, n8n, Mosquitto, and managed Supabase.

Caption: Figure 19.2 shows the cloud VM deployment, where public HTTPS traffic reaches NGINX, NGINX routes requests to private Docker services, n8n runs inside the deployment network, Mosquitto handles device communication, and Supabase provides managed authentication, database, and storage.

Draft generation prompt, remove before final submission:

```text
Create a deployment diagram for the AscultiCor / SonoCardia Hostinger VPS deployment. Show Hostinger VPS with public IP 187.127.224.4 and hostname srv1621744.hstgr.cloud. Show user browser reaching NGINX over HTTPS at https://srv1621744.hstgr.cloud. Show NGINX routing to private Docker services: Next.js frontend, FastAPI inference service, internal Mosquitto broker, and optional n8n at https://srv1621744.hstgr.cloud:8443. Show managed Supabase cloud for auth, database, and storage. Mark public boundary, private Docker network, TLS, internal tokens, and note that public MQTT requires TLS/VPN hardening. White background, clean cloud architecture style.
```

### 19.5 Environment Variables

Environment variables are used to configure the same codebase for local development, cloud staging, and future production environments. This keeps secrets out of source code and allows deployment-specific values to change without editing application files.

The book should document variable names and purpose only. It should never include real values for service-role keys, JWTs, API keys, internal tokens, MQTT passwords, n8n passwords, encryption keys, database URLs containing passwords, or production patient data.

#### Table 19.1: Environment Variable Reference

| Variable | Purpose |
| --- | --- |
| `APP_DOMAIN` | Public domain for the application |
| `DEVICE_BOOTSTRAP_PUBLIC_BASE_URL` | Public base URL used by devices during bootstrap |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public anon key used by browser-safe Supabase clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged backend key used only by server services |
| `MQTT_USERNAME` | Administrative MQTT username |
| `MQTT_PASSWORD` | Administrative MQTT password |
| `MQTT_DEVICE_PASSWORD_PEPPER` | Secret used when deriving per-device MQTT credentials |
| `MQTT_BIND_ADDRESS` | Bind address for MQTT TCP listener |
| `MQTT_WS_BIND_ADDRESS` | Bind address for MQTT WebSocket listener |
| `DEVICE_BOOTSTRAP_MQTT_HOST` | MQTT host returned to provisioned devices |
| `DEVICE_BOOTSTRAP_MQTT_PORT` | MQTT port returned to provisioned devices |
| `DEVICE_BOOTSTRAP_MQTT_TLS` | Indicates whether devices should use TLS for MQTT |
| `FRONTEND_BIND_ADDRESS` | Bind address for the Next.js service |
| `INFERENCE_BIND_ADDRESS` | Bind address for the FastAPI inference service |
| `NGINX_SERVER_NAME` | Domain served by NGINX for the main application |
| `NGINX_SSL_CERT_PATH` | Certificate path inside the NGINX container |
| `NGINX_SSL_KEY_PATH` | Private key path inside the NGINX container |
| `INTERNAL_API_TOKEN` | Shared token for protected frontend operational routes |
| `INFERENCE_INTERNAL_TOKEN` | Shared token for protected inference operational endpoints |
| `ALLOWED_ORIGINS` | Allowed browser origins for CORS |
| `TRUSTED_HOSTS` | Hostnames accepted by trusted host middleware |
| `SECURITY_HEADERS_ENABLED` | Enables security headers in the inference service |
| `CSP_POLICY` | Content Security Policy value |
| `LLM_PROVIDER` | Selects demo or external LLM provider |
| `CLAUDE_API_KEY` | Optional LLM provider key |
| `OPENAI_API_KEY` | Optional LLM provider key |
| `ASCULTICOR_ALERT_EMAIL_TO` | Default alert notification recipient |
| `CORS_ORIGIN` | Origin allowed by Supabase Edge Functions |
| `N8N_USER` | n8n basic authentication username |
| `N8N_PASSWORD` | n8n basic authentication password |
| `N8N_ENCRYPTION_KEY` | n8n credential encryption key |
| `N8N_EDITOR_BASE_URL` | Public URL for the n8n editor |
| `N8N_WEBHOOK_URL` | Public webhook base URL for n8n |

#### Table 19.2: Hostinger VPS Environment Plan

| Variable | Hostinger Deployment Value Or Rule |
| --- | --- |
| `APP_DOMAIN` | `srv1621744.hstgr.cloud` |
| `DEVICE_BOOTSTRAP_PUBLIC_BASE_URL` | `https://srv1621744.hstgr.cloud` |
| `DEVICE_BOOTSTRAP_MQTT_HOST` | `srv1621744.hstgr.cloud` |
| `NGINX_SERVER_NAME` | `srv1621744.hstgr.cloud` |
| `ALLOWED_ORIGINS` | `https://srv1621744.hstgr.cloud` |
| `TRUSTED_HOSTS` | `srv1621744.hstgr.cloud,localhost,127.0.0.1` |
| `CORS_ORIGIN` | `https://srv1621744.hstgr.cloud` |
| `FRONTEND_BIND_ADDRESS` | `127.0.0.1` |
| `INFERENCE_BIND_ADDRESS` | `127.0.0.1` |
| `MQTT_BIND_ADDRESS` | `127.0.0.1` for the safe first rollout |
| `MQTT_WS_BIND_ADDRESS` | `127.0.0.1` for the safe first rollout |
| `N8N_EDITOR_BASE_URL` | `https://srv1621744.hstgr.cloud:8443` if n8n is exposed |
| `N8N_WEBHOOK_URL` | `https://srv1621744.hstgr.cloud:8443/` if n8n is exposed |
| `NGINX_N8N_ALT_HTTPS_PORT` | `8443` |
| Secret variables | Fill on the VPS only; do not publish in the book |

### 19.6 Monitoring And Logs

Monitoring verifies whether the deployed system is healthy and whether data is flowing across services. The project includes several operational signals that can be checked during development, demos, and cloud deployment.

The frontend exposes an application health route at `/api/health`. The inference service exposes `/health`, which reports service status, MQTT connection state, Supabase connectivity, storage connectivity, model load status, demo mode, and active sessions. The inference service also includes protected `/config` and `/metrics` endpoints that require `INFERENCE_INTERNAL_TOKEN`.

Docker logs are the main first-level diagnostic tool. `docker compose logs` can be used to inspect startup errors, MQTT connection problems, missing environment variables, model loading failures, Supabase errors, and NGINX proxy problems. Mosquitto writes broker logs to stdout and to its persistent log volume. The inference service uses structured logs, which makes it easier to search by level, service, and message.

Application-level monitoring also comes from the database. Device records store `last_seen_at` values and telemetry, which can be used to detect offline devices. Live metrics show signal quality and active session behavior. LLM report rows show pending, completed, or failed report states. Device alerts, workflow logs, and audit logs provide additional visibility into operational and security events.

n8n contributes workflow-level monitoring. Each workflow execution has a status, timestamp, inputs, outputs, and error information. This is useful for report processing, daily digests, clinical alerts, device health checks, and escalation workflows. In a future production version, important errors should be routed to email, chat, or incident management channels.

Recommended deployment verification commands include:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml ps
curl -f https://srv1621744.hstgr.cloud/
curl -f https://srv1621744.hstgr.cloud/api/health
curl -vk https://srv1621744.hstgr.cloud:8443
curl -f http://127.0.0.1:3000/api/health
curl -f http://127.0.0.1:8000/health
curl -f http://127.0.0.1:8000/config -H "x-internal-token: $INFERENCE_INTERNAL_TOKEN"
curl -f http://127.0.0.1:8000/metrics -H "x-internal-token: $INFERENCE_INTERNAL_TOKEN"
```

For troubleshooting on the Hostinger VPS, the most useful commands are:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml logs -f nginx
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml logs -f frontend
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml logs -f inference
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml logs -f mosquitto
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml logs -f n8n
ufw status
ss -tulpn
```

### 19.7 Backup And Maintenance

Backup and maintenance are required because the system stores database records, raw recordings, generated reports, model artifacts, workflow definitions, and environment configuration. A failure in any of these areas could affect demos, testing, or future research work.

Supabase database backups should be enabled for the project database. The team should also keep migration files under source control so the schema can be recreated. Supabase Storage backups are important because recordings and uploaded artifacts may not be recoverable from database rows alone. If recordings are stored in a private bucket, backup copies must remain private as well.

The Hostinger VPS should preserve persistent Docker volumes. Mosquitto uses volumes for broker data and logs. n8n uses a volume for workflows and encrypted credentials. These volumes should be backed up before major updates. n8n workflows should also be exported as JSON files so they can be restored or reviewed independently of the running container.

Model artifacts should be versioned. Each deployed model should be tied to a preprocessing version, training run, validation result, and expected input shape. The inference service already exposes model status through health checks, but production operations should also track which model version is currently deployed and how to roll back to a previous version.

Credential rotation is part of maintenance. Service-role keys, MQTT administrative credentials, per-device credentials, n8n passwords, n8n encryption keys, and internal API tokens should be rotated if exposed or after a planned interval. After credential changes, containers must be restarted and dependent services must be tested again.

A normal maintenance update should follow a controlled sequence: pull or copy the new application version, review environment changes, render the Compose configuration, rebuild containers, restart the stack, run health checks, verify login, verify MQTT, verify inference, verify n8n workflows, and review logs for errors.

For the Hostinger deployment, a practical maintenance routine is:

```bash
cd /opt/asculticor
git pull
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml config > /dev/null
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml up -d --build
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml ps
curl -f https://srv1621744.hstgr.cloud/api/health
curl -f http://127.0.0.1:8000/health
```

Before large changes, the team should back up the server environment file, TLS certificates, n8n data volume, Mosquitto logs/data volume, model artifacts, and exported n8n workflows. The `.env` backup must be encrypted or kept in a restricted location because it contains service credentials.

### 19.8 Production Checklist

Before the platform is used outside a controlled academic or demo environment, the following checklist should be completed.

| Area | Checklist Item |
| --- | --- |
| TLS | Use valid certificates for all public domains |
| Public exposure | Keep frontend, inference, MQTT, and n8n container ports private unless intentionally proxied |
| MQTT | Use MQTT over TLS, VPN, private tunnel, or managed broker for remote devices |
| Supabase | Confirm RLS is enabled on all sensitive tables |
| Storage | Use private buckets and organization-scoped storage policies |
| Service role | Keep service-role key server-side only and rotate if exposed |
| Internal APIs | Protect operational endpoints with strong internal tokens |
| n8n | Enable basic auth, use a strong encryption key, and protect workflow credentials |
| Environment | Store secrets outside source control and do not include real values in documentation |
| CORS | Restrict allowed origins to trusted domains |
| Trusted hosts | Restrict accepted hostnames to production domains and local maintenance addresses |
| Rate limits | Enable and tune API rate limits |
| Backups | Enable database, storage, n8n, Mosquitto, and model artifact backups |
| Restore testing | Test at least one restore path before relying on backups |
| Monitoring | Check health endpoints, Docker logs, workflow logs, device last-seen timestamps, and audit logs |
| Incident response | Document key rotation, device disabling, audit review, and data exposure procedures |
| Clinical safety | Keep the medical disclaimer visible and require clinician review of AI-generated results |

This checklist shows that the DevOps workstream is not limited to starting containers. It also covers the operational discipline needed to keep a connected health-monitoring prototype reliable, secure, and explainable.

For the Hostinger VPS specifically, the deployment should not be considered complete until the following evidence is collected for the book appendix:

| Evidence Item | Expected Evidence |
| --- | --- |
| VPS reachability | SSH connection to `187.127.224.4` |
| HTTPS application | Browser or `curl` success for `https://srv1621744.hstgr.cloud` |
| Health endpoint | Successful response from `https://srv1621744.hstgr.cloud/api/health` |
| Inference health | Successful local VM response from `http://127.0.0.1:8000/health` |
| Container status | Screenshot or text output of Docker Compose services running |
| TLS certificate | Certificate issued for `srv1621744.hstgr.cloud` |
| Firewall | UFW status showing only required public ports |
| n8n access | n8n reachable by SSH tunnel or `https://srv1621744.hstgr.cloud:8443` |
| Supabase settings | Auth redirect and CORS configured for the Hostinger hostname |
| Logs | NGINX, frontend, inference, Mosquitto, and n8n logs reviewed after deployment |
