export const collections = ['programs','applications','materials','materialVersions','evidence','essays','essayVersions','recommenders','recommendationRequests','tasks','inbox','decisions','auditLog'];

export function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid backup object');
  if (data.schemaVersion !== 2) throw new Error(`Unsupported schemaVersion: ${data.schemaVersion}`);
  const sets = {};
  const errors = [];
  const items = key => data[key] ?? [];
  for (const key of collections) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error(`${key} must be an array`);
    sets[key] = new Set();
    for (const item of items(key)) {
      if (!item || typeof item.id !== 'string' || !item.id.trim()) { errors.push(`${key} item has invalid id`); continue; }
      if (sets[key].has(item.id)) errors.push(`${key} duplicate id ${item.id}`);
      sets[key].add(item.id);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const rounds = new Map();
  for (const program of items('programs')) {
    if (program.applicationRounds !== undefined && !Array.isArray(program.applicationRounds)) throw new Error('applicationRounds must be an array');
    for (const round of program.applicationRounds ?? []) {
      if (!round || typeof round.id !== 'string' || !round.id.trim()) errors.push('Round has invalid id');
      else if (rounds.has(round.id)) errors.push(`Duplicate Round ${round.id}`);
      else rounds.set(round.id, program.id);
    }
  }
  function reference(item, field, collection, label, required=true) {
    if (!required && (item[field] === undefined || item[field] === null)) return;
    if (!sets[collection].has(item[field])) errors.push(`${item.id} references missing ${label} ${item[field]}`);
  }
  for (const app of items('applications')) {
    reference(app,'programId','programs','Program');
    if (app.targetRoundId && rounds.get(app.targetRoundId) !== app.programId) errors.push(`Application ${app.id} references missing Round or wrong-program Round ${app.targetRoundId}`);
  }
  for (const [key,field,parent,label] of [
    ['materialVersions','materialId','materials','Material'], ['essays','applicationId','applications','Application'],
    ['essayVersions','essayId','essays','Essay'], ['recommendationRequests','applicationId','applications','Application'],
    ['recommendationRequests','recommenderId','recommenders','Recommender'], ['decisions','applicationId','applications','Application'],
  ]) for (const item of items(key)) reference(item,field,parent,label);
  for (const key of ['tasks','inbox']) for (const item of items(key)) reference(item,'applicationId','applications','Application',false);
  for (const essay of items('essays')) {
    reference(essay,'currentVersionId','essayVersions','EssayVersion',false);
    if (essay.currentVersionId && !items('essayVersions').some(v=>v.id===essay.currentVersionId && v.essayId===essay.id)) errors.push(`Essay ${essay.id} current version belongs to another essay`);
  }
  for (const key of ['materialVersions','essayVersions']) {
    const pairs = new Set();
    for (const item of items(key)) {
      const version = item.versionNumber ?? item.version;
      if (!Number.isInteger(version) || version < 1) errors.push(`${key} ${item.id} invalid version`);
      const pair=JSON.stringify([item.materialId ?? item.essayId,version]);
      if (pairs.has(pair)) errors.push(`${key} duplicate version ${pair}`);
      pairs.add(pair);
    }
  }
  for (const key of ['essays','essayVersions']) for (const item of items(key)) {
    if (item.evidenceIds !== undefined && !Array.isArray(item.evidenceIds)) errors.push(`${key} evidenceIds must be an array`);
    else for (const id of item.evidenceIds ?? []) if (!sets.evidence.has(id)) errors.push(`${item.id} references missing Evidence ${id}`);
  }
  for (const evidence of items('evidence')) for (const id of evidence.proofMaterials ?? []) if (!sets.materials.has(id)) errors.push(`${evidence.id} references missing Material ${id}`);
  for (const material of items('materials')) for (const id of material.linkedApplications ?? []) if (!sets.applications.has(id)) errors.push(`${material.id} references missing Application ${id}`);
  if (errors.length) throw new Error(errors.join('\n'));
  return { counts: Object.fromEntries(collections.map(key=>[key,items(key).length])), rounds: rounds.size };
}

export function parseBackup(raw) {
  let data;
  try { data=JSON.parse(raw); } catch { throw new Error('Invalid JSON backup'); }
  return { data, ...validateBackup(data) };
}
