import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { parseBackup } from './backup-validation.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/validate-local-backup.mjs <atlas-backup.json>');
  process.exit(2);
}

const raw = await fs.readFile(file, 'utf8');
const { data, counts } = parseBackup(raw);
const checksum = crypto.createHash('sha256').update(raw).digest('hex');
console.log(JSON.stringify({ status: 'VALID', schemaVersion: data.schemaVersion, checksum, counts }, null, 2));
