// Non-Git evidence mode: build a deterministic SHA-256 file tree + hash manifest
// for the Atlas workspace. Read-only with respect to tracked content: it only
// writes into the requested output directory.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
// Fail loudly on unrecognised flags. Previously an unknown flag (e.g. `--mode final`, when the real
// interface is `--label`/`--out`) was SILENTLY IGNORED and the run proceeded with defaults, writing a
// final-state measurement into baseline/ and destroying the baseline the change review diffs against.
// A tool that ignores an argument it does not understand will do the wrong thing while looking like it
// succeeded - so unknown arguments are now a hard error rather than a silent fallback.
const KNOWN_FLAGS = new Set(['--out', '--label']);
for (let i = 0; i < args.length; i++) {
  if (!KNOWN_FLAGS.has(args[i])) {
    console.error(
      `evidence-manifest: unrecognised argument ${JSON.stringify(args[i])}\n` +
      `  known flags: ${[...KNOWN_FLAGS].join(', ')}\n` +
      `  (e.g. to write the final manifest: --label FINAL --out deliverables/atlas-production/final)`,
    );
    process.exit(2);
  }
  i++; // skip the flag's value
}
const outDir = path.resolve(argValue('--out', path.join(root, 'deliverables/atlas-production/baseline')));
const label = argValue('--label', 'BASELINE');

// Guard the two evidence directories against cross-contamination: writing a BASELINE label into the
// final/ directory (or vice versa) silently invalidates the change review, which is what happened.
if (label === 'BASELINE' && outDir.includes(`${path.sep}final`)) {
  console.error('evidence-manifest: refusing to write a BASELINE manifest into final/ - this would destroy the baseline/final distinction the change review depends on.');
  process.exit(3);
}
if (label !== 'BASELINE' && outDir.includes(`${path.sep}baseline`)) {
  console.error(`evidence-manifest: refusing to overwrite baseline/ with a ${label} manifest. The baseline is the reference the change report diffs against; regenerating it from the current tree would make every change invisible.`);
  process.exit(3);
}

// Directories never walked: dependency trees, generated build output, transient
// runtime state, and the evidence output itself.
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.temp',
  'work',
  'backups',
  'backups-remote',
  'deliverables',
]);

function isExcluded(rel) {
  const parts = rel.split('/');
  return parts.some((p) => EXCLUDED_DIRS.has(p));
}

async function walk(dir, base = dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs).split(path.sep).join('/');
    if (isExcluded(rel)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, base)));
    } else if (entry.isFile()) {
      out.push({ rel, abs });
    }
  }
  return out;
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// STRIKE-TIME RACE GUARD (F17/F18).
//
// Three times in a row a manifest was struck while evidence producers were still writing, so the
// manifest described a tree state that changed moments later. Each time the accompanying report then
// claimed the manifest was "verified" - a claim nobody had recomputed - which is the F8/F12/F15 defect
// class recurring in the evidence layer itself.
//
// The wording was never the bug. The bug is that a manifest authored BEFORE its producers finish is a
// snapshot of a moving target. So the check is now mechanical rather than documentary:
//   1. record the strike instant BEFORE hashing;
//   2. re-stat every file AFTER hashing and refuse to emit if any file changed, or was modified after
//      the strike instant.
// That way a manifest is only ever published if it actually described a quiescent tree - and the
// failure is loud (exit 4) rather than a plausible artifact with a false assurance attached.
const strikeAt = Date.now();

const files = (await walk(root)).sort((a, b) => a.rel.localeCompare(b.rel));
const records = [];
let totalBytes = 0;
for (const file of files) {
  const bytes = await fs.readFile(file.abs);
  totalBytes += bytes.length;
  records.push({ path: file.rel, size: bytes.length, sha256: sha256(bytes) });
}

// Re-verify against the tree as it stands NOW (after hashing) and against the strike instant. If any
// file moved, or any file's mtime is later than the moment we began, this manifest would be published
// describing a state that no longer exists - so we refuse to write it rather than emit a false artifact.
const drift = [];
for (const file of files) {
  const st = await fs.stat(file.abs);
  const rec = records.find((r) => r.path === file.rel);
  if (st.size !== rec.size) {
    drift.push(`${file.rel}: size changed ${rec.size} -> ${st.size} while hashing`);
    continue;
  }
  const now = await fs.readFile(file.abs);
  if (sha256(now) !== rec.sha256) {
    drift.push(`${file.rel}: content changed while hashing`);
    continue;
  }
  if (st.mtimeMs > strikeAt) {
    drift.push(`${file.rel}: modified ${new Date(st.mtimeMs).toISOString()}, AFTER strike ${new Date(strikeAt).toISOString()}`);
  }
}
if (drift.length) {
  console.error(
    `evidence-manifest: REFUSING to write the ${label} manifest - the tree was still changing.\n` +
    `${drift.length} file(s) drifted during or after the hash pass:\n` +
    drift.map((d) => `  - ${d}`).join('\n') +
    `\n\nA manifest struck against a moving tree is a snapshot of a state that no longer exists;\n` +
    `publishing it produces exactly the false assurance this check exists to prevent (F17/F18).\n` +
    `Wait for the evidence producers to finish, then re-run.`,
  );
  process.exit(4);
}

await fs.mkdir(outDir, { recursive: true });

// File tree listing
const tree = records.map((r) => r.path).join('\n') + '\n';
await fs.writeFile(path.join(outDir, `${label}_FILE_TREE.txt`), tree);

// Hashes manifest
const manifest = {
  label,
  generatedAt: new Date().toISOString(),
  workspace: root,
  notAGitRepository: !fss.existsSync(path.join(root, '.git')),
  algorithm: 'sha256',
  excludedDirectories: [...EXCLUDED_DIRS].sort(),
  fileCount: records.length,
  totalBytes,
  combinedTreeSha256: sha256(Buffer.from(records.map((r) => `${r.path} ${r.sha256}`).join('\n'))),
  files: records,
};
await fs.writeFile(path.join(outDir, `${label}_HASHES.json`), JSON.stringify(manifest, null, 2) + '\n');

// Independent plain-text timestamp record
await fs.writeFile(
  path.join(outDir, `${label}_TIMESTAMP.txt`),
  `label=${label}\ngeneratedAt=${manifest.generatedAt}\nworkspace=${root}\nfileCount=${manifest.fileCount}\ntotalBytes=${manifest.totalBytes}\ncombinedTreeSha256=${manifest.combinedTreeSha256}\n`,
);

console.log(JSON.stringify({
  label,
  outDir,
  fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes,
  combinedTreeSha256: manifest.combinedTreeSha256,
}, null, 2));
