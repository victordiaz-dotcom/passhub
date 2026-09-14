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
# Default 80 para correr con "docker run -p 80:80" o en una VM/GKE tal
# cual. Cloud Run inyecta su propio PORT (normalmente 8080) al arrancar el
# contenedor, sobreescribiendo este default -- sin tocar nada del lado del
# desplegador.
ENV PORT=80
EXPOSE 80
CMD ["sh", "-c", "sed -i \"s/\\${PORT}/$PORT/g\" /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
