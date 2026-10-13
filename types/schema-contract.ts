import type { Database } from './database.types.js';
type Tables=Database['public']['Tables'];
export type TableName=keyof Tables;
export type Row<T extends TableName>=Tables[T]['Row'];
export type Insert<T extends TableName>=Tables[T]['Insert'];
export type Update<T extends TableName>=Tables[T]['Update'];
// Compile against generated columns used in normalized write/read flows.
export type ApplicationRelation=Pick<Row<'applications'>,'id'|'owner_id'|'program_id'|'target_round_id'>;
export type Deadline=Pick<Row<'application_rounds'>,'deadline_date'|'deadline_time'|'deadline_precision'|'timezone'>;
export type MaterialHistory=Pick<Row<'material_versions'>,'material_id'|'version_number'|'storage_path'|'sha256'>;
export type EssayHistory=Pick<Row<'essay_versions'>,'essay_id'|'version_number'|'content_hash'>;
