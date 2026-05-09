FROM node:20-alpine AS builder

WORKDIR /app

# Контекст збірки — корінь проекту (./), тому шлях до frontend/
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ .

# Відносні URL — проксіюються через nginx всередині контейнера
ENV VITE_API_URL=/api
ENV VITE_WS_URL=/ws

RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM nginx:alpine

# Зібраний SPA зі стадії builder
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx.conf з кореня проекту (з підтримкою Cloudflare Real IP)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
