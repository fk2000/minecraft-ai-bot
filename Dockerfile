FROM node:22.23.4-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.node.json ./
RUN npm ci
COPY src/bot ./src/bot
COPY src/jev ./src/jev
RUN npm run build:container

FROM node:22.23.4-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 10000
CMD ["node", "dist/bot/app.js"]
