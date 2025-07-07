#!/bin/bash

# Script to run E2E tests locally (assumes services are already running)

set -e

echo "🧪 Running E2E Tests (Local Mode)..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📊 Checking service status...${NC}"
docker-compose -f docker-compose.e2e.yml ps

# Navigate to test directory
cd apps/tests/e2e

echo -e "${YELLOW}🧪 Running E2E Tests...${NC}"

# Set environment variables and run tests
NODE_ENV=test \
RABBITMQ_MANAGEMENT_URL=http://localhost:15672 \
RABBITMQ_USER=user \
RABBITMQ_PASS=pass \
DMR_SERVER_1_URL=http://localhost:5000 \
DMR_SERVER_2_URL=http://localhost:5000 \
DMR_AGENT_A_URL=http://localhost:5010 \
DMR_AGENT_B_URL=http://localhost:5011 \
EXTERNAL_SERVICE_A_URL=http://localhost:8001 \
EXTERNAL_SERVICE_B_URL=http://localhost:8002 \
npm test

echo -e "${GREEN}✅ E2E Tests completed!${NC}"