---
name: artillery-scenario
description: Use when writing or running Artillery API smoke tests or load tests for FCP, so scenarios target the capacity numbers from the system design (150 rps read p99<300ms, write p99<500ms, publish fan-out without DLQ growth, auth/RBAC cache-first). Trigger on "load test", "artillery", "performance test", "smoke test the API".
---

# Skill: Artillery API + load testing (FCP)

## When to use
Authoring `test/load/*.yml`, or running smoke/load tests for endpoints.

## Targets (from the System Design NFRs)
| Scenario | Load | Pass criteria |
|---|---|---|
| Read-heavy dashboard | 150 rps steady, burst 600 | p99 < 300 ms |
| Write path (post create/update) | ~5 wps, burst ~30 | p99 < 500 ms |
| Scheduled-publish fan-out | burst publish + events | no DLQ growth; consumers keep up |
| Auth + RBAC guard | 20-50x write rate | cache-first p99 < 300 ms |

## Layout
```
test/load/
  smoke.yml            # 1-2 rps, asserts 2xx + schema — runs in CI
  read-dashboard.yml   # ramp to 150 rps
  write-posts.yml      # write path
  publish-fanout.yml   # publish + observe DLQ depth
  reports/             # JSON/HTML output (gitignored)
```

## Commands (pnpm)
```
pnpm artillery run test/load/smoke.yml
pnpm artillery run test/load/read-dashboard.yml -o test/load/reports/read.json
pnpm artillery report test/load/reports/read.json
```

## Conventions
- Auth: acquire a Clerk test JWT in a `before` hook; pass as Bearer.
- Use `ensure`/`expect` plugins to assert p99 thresholds so a regression fails CI.
- Parameterise base URL and token via env (`$processEnvironment`).
- Never hard-code real secrets; use a dedicated test workspace.
- smoke.yml must stay fast (< ~30s) so it can gate every PR.

## Skeleton (read-dashboard.yml)
```yaml
config:
  target: "{{ $processEnvironment.API_URL }}"
  phases:
    - { duration: 60, arrivalRate: 10, rampTo: 150, name: "ramp" }
    - { duration: 120, arrivalRate: 150, name: "sustain" }
  ensure:
    p99: 300
  defaults:
    headers:
      authorization: "Bearer {{ $processEnvironment.TEST_JWT }}"
scenarios:
  - name: "workspace dashboard read"
    flow:
      - get: { url: "/api/v1/workspaces?pageSize=20" }
      - get: { url: "/api/v1/posts?workspaceId={{ workspaceId }}" }
```
