import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { parseBackup } from './backup-validation.mjs';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/migration-manifest.mjs <atlas-backup.json>'); process.exit(2); }
const raw = await fs.readFile(file, 'utf8');
const { data } = parseBackup(raw);
const checksum = crypto.createHash('sha256').update(raw).digest('hex');
const tableCounts = {
  programs: (data.programs || []).length,
  application_rounds: (data.programs || []).reduce((sum, program) => sum + (program.applicationRounds || []).length, 0),
  applications: (data.applications || []).length,
  materials: (data.materials || []).length,
  material_versions: (data.materialVersions || []).length,
  evidence_items: (data.evidence || []).length,
  essays: (data.essays || []).length,
  essay_versions: (data.essayVersions || []).length,
  recommenders: (data.recommenders || []).length,
  recommendation_requests: (data.recommendationRequests || []).length,
  tasks: (data.tasks || []).length,
  inbox_items: (data.inbox || []).length,
  decisions: (data.decisions || []).length,
  audit_events: (data.auditLog || []).length,
};
console.log(JSON.stringify({ source: 'LOCAL_STORAGE', sourceSchemaVersion: data.schemaVersion, checksum, idempotencyKey: checksum, tableCounts, mode: 'DRY_RUN', message: 'No database connection configured; no records were uploaded.' }, null, 2));
