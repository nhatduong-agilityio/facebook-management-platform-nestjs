# ─── Stage 1: Install workspace dependencies ──────────────────────────────────
FROM node:25-alpine AS deps
WORKDIR /app
RUN apk add --no-cache git && npm install -g pnpm@10

# Copy workspace manifests first to maximise layer cache reuse.
# Only re-runs `pnpm install` when lockfile or a package.json changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY apps/api/package.json                  apps/api/
COPY services/analytics/package.json        services/analytics/
COPY services/audit/package.json            services/audit/
COPY services/billing/package.json          services/billing/
COPY services/email/package.json            services/email/
COPY services/notification/package.json     services/notification/
COPY services/search/package.json           services/search/

COPY libs/analytics-contracts/package.json  libs/analytics-contracts/
COPY libs/audit-contracts/package.json      libs/audit-contracts/
COPY libs/billing-contracts/package.json    libs/billing-contracts/
COPY libs/constants/package.json            libs/constants/
COPY libs/rmq-options/package.json          libs/rmq-options/

RUN git init && HUSKY=0 pnpm install --frozen-lockfile

# ─── Stage 2: Build all packages ──────────────────────────────────────────────
FROM deps AS builder
# typescript must be globally available so libs without their own typescript devDep
# (e.g. @fcp/constants) can run `tsc` in their build script.
RUN npm install -g typescript@5
COPY . .
# Builds libs first (pnpm respects dependency order), then all services.
RUN pnpm -r build

# ─── Stage 3: Lean production runner ──────────────────────────────────────────
FROM node:25-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy the built workspace — node_modules (hoisted) + dist outputs for every service.
COPY --from=builder /app/node_modules           ./node_modules
COPY --from=builder /app/package.json           ./package.json
COPY --from=builder /app/pnpm-workspace.yaml    ./pnpm-workspace.yaml

# Migration helper — called by the migration container on every deployment.
COPY --from=builder /app/scripts                ./scripts

COPY --from=builder /app/apps/api/dist          ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules  ./apps/api/node_modules

COPY --from=builder /app/services/analytics/dist         ./services/analytics/dist
COPY --from=builder /app/services/audit/dist             ./services/audit/dist
COPY --from=builder /app/services/billing/dist           ./services/billing/dist
COPY --from=builder /app/services/email/dist             ./services/email/dist
COPY --from=builder /app/services/notification/dist      ./services/notification/dist
COPY --from=builder /app/services/search/dist            ./services/search/dist

# Per-service node_modules (non-hoisted extras, if any).
COPY --from=builder /app/services/analytics/node_modules    ./services/analytics/node_modules
COPY --from=builder /app/services/audit/node_modules        ./services/audit/node_modules
COPY --from=builder /app/services/billing/node_modules      ./services/billing/node_modules
COPY --from=builder /app/services/email/node_modules        ./services/email/node_modules
COPY --from=builder /app/services/notification/node_modules ./services/notification/node_modules
COPY --from=builder /app/services/search/node_modules       ./services/search/node_modules

# Lib compiled output — pnpm links @fcp/* via service-local node_modules symlinks that
# resolve to libs/*. Node.js needs package.json (for the "main" field) + the dist/ JS.
COPY --from=builder /app/libs/constants/package.json            ./libs/constants/package.json
COPY --from=builder /app/libs/constants/dist                    ./libs/constants/dist
COPY --from=builder /app/libs/rmq-options/package.json          ./libs/rmq-options/package.json
COPY --from=builder /app/libs/rmq-options/dist                  ./libs/rmq-options/dist
# rmq-options has runtime deps (@nestjs/microservices, @nestjs/config, @fcp/constants) that pnpm
# installs in lib-local node_modules. Node resolves from the real path of the file, so it walks
# up from /app/libs/rmq-options/dist/ — without this dir it never reaches root node_modules.
COPY --from=builder /app/libs/rmq-options/node_modules          ./libs/rmq-options/node_modules
COPY --from=builder /app/libs/analytics-contracts/package.json  ./libs/analytics-contracts/package.json
COPY --from=builder /app/libs/analytics-contracts/dist          ./libs/analytics-contracts/dist
COPY --from=builder /app/libs/audit-contracts/package.json      ./libs/audit-contracts/package.json
COPY --from=builder /app/libs/audit-contracts/dist              ./libs/audit-contracts/dist
COPY --from=builder /app/libs/billing-contracts/package.json    ./libs/billing-contracts/package.json
COPY --from=builder /app/libs/billing-contracts/dist            ./libs/billing-contracts/dist

# Default entrypoint is the API gateway; docker-compose overrides CMD per service.
CMD ["node", "apps/api/dist/main.js"]
