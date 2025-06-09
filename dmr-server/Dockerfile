FROM node:22.16-alpine AS base

RUN corepack enable pnpm

FROM base AS dependencies

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS build

WORKDIR /app
COPY . .
COPY --from=dependencies /app/node_modules ./node_modules
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:22.14-alpine AS deploy

WORKDIR /app
COPY --from=build /app/dist/ ./dist/
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./

RUN chown -R node:node /app
USER node

ENV NO_COLOR=true

EXPOSE 3000
CMD [ "npm", "run", "start:prod" ]