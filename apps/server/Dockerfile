FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

COPY apps/server/package.json ./apps/server/

COPY packages ./packages

RUN npm ci --workspace=@gsdesk/server --include-workspace-root

COPY apps/server ./apps/server

COPY apps/worker ./apps/worker

ENV PORT=8787

ENV GSDESK_DATA=/data

EXPOSE 8787

CMD ["npx", "tsx", "apps/server/src/index.ts"]

