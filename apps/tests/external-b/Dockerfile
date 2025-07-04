FROM node:22.16.0-alpine

WORKDIR /app

# Copy package files
COPY apps/tests/external-b/package.json ./
COPY apps/tests/external-b/tsconfig*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY apps/tests/external-b/src ./src

# Build the application
RUN npm run build

EXPOSE 3002

CMD ["npm", "start"] 