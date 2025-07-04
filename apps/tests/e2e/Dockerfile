FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY apps/tests/e2e/package.json ./
COPY apps/tests/e2e/tsconfig.json ./
COPY apps/tests/e2e/vitest.config.e2e.mts ./

# Copy base tsconfig
COPY tsconfig.base.json /tsconfig.base.json

# Copy shared library
COPY libs/shared /libs/shared

# Install dependencies
RUN npm install

# Install vitest globally
RUN npm install -g vitest

# Copy test files
COPY apps/tests/e2e/src ./src

# Run tests  
CMD ["vitest", "run", "--reporter=verbose", "--environment=node", "--testTimeout=60000", "src/*.e2e-spec.ts"] 