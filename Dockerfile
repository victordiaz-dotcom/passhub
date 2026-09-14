# Etapa 1: build
FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Etapa 2: servidor estático
# nginx:alpine trae util-linux (4 CVEs High, no lo usa nginx) — la variante
# "slim" no lo incluye, mismo nginx/mismo comportamiento.
FROM nginx:1-alpine-slim AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
