# 1. Build fáze
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ARG NEXT_PUBLIC_BUILD_SHA=dev
ENV NEXT_PUBLIC_BUILD_SHA=$NEXT_PUBLIC_BUILD_SHA
ARG NEXT_PUBLIC_BUILD_TIME
ENV NEXT_PUBLIC_BUILD_TIME=$NEXT_PUBLIC_BUILD_TIME

# Stamp the SW cache name with the build SHA so a new deploy invalidates
# all cached assets (icons, logos, precache) for returning clients.
RUN sed -i "s/__BUILD_SHA__/${NEXT_PUBLIC_BUILD_SHA}/g" public/sw.js

RUN npm run build

# 2. Runner fáze (čistý a malý obraz)
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Případně port, pokud ho chceš změnit
ENV PORT=3000

# Kopírujeme jen to nejnutnější pro běh
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]