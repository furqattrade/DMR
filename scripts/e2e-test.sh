#!/bin/bash

set -e

echo "🚀 Starting DMR E2E Tests..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to cleanup
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up containers...${NC}"
    docker-compose -f docker-compose.e2e.yml down --volumes --remove-orphans
    docker system prune -f
}

# Trap cleanup on exit
trap cleanup EXIT

# Build and start services
echo -e "${YELLOW}🔨 Building and starting services...${NC}"
docker-compose -f docker-compose.e2e.yml build --no-cache
docker-compose -f docker-compose.e2e.yml up -d

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
timeout=300
counter=0

while [ $counter -lt $timeout ]; do
    if docker-compose -f docker-compose.e2e.yml ps | grep -q "healthy"; then
        echo -e "${GREEN}✅ All services are healthy!${NC}"
        break
    fi
    
    echo "Waiting for services... ($counter/$timeout)"
    sleep 5
    counter=$((counter + 5))
done

if [ $counter -ge $timeout ]; then
    echo -e "${RED}❌ Services failed to start within timeout${NC}"
    docker-compose -f docker-compose.e2e.yml logs
    exit 1
fi

# Show service status
echo -e "${YELLOW}📊 Service Status:${NC}"
docker-compose -f docker-compose.e2e.yml ps

# Run the tests
echo -e "${YELLOW}🧪 Running E2E Tests...${NC}"
cd apps/tests/e2e
npm test

echo -e "${GREEN}✅ E2E Tests completed successfully!${NC}" 