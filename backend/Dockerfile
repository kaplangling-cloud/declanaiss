# ---------- Build ----------
# Node 24 (LTS) : la CLI NestJS 12 exige Node >= 22.22.3 ; l execution d une app v12, >= 20.19
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npx tsc -p tsconfig.seed.json && npm prune --omit=dev

# ---------- Runtime ----------
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production TZ=Africa/Douala
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/* \
  && groupadd -r app && useradd -r -g app -d /app app \
  && mkdir -p /var/lib/declanaiss/storage && chown -R app:app /var/lib/declanaiss
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/package.json ./
COPY --chown=app:app docker-entrypoint.sh ./
USER app
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
# Migrations (jamais de reset, avec nouvelles tentatives si la base demarre
# encore) puis demarrage de l'API. Lance par `sh` : le bit d'execution du
# fichier n'est pas garanti selon le systeme de fichiers d'ou il est copie.
CMD ["sh", "docker-entrypoint.sh"]
