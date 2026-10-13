# Explicit source backup and isolated restoration

This optional server-side tool backs up a deliberately configured remote source. The normal workbench remains local; publishing the source does not configure a hosted project or authorize a remote connection. For local use, start with the [repository README](../../README.md) and [local backup instructions](backup-restore.md).

## Commands and target identity

`npm run backup` remains local CLI/Docker tooling. `npm run backup:remote:preflight` parses explicit server environment configuration without making a connection. `npm run backup:remote` reads only that explicit source and writes a new bundle under `backups-remote/`; it never discovers or substitutes the local CLI project.

Required names: `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, and `SUPABASE_DB_SSL_ROOT_CERT`. The DB URL requires the intended project's direct host or session pooler on 5432 and `sslmode=verify-full`. Supply a matching PostgreSQL client installation using optional absolute `ATLAS_PG_BIN_DIR` when the tools are not on PATH. The root certificate path must be absolute. Passwords can remain in server environment/connection settings; the transport puts them into a temporary pgpass file, never command arguments or a manifest.

Do not place privileged names behind `VITE_`. Browser builds need only their public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Neither frontend configuration nor a Supabase plugin connection supplies the PostgreSQL TLS/client prerequisite automatically.

## Bundle and verification scope

The dump includes `public`, `auth` and `storage` schemas. Public normalized JSON and separately downloaded Storage file bytes carry SHA-256, preserved bucket/path/owner/version and material references. Migration head, PostgreSQL version/major, columns, constraints, indexes, RLS/functions/triggers/policies, bucket security and Auth/Storage counts/content fingerprints are recorded.

Three source snapshots and two file-byte downloads check stability. Source mutation, missing references, invalid paths, file size/hash mismatch, failed download, invalid archive or incomplete inventory cause a FAIL bundle. Operate during a quiet source window; this is not a live PITR implementation. Database archives are decoded without applying SQL during validation. Metadata-only forensic JSON is rejected as a substitute for original file bytes. Import archives must match their import batch checksum. Retention is not automatic in the explicit source engine; `--daily` records the bundle kind and does not delete old bundles.

The source transport sends HTTP GET only, refuses redirects, checks the privileged Storage API even with zero objects, and applies read-only PostgreSQL transaction settings. Errors are static codes, not raw provider stderr. Backups can contain personal data and belong outside source/public deployment output; default backup/runtime directories are ignored by Git and source scans.

## Restore limits

The existing restore CLI accepts an explicit bundle, unique `work/` target/report/credential paths, and only the isolated Atlas restore API 55431 with DB 55432/55442. It verifies real paths, project configuration, source/target major version, schema definitions, columns, constraints, indexes, Auth platform migrations, existing bucket privacy/size/MIME restrictions and target emptiness before any data/file write.

Accounts and identities are restored and checked by complete row-count/content fingerprint; identity owners and every public FK are checked. Files must match content hashes and bucket/path/owner inventory. Source bucket security is checked again afterwards. Extra empty platform buckets are outside the source bucket restoration scope. A synthetic owner's password login is a separate test after exact Auth fingerprint verification; login itself changes Auth metadata, so a later strict fingerprint verify-only may intentionally differ.

**Auth scope is accounts/identities, not all live security/session state.** Sessions, refresh tokens, one-time tokens and Auth audit history are explicitly omitted and reported. Nonempty MFA, OAuth/protection state or other unsupported Auth tables block restoration. Do not bypass that block to move a protected real account. Platform/schema compatibility remains a prerequisite even when migration heads match.

## Validation scope

Source validation has included an isolated PostgreSQL 17/Supabase source with synthetic accounts and private objects, archive inventory/decode, file checksums, an isolated restore and synthetic login. Private bundles, credentials and run reports are intentionally absent from this repository. Reproduce the checks in your own controlled environment using the documented procedures; no retained local result establishes compatibility with a production target.

The platform CLI executable was restored from the same pinned npm 2.120.0 package after it went missing; the downloaded package's SHA-512 matched the lockfile. The interrupted target already held restored data, so the final recovery used guarded `--resume --verify-only`; it did not overwrite or reset those rows. Source and target were stopped by recorded identity after verification; the main local stack was preserved.

Production TLS, actual remote credentials, platform version compatibility, remote backup/restore and real-data canary remain unexecuted. Local success does not sign production readiness.

Official background: [Supabase backup scope](https://supabase.com/docs/guides/platform/backups), [Supabase platform-to-local restoration](https://supabase.com/docs/guides/self-hosting/restore-from-platform), [PostgreSQL TLS verification](https://www.postgresql.org/docs/17/libpq-ssl.html).
