# Atlas local database development

This workspace uses Node.js 24, npm, Docker Desktop (Linux containers), TypeScript/Vite, and local Supabase. The CLI is pinned to 2.120.0 in package-lock.json. The active frontend reads and writes through Supabase; LocalStorage retains owner-scoped essay drafts, writing briefs and the untouched legacy migration source. Local services do not configure a production project. The Chinese quick start is in the [repository README](../../README.md).

## Start and verify

From the package root:

```powershell
npm ci
npm run db:start
npm run configure:local
npm run dev
```

Open `http://127.0.0.1:4189/outputs/index.html`. On first use, create a personal account with your own display name, email and a password of at least 12 characters; no shared account is provided. `configure:local` reads local service settings and writes only public browser configuration to the ignored `.env.local`. Run through Vite so TypeScript and client environment variables are available. Windows users can run `npm ci` once, then use the root launch/stop/backup `.cmd` files.

Applicable verification commands, from a separate terminal:

```powershell
npm test
npm run test:db
npm run test:integration
npm run db:types
npm run typecheck
npm run check
```

Local API: http://127.0.0.1:55421. Local email viewer: http://127.0.0.1:55424. PostgreSQL port: 55422. Project ID: `atlas-local-01a12938`. These ports isolate Atlas from other projects. The stack runs Auth, PostgREST, PostgreSQL 17 and private Storage. Studio, realtime, vector, edge runtime and analytics are not needed. Do not deploy this local config as production config: local test email confirmation is disabled.

`npm run db:stop` stops Atlas and preserves local data. Do not pass `--no-backup`. To apply newly added migrations, run `npm exec -- supabase migration up --local`. Do not reset a database containing user data. The SQL test runner creates and deletes its own random temporary PostgreSQL 15 container; it does not reset this local stack or other Docker services.

The HTTP integration test explicitly accepts only `http://127.0.0.1:55421`. It creates random fake users under `example.invalid`, exercises the normalized application chain, checks owner isolation and private Storage, and deletes its own objects and users. The server-only local service key is read into process memory for test account cleanup. Never put it in the UI. `supabase status` may display local credentials; do not paste its output into public documents.

## Generated types

`npm run db:types` reads the running local schema and writes `types/database.types.ts`. The TypeScript client, repositories, and UI consume generated types; `npm run typecheck` checks their contracts. Regenerate after a schema change and inspect the generated changes before integrating them.

## Database backup and restoration

`npm run test:db` automatically runs `pg_dump --no-owner --no-privileges`, restores into a separate database inside its disposable test container, and compares all public table rows, constraint definitions and RLS policies. This proves migration and SQL-data recoverability using mock Auth and Storage schemas. Production role/extension/Storage-object restoration is a separate gate.

For a local backup of this actual stack, use `docker exec supabase_db_atlas-local-01a12938 pg_dump -U postgres --format=custom --file=/tmp/atlas-local.dump postgres`, then `docker cp supabase_db_atlas-local-01a12938:/tmp/atlas-local.dump work/atlas-local.dump`. Keep dumps private and outside version control. A full dump includes authentication and storage metadata. Restore only into a separate fresh compatible Supabase development environment with the same extensions and roles, using `pg_restore --exit-on-error --no-owner --no-privileges`. Never restore on top of the working database. Validate relationships, owner policies, row counts and samples before switching. The command example for a full real-stack dump is a procedure, not a claim that production recovery has been exercised.

## Storage backup and orphan checks

SQL backups contain object metadata, not the actual file bytes. Use an authenticated server-side maintenance process to export private files separately, with a manifest containing `material_version_id`, `bucket`, `path`, `size_bytes`, `sha256`, `created_at`. Store files and manifest in a private backup destination. For submission receipts also record `submission_id` and receipt path; do not assume every object is a material version.

Compare material, receipt, and import archive references with the complete inventory. Default to reporting; never auto-delete orphans. Durable local bundles are implemented in `scripts/backup.mjs` and verified by `scripts/backup-lib.mjs`; retryable file operations use `MaterialService`. `npm run backup` targets a local CLI/Docker stack. It is not a production backup command.

## LocalStorage data

Download and retain the original backup. The standalone `validate-local-backup.mjs` and `migration-manifest.mjs` validate schema v2 without importing it. The active UI and `src/migration/index.ts` separately support legacy normalization and portable database payloads through the tested importer.

The standalone manifest is a dry run. The active importer implements preview, original backup, owner-scoped UUID mapping, transaction, idempotency, and readback. SDK tests use synthetic data only. Preserve `atlas-store-v2`; a dry run alone never authorizes deleting it.

## Production scope

The production project and hosting target are unconfigured. A hosted release needs separate environment, migration, Auth, RLS, private Storage and backup/restore validation. Local services and tests do not establish production readiness. Publishing the source does not deploy the application. See [remote backup scope](remote-backup.md), [backup and restoration](backup-restore.md), and the [repository overview](../../README.md).

References: [Supabase local workflow](https://supabase.com/docs/guides/local-development/cli-workflows), [generated database types](https://supabase.com/docs/guides/api/rest/generating-types).
