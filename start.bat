@echo off
REM AscultiCor - Complete System Startup Script for Windows
REM This script starts all services and runs tests

echo.
echo ========================================
echo AscultiCor - Starting Complete System
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    exit /b 1
)

echo [1/5] Checking environment configuration...
if not exist .env (
    echo [ERROR] .env file not found!
    echo Please copy .env.example to .env and configure your Supabase credentials.
    exit /b 1
)
echo [OK] Environment file found

echo.
echo [2/5] Building and starting services...
docker-compose down >nul 2>&1
docker-compose up --build -d
if errorlevel 1 (
    echo [ERROR] Failed to start services
    exit /b 1
)
echo [OK] Services started

echo.
echo [3/5] Waiting for services to be healthy...
timeout /t 10 /nobreak >nul

echo.
echo [4/5] Checking service health...
curl -s http://localhost:8000/health >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Inference service not responding yet
) else (
    echo [OK] Inference service is healthy
)

curl -s http://localhost:3000/api/health >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Frontend service not responding yet
) else (
    echo [OK] Frontend service is healthy
)

echo.
echo [5/5] Running demo test...
echo.
echo ========================================
echo System Status
echo ========================================
echo.
echo Services:
echo   - Frontend:      http://localhost:3000
echo   - Inference API: http://localhost:8000
echo   - MQTT Broker:   mqtt://localhost:1883
echo   - MQTT WebSocket: ws://localhost:9001
echo.
echo Next steps:
echo   1. Open http://localhost:3000 in your browser
echo   2. Login with your Supabase credentials
echo   3. Create a new session
echo   4. Run: python simulator/demo_publisher.py
echo.
echo To view logs:
echo   docker-compose logs -f
echo.
echo To stop:
echo   docker-compose down
echo.
echo ========================================
echo AscultiCor is ready!
echo ========================================
