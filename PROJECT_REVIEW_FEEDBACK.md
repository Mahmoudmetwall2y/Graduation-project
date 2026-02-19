# Project Review Feedback and Suggestions

## What is working well

1. **Clear modular architecture** across frontend, inference, broker, and Supabase layers.
2. **Good security intent** with middleware, RLS-based tenancy model, and optional API rate limiting/security headers.
3. **Operational readiness signals** like Docker health checks, docs, and migration scripts are present.

## Key issues found

### 1) Frontend dependency management is currently broken
- `frontend/package.json` and `frontend/package-lock.json` are out of sync, causing `npm ci` and tests to fail in clean environments.
- This makes CI/CD reproducibility unreliable.

**Suggestion**
- Regenerate lock file from the current manifest (`npm install`) and commit the updated lock.
- Add CI check enforcing deterministic install (`npm ci`) and lint/tests.

### 2) Credentials and onboarding documentation are inconsistent
- README says default login is `admin@cardiosense.local / admin123`.
- Supabase docs mention `admin@cardiosense.local / cardiosense123`.
- `supabase/seed.sql` comments show a different real email and password (`mahmoudmetwall2y@gmail.com / professional123`).

**Risk**
- Team confusion, failed local setup, and accidental credential leaks.

**Suggestion**
- Standardize one dev credential set for docs.
- Remove personal credentials from seed comments.
- Put all example credentials only in `.env.example` and docs as clearly marked non-production placeholders.

### 3) Insecure defaults are embedded in compose/dev docs
- Docker Compose and code use fallback MQTT password `cardiosense123` and enable demo mode by default.
- This is okay for local development but dangerous if reused in shared/staging environments.

**Suggestion**
- Fail fast when secure environment variables are missing in non-local environments.
- Set `ENABLE_DEMO_MODE=false` by default outside local profile(s).
- Add an explicit `docker-compose.override.yml` for local/demo values.

### 4) Branding and naming drift
- Codebase uses both `AscultiCor`, `CardioSense`, and `SONOCARDIA AI` labels.
- This can confuse users and reduce trust.

**Suggestion**
- Pick one canonical product name and enforce it in UI strings, API messages, docs, and seed/demo content.

### 5) Security documentation and implementation gap
- SECURITY.md exists, but there is no obvious automated check enforcing sensitive-data hygiene.

**Suggestion**
- Add pre-commit/CI checks:
  - secret scanning (e.g., gitleaks)
  - dependency audit (npm/pip)
  - SAST baseline for Python/TypeScript

## Suggested short-term roadmap (1–2 sprints)

1. **Stabilize developer experience**
   - Fix lockfile drift.
   - Add a `make verify` / npm + python equivalent one-command validation.
2. **Secure-by-default hardening**
   - Remove personal/example secrets from comments and docs.
   - Split local vs non-local config defaults.
3. **Consistency pass**
   - Normalize naming/branding.
   - Align README, Supabase docs, and seed comments.
4. **Quality gates in CI**
   - Enforce `npm ci`, lint, tests, type checks, Python checks, and secret scanning.

## Validation commands used for this review

- `rg --files`
- `npm test -- --runInBand` (failed: `jest` missing before install)
- `npm ci` (failed: lockfile mismatch)
- `python -m compileall inference/app` (passed)
- `rg -n "TODO|FIXME|HACK|XXX|cardiosense123|admin123|ENABLE_DEMO_MODE|demo mode" ...`
