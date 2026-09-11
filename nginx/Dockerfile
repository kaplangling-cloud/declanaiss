# Construit le frontend (Vite) puis le sert avec Nginx, qui fait aussi
# office de reverse proxy vers l'API. Contexte de build : racine du projet.
FROM node:20-bookworm-slim AS build
WORKDIR /app
ARG VITE_API_URL=/api
ARG VITE_APP_NAME="Declaration de Naissance"
ENV VITE_API_URL=$VITE_API_URL VITE_APP_NAME=$VITE_APP_NAME
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# La configuration est montee par le compose (nginx.conf ou nginx.prod.conf)
EXPOSE 80 443
