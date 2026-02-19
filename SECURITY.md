# Security Documentation

## 🔒 Security Overview

This document outlines the security measures implemented in the AscultiCor platform and provides guidance for secure deployment.

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Data Protection](#data-protection)
3. [API Security](#api-security)
4. [MQTT Security](#mqtt-security)
5. [Deployment Security](#deployment-security)
6. [Incident Response](#incident-response)

---

## Authentication & Authorization

### Supabase Authentication

- Uses JWT-based authentication
- Supports multiple auth providers (Email/Password, OAuth)
- Implements Row-Level Security (RLS) for database access
- Service role key has full admin access - **keep it secure!**

### Best Practices

1. **Never expose service role key in frontend code**
2. **Use Row-Level Security policies** for all tables
3. **Implement proper user roles** (admin, clinician, viewer)
4. **Enable email verification** for new accounts
5. **Use strong password policies** (min 12 characters, complexity)

---

## Data Protection

### PHI (Protected Health Information)

This application handles sensitive cardiac data. Ensure:

- **Encryption at rest**: Supabase provides automatic encryption
- **Encryption in transit**: All API calls use HTTPS
- **Access logging**: Enable audit logs for compliance
- **Data retention**: Implement retention policies per regulations

### Environment Variables

Critical security variables:

```bash
# Never commit these to version control!
SUPABASE_SERVICE_ROLE_KEY=xxx  # Admin access
SUPABASE_ANON_KEY=xxx          # Client access
MQTT_PASSWORD=xxx              # Device communication
OPENAI_API_KEY=xxx             # LLM integration
```

**Security Checklist:**
- [ ] `.env` file is in `.gitignore`
- [ ] Production keys are rotated from development
- [ ] Keys have minimal required permissions
- [ ] Keys are stored securely (not in code)

---

## API Security

### Implemented Protections

1. **Rate Limiting**
   - General endpoints: 60 requests/minute
   - Authentication endpoints: 5 requests/minute
   - IP-based tracking

2. **Security Headers** (when `SECURITY_HEADERS_ENABLED=true`)
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Strict-Transport-Security` (HSTS)
   - `Content-Security-Policy` (CSP)

3. **CORS Protection**
   - Restricted to configured origins only
   - Credentials required for sensitive operations
   - Limited HTTP methods (GET, POST only)

4. **Input Validation**
   - Maximum length limits on all inputs
   - Character validation for alphanumeric fields
   - Type checking with Pydantic models

### API Keys & Tokens

```python
# In your .env file
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE=5
SECURITY_HEADERS_ENABLED=true
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

---

## MQTT Security

### Current Configuration (Development)

- Plain MQTT on port 1883
- Username/password authentication
- Default credentials (MUST change for production)

### Production Hardening

1. **Enable TLS/SSL**
   ```
   listener 8883
   cafile /etc/mosquitto/certs/ca.crt
   certfile /etc/mosquitto/certs/server.crt
   keyfile /etc/mosquitto/certs/server.key
   ```

2. **Use Strong Passwords**
   - Minimum 16 characters
   - Mixed case, numbers, symbols
   - Rotate passwords quarterly

3. **Client Certificate Authentication**
   - More secure than passwords
   - Each device has unique certificate
   - Revoke compromised certificates

4. **Access Control Lists (ACLs)**
   ```
   # Restrict topics per device
   user device-001
   topic readwrite org/+/device/001/+
   topic read org/+/device/+/status
   ```

5. **Network Segmentation**
   - Place MQTT broker on isolated network
   - Firewall rules to limit access
   - VPN for remote device management

---

## Deployment Security

### Docker Security

1. **Non-root containers**
   ```dockerfile
   USER 1000:1000
   ```

2. **Read-only filesystems**
   ```dockerfile
   READONLY_ROOTFS=true
   ```

3. **No new privileges**
   ```dockerfile
   security_opt:
     - no-new-privileges:true
   ```

4. **Resource limits**
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1.0'
         memory: 512M
   ```

### Production Checklist

- [ ] All default passwords changed
- [ ] Environment variables configured
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Security headers enabled
- [ ] Rate limiting configured
- [ ] Logging enabled (but not DEBUG level)
- [ ] Backup strategy implemented
- [ ] Monitoring and alerting configured
- [ ] Incident response plan documented

---

## Incident Response

### Security Incident Types

1. **Credential Compromise**
   - Rotate all affected keys immediately
   - Review access logs for unauthorized access
   - Notify affected users
   - Update security documentation

2. **Data Breach**
   - Isolate affected systems
   - Preserve evidence/logs
   - Notify authorities per GDPR/HIPAA requirements
   - Conduct security audit

3. **DDoS Attack**
   - Enable rate limiting
   - Use CDN/WAF if available
   - Contact hosting provider
   - Implement IP blocking if necessary

### Emergency Contacts

- **Security Team**: security@yourorg.com
- **Supabase Support**: support@supabase.com
- **Hosting Provider**: [Your provider contact]

---

## Security Updates

### Dependency Management

```bash
# Check for vulnerabilities
npm audit
pip-audit

# Update dependencies regularly
npm update
pip install --upgrade -r requirements.txt
```

### Security Patches

Monitor for security advisories:
- [Node.js Security](https://nodejs.org/en/security/)
- [Python Security](https://www.python.org/dev/security/)
- [FastAPI Security](https://fastapi.tiangolo.com/release-notes/)

---

## Compliance

### HIPAA (Healthcare)

If handling PHI in the US:
- Business Associate Agreement (BAA) with Supabase
- Encryption at rest and in transit
- Access controls and audit logs
- Data retention and disposal policies

### GDPR (EU)

If serving EU users:
- Data processing agreements
- Right to be forgotten
- Data portability
- Privacy by design

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)
- [MQTT Security](https://mosquitto.org/man/mosquitto-conf-5.html)

---

## Implementation History

### February 2024 - Security Hardening

#### Critical Issues Fixed
- ✅ Removed hardcoded MQTT password from firmware
- ✅ Enhanced `.env.example` with security documentation
- ✅ Verified `.env` files properly excluded from git

#### Implemented Protections
- ✅ Rate limiting (60 req/min general, 5 req/min auth)
- ✅ Security headers middleware (CSP, HSTS, X-Frame-Options)
- ✅ CORS hardening with restricted methods
- ✅ Input validation framework
- ✅ Trusted host validation

#### Dependencies Added
- Testing: Jest, React Testing Library
- LLM Integration: OpenAI SDK, Google Gemini SDK

---

**Last Updated**: 2024-02-17  
**Version**: 1.0.0  
**Maintainer**: AscultiCor Security Team
