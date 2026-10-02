FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.node.json ./
RUN npm ci
COPY src/bot/app.ts src/bot/
COPY src/bot/world-command.ts src/bot/
COPY src/bot/behavior.ts src/bot/
COPY src/bot/jev-command.ts src/bot/
COPY src/jev ./src/jev
RUN npm run build:container

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/bot/app.js"]
