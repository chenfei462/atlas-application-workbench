# LocalStorage/database migration

For initial setup and the Chinese workflow, see the [repository README](../../README.md), [personal guide](../../个人使用说明.md), and [local development](local-development.md). Preserve an original private backup before confirming any import. Uploaded file bytes and browser writing briefs have separate backup procedures in [backup and restoration](backup-restore.md).

`buildImportPlan(raw, ownerId)` accepts legacy schema 1/2 or portable schema 3 (`tables`). `importBackup(client, raw)` requires a verified signed-in user, archives the exact UTF-8 input bytes in private `application-documents/<owner>/imports/<sha256>/source.json`, downloads and hashes that archive, then calls the authenticated transaction. The importer does not modify or clear LocalStorage. It uses no service-role credential.

## Mapping

Universities are deduplicated by legacy universityId, programs and nested applicationRounds become catalog rows, each round sourceUrl and sourceRecords become sources/source_assertions, requiredDocuments become material requirements, testRequirements and essayRequirements become their own requirement rows, recommendationRequirement becomes its normalized count row. Applications reference their program and round; nested portal.sections, submission and decision become execution rows. Materials, explicit materialVersions, evidence, essays, explicit essayVersions, recommenders/requests, tasks, inbox and decisions map to their dedicated tables. currentVersionId is checked against the essay and mapped to current_version_number. Legacy timestamps map to timestamp columns, dueDate to date or due_at as appropriate. Chinese 秋季/授课型/研究型 map to FALL/TAUGHT/RESEARCH. Exact round deadlines retain a valid provided IANA timezone and local wall clock, including fractional seconds. An explicit-offset timestamp lacking timezone metadata is converted to UTC; a naive exact timestamp lacking both offset and timezone is rejected. Naive local timestamps with an IANA timezone are calendar-validated and round-tripped through the zone independently of the machine timezone; nonexistent DST gap times and ambiguous fold times are rejected instead of guessed. An explicit offset must agree with the provided zone. Unknown deadlines remain UNKNOWN_TIME.

`evidence_material_links` preserves proofMaterials; `material_application_links` preserves linkedApplications independently of a program requirement. These two joins fill real legacy relationship gaps without inventing a requirement or a material version. Explicit application materialLinks with requirementId/materialVersionId map to application_materials. Essay-level evidenceIds map to the dedicated essay_evidence_items join, including essays with no versions/current pointer. Each explicit version's evidenceIds independently maps to essay_evidence_links; neither relationship fabricates an immutable version or changes historical associations. Legacy material.version does not fabricate an immutable version when no materialVersions row existed.

Every unknown or unrepresented per-record field is listed in warnings and preserved in the original source archive. After migration014, known tuition, applicationFee, region/country, tags, academic/language requirement prose, derived display status/readiness, material issued/expiry/verification/fileReference/variant/version, essay notes/prompts/word limits, recommendation required and version notes have explicit columns. Unknown local permission/display preferences, future fields and legacy auditLog still remain recoverable in the original source with named warnings. Original auditLog is never inserted as a forged authenticated audit event. Binary files are not embedded in legacy metadata and cannot be reconstructed from a fileReference; explicit file backups must be restored separately. Storage paths in portable material versions need their own matching file manifest/restoration workflow.

This is byte-lossless source archival plus normalized migration, **not a claim that every legacy field has a queryable database column**. The archive and import_batches warnings/id_map expose recoverability and these limits. Do not delete the local source after importing; keep a downloaded backup independently.

## Transaction and conflicts

IDs derive from SHA-256 of `[atlas-import-v1, owner UUID, table, legacy ID]`, with UUID version/variant bits. Identical owner/table/legacy IDs always map identically; another owner receives different IDs. Portable exports use the same mapping and rewrite all supported foreign keys to the current owner. A single portable profile maps to the currently authenticated actor.id, never the source owner. Existing conflicting profile edits fail safely. Operational import batches and audit history are archived, not replayed.

The RPC is SECURITY INVOKER, requires auth.uid(), checks every owner, accepts only an exact table/column allowlist, locks the owner's import lane and verifies persisted counts. Existing rows are compared using only payload fields after PostgreSQL type normalization; conflicts or missing rows from a repeated completed batch fail without any overwrite. All checks and insertions execute in one transaction. Foreign-key, enum, uniqueness or late checks roll back business rows and batch changes; the independent original archive remains available for recovery. COMPLETED is written only after count/reference checks. Repeated unchanged imports return repeated=true. A changed backup with conflicting legacy IDs fails and requires an explicit merge decision outside this importer.

## Verification

Run `npx tsx --test tests/import-plan.test.ts` and `npx tsx scripts/test-import-sdk.mjs` after migrations011/013/014/015 are applied. The SDK script refuses any URL except Atlas local `http://127.0.0.1:55421`, generates disposable fake users and removes them/archive objects, and tests nested import, idempotency, exact source bytes, owner isolation, contradictory history, late rollback, owner spoof, remote edits and portable restoration. Admin credentials are restricted to this local test setup/cleanup and are absent from browser importer code.

## Forward migration correction (2026-10-11)

The SDK repeat test exposed PostgreSQL timestamp normalization (`+08:00` source vs UTC database representation). The correction now lives in forward migration013 and has been applied through `supabase migration up --local`, so migration history records the fix. Migration011 remains the original applied definition. During development the function was briefly updated directly through local psql before the user restriction was relayed to this subtask; the recorded forward migration corrects that workflow and is the authoritative reproducible change. No user records or remote database were accessed by these tests.


## Explicit legacy semantic columns (forward migration014)

| Legacy data | Database columns |
| --- | --- |
| program tuition/applicationFee/tags | programs.tuition_text/application_fee_text/tags |
| academicRequirements/languageRequirements/region/country/applicationStatus | programs.academic_requirements_text/language_requirements_text/region_text/country_text/legacy_application_status |
| original university country | universities.country_text; country_code only from explicit known country text (中国→CN, 新加坡→SG) |
| application languageRequirementMet/readinessScore and portal payment/submission status | applications.language_requirement_met/legacy_readiness_score/portal_payment_status/portal_submission_status |
| material issuedAt/expiresAt/verified/fileReference/variant/version | materials.issued_at/expires_at/verified/legacy_file_reference/variant/legacy_version_number |
| essay prompt/wordLimit/notes | essays.prompt/word_limit/notes |
| materialVersion/essayVersion notes | material_versions.notes / essay_versions.notes |
| recommendationRequest required | recommendation_requests.required |
| round status/verifiedAt | application_rounds.legacy_status/verified_at |
| portal section title/label | portal_sections.label |

The local file reference remains original metadata text; an object value is JSON-encoded into that dedicated text column. It is never fabricated as a valid private Storage path. Original legacy display version is retained even when no immutable material version exists. Original readiness/status snapshots are retained separately from computed live values. Byte archives and all unknown fields remain downloadable through import_batches.archive_path in the private bucket, and portable backup manifests should include those referenced source objects alongside normal document objects.


## Reference hardening (forward migration015)

Every explicit legacy sourceRecords.applicationRoundId, requirement.sourceId (material/test/essay/recommendation) and essay.programEssayRequirementId is mapped to its relational foreign key. Missing targets fail planning before upload. Portable current_version_number must identify a version belonging to that exact essay. The deferred owner/essay/version composite FK essays_current_version_fk enforces this for direct database writes, protects deletion of a current version and permits independent historical-version deletion. Parent-first importer transactions and atomic save_essay_version remain valid. The import RPC forces a deferred-reference check before marking COMPLETED. Essay/account cascade deletion remains supported.

`essay_evidence_items` has owner-scoped RLS plus owner/essay/evidence composite FKs; portable imports and exports include it as a regular business table. It preserves essay-level evidence when no immutable version exists. Run `npx tsx scripts/test-import-version-integrity.mjs` for actual SDK invalid pointer, current-target deletion, historical deletion, atomic save and account-cascade coverage. The full SDK importer suite additionally verifies bypassing the planner with a forged current pointer fails transactionally and leaves parents/batches uncommitted, and that another owner cannot read or insert these evidence associations. Deadline regression tests pass under UTC, Pacific/Honolulu and Asia/Tokyo host environments.
