# Dockerfile para despliegue productivo de BDV Digital (Node.js + Express + Vite)
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run lint
RUN npm run build

# Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Instalar tsx para ejecutar server.ts en runtime si no está en dependencias de producción
RUN npm install tsx -g

EXPOSE 3000

USER node

CMD ["tsx", "server.ts"]
