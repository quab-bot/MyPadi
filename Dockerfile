# MyPadi runtime image. Node 22 (buy CLI and the app both require >=22).
# The buy CLI is installed globally and pinned to the version in CLAUDE.md section 2.
FROM node:22-slim

# buy spawns no browser for data APIs, but curl is handy for health checks.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pin the buy CLI (see CLAUDE.md: npm install -g @celo/buy@0.8.5).
RUN npm install -g @celo/buy@0.8.5

WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# App source.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY agent-registration.json agent.json ./

ENV NODE_ENV=production
# The app reads PORT (default 3100). buy keystore lives on a mounted volume.
ENV BUY_HOME=/data/buy-home
EXPOSE 3100

# Run migrations, then start. DATABASE_URL and all secrets come from the environment.
CMD ["sh", "-c", "npm run migrate && npm run start"]
