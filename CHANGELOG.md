# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- 🔒 **CRITICAL**: Removed hardcoded MQTT password from firmware (changed from `asculticor123` to `CHANGE_ME_IN_PRODUCTION`)
- 🔒 Added security warnings to firmware configuration section
- 🔒 Implemented rate limiting on all API endpoints (60 req/min general, 5 req/min auth)
- 🔒 Added security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
- 🔒 Enhanced CORS configuration with restricted methods and caching
- 🔒 Added input validation decorators for API endpoints
- 🔒 Enhanced `.env.example` with comprehensive security documentation
- 🔒 Added trusted host middleware for production deployments

### Added

- Added `jest` and testing library dependencies for frontend testing
- Added LLM SDKs (`openai`, `@google/generative-ai`) for AI report generation
- Created `jest.config.js` and `jest.setup.js` for testing configuration
- Added security middleware module (`inference/app/security.py`)
- Added rate limiting functionality with configurable limits

### Changed

- Enhanced `package.json` with test scripts and coverage thresholds
- Updated FastAPI CORS middleware to restrict HTTP methods
- Improved `.env.example` with security warnings and production guidelines

### Fixed

- Fixed firmware security warning comments placement

## [1.0.0] - 2024-02-16

### Added

- Initial release of AscultiCor cardiac monitoring platform
- Next.js 14 frontend with real-time waveform visualization
- FastAPI inference service with ML model integration
- MQTT broker (Mosquitto) for IoT device communication
- Supabase integration for database and authentication
- ESP32 firmware for ECG and PCG signal acquisition
- Docker Compose configuration for local development
- Row-Level Security (RLS) policies for multi-tenant data access
- Demo mode for testing without ML models
- WebSocket support for real-time updates
- Dark mode and responsive UI design
- Device telemetry monitoring (battery, temperature, WiFi signal)

### Features

- Real-time ECG and PCG waveform visualization
- AI-powered cardiac signal classification
- Multi-tenant organization support
- LLM-generated clinical reports
- Mobile-responsive dashboard
- Docker-based deployment
- Hardware timer-based signal sampling (500Hz ECG, 22050Hz PCG)

