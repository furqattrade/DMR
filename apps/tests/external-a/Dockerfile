FROM node:22.16.0-alpine

WORKDIR /app

# Copy package files
COPY apps/tests/external-a/package.json ./
COPY apps/tests/external-a/tsconfig*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY apps/tests/external-a/src ./src

# Build the application
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"] 