FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY packages ./packages
RUN npm ci --workspace=@clouddesk/server --include-workspace-root
COPY --from=build /app/apps/web/dist ./web
COPY apps/server ./apps/server
COPY apps/worker ./apps/worker
ENV PORT=8787
ENV CLOUDDESK_DATA=/data
ENV CLOUDDESK_WEB_ROOT=/app/web
EXPOSE 8787
CMD ["npx", "tsx", "apps/server/src/index.ts"]
