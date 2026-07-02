# ClassSphere SaaS

Delivery 4 upgrades the platform from the original multi-tenant command center into a production lesson-authoring and storage slice:

- tenant-aware authentication with refresh tokens, device tracking, and audit logging
- lesson studio APIs for lesson CRUD, block ordering, version cloning, template publishing, template instantiation, and autosave snapshots
- persistent lesson revision history with restore workflows and editor presence tracking
- MinIO / S3-compatible lesson asset storage with signed uploads, proxy uploads, and secure download URLs
- live classroom APIs for scheduling, join codes, and teacher runtime dashboards
- quiz engine APIs with automatic grading, attempt persistence, and analytics
- behaviour and rewards APIs with summaries and student timelines
- parent portal overview with attendance, quiz performance, behaviour signals, rewards, badges, achievements, and rule-based insights
- secure communications APIs for message threads, announcements, stories, and notification delivery
- persisted operational reporting for tenant, teacher, student, parent, and platform-owner workflows
- tenant feature flag management with role-aware flag evaluation
- support desk workflows with SLA-backed tickets, assignment, internal comments, and status transitions
- billing operations with usage snapshots, draft invoice generation, and revenue overview endpoints
- a richer web command dashboard plus a dedicated `/studio` workspace for lesson authoring
- seeded demo data for `system` and `aurora-high` tenants, including a reusable Bell Ringer template

## Quick start

1. Install pnpm 9+
2. Copy `apps/api/.env.example` to `apps/api/.env`
3. Start infrastructure:
   - `docker compose up -d postgres redis minio`
4. Install dependencies:
   - `pnpm install`
5. Generate the Prisma client:
   - `pnpm --filter @classsphere/api prisma:generate`
6. Apply the database migration:
   - `pnpm --filter @classsphere/api exec prisma migrate deploy`
7. Seed the platform:
   - `pnpm --filter @classsphere/api prisma:seed`
8. Start the apps:
   - `pnpm dev`
9. Open the workspaces:
   - `http://localhost:3000/dashboard`
   - `http://localhost:3000/studio`

## Storage configuration

The API now expects S3-compatible storage variables. The provided docker compose file is already wired to MinIO.

- `STORAGE_ENDPOINT`
- `STORAGE_REGION`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_FORCE_PATH_STYLE`

On boot, the API ensures that the configured bucket exists.

## Seeded accounts

Default password for all seeded demo users:

- `ChangeMe12345!`

Platform tenant:

- tenant: `system`
- platform owner: `owner@classsphere.local`

School tenant:

- tenant: `aurora-high`
- school admin: `admin@aurora.local`
- vice principal: `vp@aurora.local`
- teacher: `teacher@aurora.local`
- co teacher: `coteacher@aurora.local`
- student: `student@aurora.local`
- parent: `parent@aurora.local`
- finance: `finance@aurora.local`

## Delivery focus

Delivery 5 extends the lesson authoring foundation with platform operations: feature flags, support desk workflows, usage metering, and draft billing artifacts. The next delivery should continue with realtime classroom orchestration, desktop monitoring services, BullMQ-backed background jobs, and deeper observability.