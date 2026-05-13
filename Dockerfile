FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Build the SQLite database from upstream sources.
# Reference ingest first (CPV / NUTS / thresholds / procedure types / exclusion grounds — hardcoded plus two non-fatal EU CSV fetches).
# Legal ingest next (EU directives + Swiss/Austrian/German national laws).
# Views last (FTS5 + materialised views).
# TED notices are NOT ingested at build time — daily delta is handled by ingest.yml cron post-deploy.
RUN npm run ingest:reference \
 && npm run ingest:legal \
 && npm run ingest:views

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/data ./data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/http-server.js"]
