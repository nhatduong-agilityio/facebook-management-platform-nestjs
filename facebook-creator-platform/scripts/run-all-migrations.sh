#!/usr/bin/env sh
# Run all Postgres schema migrations in dependency order.
# Called by the Docker migration container on every deployment.
# Each script is idempotent — already-applied migrations are skipped.
# Any non-zero exit stops the chain immediately (set -e).
set -e

node apps/api/dist/database/run-migrations.js
node services/billing/dist/database/run-migrations.js
node services/analytics/dist/database/run-migrations.js
node services/notification/dist/database/run-migrations.js
node services/email/dist/database/run-migrations.js
