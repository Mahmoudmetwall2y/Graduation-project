#!/bin/bash

# AscultiCor System Test Script
# Validates that all components are working correctly

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}AscultiCor System Test${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

# Check if services are running
echo -e "${BOLD}1. Checking Docker services...${NC}"

if ! docker compose ps | grep -q "Up"; then
    echo -e "${RED}✗ Services not running. Start with: docker compose up${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker services are running${NC}"
echo ""

# Test MQTT broker
echo -e "${BOLD}2. Testing MQTT broker...${NC}"

if docker compose exec -T mosquitto mosquitto_sub -t "\$SYS/#" -C 1 -W 3 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ MQTT broker is accessible${NC}"
else
    echo -e "${RED}✗ MQTT broker test failed${NC}"
    exit 1
fi
echo ""

# Test inference service
echo -e "${BOLD}3. Testing inference service...${NC}"

HEALTH_RESPONSE=$(curl -s http://localhost:8000/health || echo "failed")

if echo "$HEALTH_RESPONSE" | grep -q "healthy\|degraded"; then
    echo -e "${GREEN}✓ Inference service is responding${NC}"
    
    # Parse response
    if echo "$HEALTH_RESPONSE" | grep -q '"demo_mode":true'; then
        echo -e "${YELLOW}  ℹ Demo mode is active (models not loaded)${NC}"
    else
        echo -e "${GREEN}  ℹ Production models loaded${NC}"
    fi
    
    if echo "$HEALTH_RESPONSE" | grep -q '"mqtt_connected":true'; then
        echo -e "${GREEN}  ℹ MQTT connection established${NC}"
    else
        echo -e "${YELLOW}  ⚠ MQTT not connected yet${NC}"
    fi
else
    echo -e "${RED}✗ Inference service health check failed${NC}"
    echo "Response: $HEALTH_RESPONSE"
    exit 1
fi
echo ""

# Test frontend
echo -e "${BOLD}4. Testing frontend...${NC}"

FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")

if [ "$FRONTEND_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ Frontend is accessible${NC}"
else
    echo -e "${RED}✗ Frontend test failed (HTTP $FRONTEND_RESPONSE)${NC}"
    exit 1
fi
echo ""

# Check environment variables
echo -e "${BOLD}5. Checking configuration...${NC}"

if [ -f .env ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
    
    if grep -q "SUPABASE_URL=https://" .env; then
        echo -e "${GREEN}  ℹ Supabase URL configured${NC}"
    else
        echo -e "${YELLOW}  ⚠ Supabase URL not set${NC}"
    fi
    
    if grep -q "SUPABASE_SERVICE_ROLE_KEY=" .env && ! grep -q "SUPABASE_SERVICE_ROLE_KEY=$" .env; then
        echo -e "${GREEN}  ℹ Supabase service key configured${NC}"
    else
        echo -e "${YELLOW}  ⚠ Supabase service key not set${NC}"
    fi
else
    echo -e "${YELLOW}⚠ .env file not found. Copy from .env.example${NC}"
fi
echo ""

# Test simulator dependencies
echo -e "${BOLD}6. Checking simulator dependencies...${NC}"

if python3 -c "import paho.mqtt; import numpy" 2>/dev/null; then
    echo -e "${GREEN}✓ Simulator dependencies installed${NC}"
else
    echo -e "${YELLOW}⚠ Simulator dependencies missing${NC}"
    echo "  Install with: pip install paho-mqtt numpy"
fi
echo ""

# Summary
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}Test Summary${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "${GREEN}✓ All core services are operational${NC}"
echo ""
echo "Next steps:"
echo "1. Ensure Supabase is configured (.env file)"
echo "2. Run migrations in Supabase dashboard"
echo "3. Create seed users"
echo "4. Test with: python3 simulator/demo_publisher.py"
echo ""
echo "View logs: docker compose logs -f"
echo "Stop services: docker compose down"
echo ""
