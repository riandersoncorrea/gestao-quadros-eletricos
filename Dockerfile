# Build portátil da SPA (Vite/React) para hospedagem em contêiner — ex.:
# Azure App Service (Web App for Containers) ou outra infraestrutura
# corporativa. Não substitui o deploy atual (GitHub Pages via
# .github/workflows/deploy-pages.yml, Netlify via painel próprio) — é uma
# terceira opção, em paralelo.

# ---- build ------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Mesmas duas variáveis já usadas no build do GitHub Pages (ver
# .github/workflows/deploy-pages.yml) — valores públicos por design (ficam
# no bundle do cliente), nunca a service role key. Passadas via
# --build-arg ou docker-compose (ver docker-compose.yml).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

RUN npm run build

# ---- runtime ------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
