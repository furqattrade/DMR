#!/bin/bash


set -e

echo "🧪 Running E2E Tests (Local Mode)..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

echo -e "${YELLOW}📊 Checking service status...${NC}"
docker-compose -f "${PROJECT_ROOT}/docker-compose.e2e.yml" ps

# Navigate to test directory
cd "${PROJECT_ROOT}/apps/tests/e2e"

echo -e "${YELLOW}🧪 Running E2E Tests...${NC}"

# Set environment variables and run tests
RABBITMQ_MANAGEMENT_URL=http://localhost:8072 \
DMR_SERVER_1_URL=http://localhost:8075 \
DMR_SERVER_2_URL=http://localhost:8076 \
DMR_AGENT_A_URL=http://localhost:8077 \
DMR_AGENT_B_URL=http://localhost:8078 \
EXTERNAL_SERVICE_A_URL=http://localhost:8073 \
EXTERNAL_SERVICE_B_URL=http://localhost:8074 \
npx --yes pnpm@latest test

echo -e "${GREEN}✅ E2E Tests completed!${NC}" 