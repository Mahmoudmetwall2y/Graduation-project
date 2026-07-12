# Contributing to AscultiCor

AscultiCor combines firmware, web, data, infrastructure, and machine-learning components. Keep changes focused, documented, and independently verifiable.

## Development Workflow

1. Create a branch from the latest `main`.
2. Configure local secrets from `.env.example`; never commit `.env` or credentials.
3. Make the smallest coherent change and update affected documentation.
4. Run the checks for every component you changed.
5. Open a pull request describing the motivation, implementation, verification, and any deployment or migration steps.

Suggested branch names include `feat/device-provisioning`, `fix/session-finalization`, and `docs/deployment-guide`.

## Verification

### Frontend

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

### Inference service

```bash
cd inference
python -m pip install -r requirements.txt
python -m pytest
python -m compileall app
```

### Simulator

```bash
cd simulator
python -m pip install -r requirements.txt
python -m pytest
```

## Pull Request Checklist

- No secrets, patient information, environment files, Terraform state, or temporary artifacts are included.
- Database changes are represented by a new ordered migration and have appropriate RLS policies.
- API, MQTT, and serial-contract changes remain backward compatible or are documented.
- Medical-facing text does not present prototype predictions as a clinical diagnosis.
- Tests and documentation cover the changed behavior.

## Commit Style

Use clear, imperative commits. Conventional prefixes such as `feat:`, `fix:`, `docs:`, `test:`, and `chore:` are encouraged.

## Security Issues

Do not open a public issue for a vulnerability or exposed credential. Follow [SECURITY.md](SECURITY.md).
