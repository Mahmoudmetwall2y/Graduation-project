# Security Policy

## Academic Prototype

AscultiCor is an academic prototype, not a certified medical device. It must not be used as the sole basis for diagnosis, treatment, or emergency decisions.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately to the repository owner through GitHub's private security advisory feature. Include the affected component, reproduction steps, impact, and any proposed mitigation. Do not include real patient data or active credentials.

Do not disclose a vulnerability publicly until the maintainers have confirmed a fix and coordinated disclosure.

## Sensitive Data

- Never commit `.env` files, API keys, JWT secrets, private keys, MQTT passwords, database credentials, Terraform state, or production backups.
- Use synthetic data for development, demonstrations, screenshots, and bug reports.
- Do not store personally identifiable or protected health information in this prototype without an approved governance, retention, and access-control process.
- Rotate any credential immediately if it is accidentally exposed, even if the commit is later removed.

## Deployment Baseline

Production-like deployments should use TLS for HTTP and MQTT, strong unique secrets, least-privilege service accounts, Supabase Row Level Security, restricted network exposure, authenticated health diagnostics, logging without sensitive payloads, and tested backups.

Supported security behavior tracks the latest commit on the `main` branch. Historical academic snapshots may not receive fixes.
