# Atlas 数据库与文件

当前前端使用 `src/main.ts`、Vite 和本机 Supabase。PostgreSQL 保存结构化申请数据与正文历史版本，私有 Storage 保存上传文件；LocalStorage 保存未保存正文、写作简报及保留的旧版迁移来源。

## 当前状态

仓库包含 15 个历史迁移、生成的数据库类型、账号隔离策略、导入与备份工具及本地检查。当前用于本机个人工作台，未配置托管生产项目。安装与启动见 [仓库 README](../../README.md) 和 [本地开发](local-development.md)。

## Architecture

- PostgreSQL is the source of truth for structured application data.
- Supabase Auth supplies `auth.uid()`; every private row carries `owner_id`.
- Supabase Storage bucket `application-documents` is private.
- Migration files are ordered and immutable under `supabase/migrations/`.
- The active importer previews and backs up original data, performs owner-scoped transactional import, and validates readback. Browser drafts and writing briefs remain separate from database data.

## Tables and relationships

- `profiles` belongs one-to-one to `auth.users`.
- `universities` contain owner-scoped school records; `programs` belong to a university.
- `application_rounds` belong to programs and store date, optional time, timezone, and precision separately.
- `sources` and `source_assertions` record where deadline and requirement facts came from.
- `applications` belong to a program; normalized requirement tables describe materials, tests, essays, and recommendations.
- `materials` and `material_versions` hold metadata and immutable version history; `application_materials` links versions to applications.
- `evidence_items`, `essays`, `essay_versions`, and `essay_evidence_links` support traceable writing.
- `recommenders` and `recommendation_requests` track recommendation workflow.
- `portal_sections`, `submissions`, `tasks`, `inbox_items`, and `decisions` support execution.
- `audit_events` and `import_batches` preserve operational history.

## Migration order

1. `202610110001_foundation.sql` — extension, helper functions, profiles.
2. `202610110002_catalog.sql` — universities, programs, rounds, sources.
3. `202610110003_applications_requirements.sql` — applications and requirements.
4. `202610110004_materials_writing.sql` — materials, evidence, writing, recommendations.
5. `202610110005_execution.sql` — portal, submissions, tasks, inbox, decisions, audit/import.
6. `202610110006_security.sql` — private Storage bucket and RLS policies.
7. `202610110007_indexes.sql` — owner, status, deadline, and action queue indexes.
8. `202610110008_owner_integrity.sql` — composite owner-aware foreign keys.
9. `202610110009_integrity_hardening.sql` — program identity constraints, deadline precision/timezones, immutable version updates, private metadata paths, protected automatic audit events.
10. `202610110010_audit_account_cascade.sql` — safe audit behavior during account deletion.
11. `202610110011_import_transaction.sql` — transactional owner-scoped import.
12. `202610110012_integrated_writes.sql` — atomic essay version and submission writes.
13. `202610110013_import_type_normalization.sql` — imported type normalization.
14. `202610110014_import_legacy_semantics.sql` — preservation of legacy field meaning.
15. `202610110015_import_reference_integrity.sql` — imported references and essay-level evidence.

Apply `supabase/tests/000_mocks.sql` first only in the local PostgreSQL test harness. `supabase/seed.sql` creates clearly fake demo records and is never a substitute for importing real data.

## Security rules

- All private public tables have owner-based SELECT/INSERT/UPDATE/DELETE policies.
- Storage object paths must start with the authenticated user UUID, for example `<user-uuid>/applications/<application-uuid>/document.pdf`.
- No `service_role` credential belongs in browser code. Maintenance credentials stay in server-only process configuration.
- Private files, backups and test credentials are runtime data, not repository content. Uploading source to GitHub does not copy local accounts or files.

## Backup and migration

Use the active UI's data-and-backup view to preview legacy/portable JSON, retain the original download, confirm import, and verify resulting counts and relationships. Standalone validation and manifest tools are dry runs; they do not replace the transactional UI import. Preserve the original source and never clear it automatically. See [migration import](migration-import.md).

Database JSON does not include uploaded file bytes, browser writing briefs or unsaved drafts. Use [complete backup and isolated restoration](backup-restore.md) for database/file data, and export browser content separately. [Remote backup tooling](remote-backup.md) needs explicit server configuration and does not configure or deploy production.
