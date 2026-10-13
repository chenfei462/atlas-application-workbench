import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Tables,TablesInsert,TablesUpdate} from '../types/database.types.js';
import {AtlasError,mapError} from './errors.js';
export type TableName=keyof Database['public']['Tables'];
export const coreTables=['profiles','universities','programs','application_rounds','sources','source_assertions','applications','program_material_requirements','program_test_requirements','program_essay_requirements','program_recommendation_requirements','materials','material_versions','application_materials','evidence_items','evidence_material_links','material_application_links','essays','essay_evidence_items','essay_versions','essay_evidence_links','recommenders','recommendation_requests','portal_sections','submissions','tasks','inbox_items','decisions','audit_events','import_batches'] as const;
export type Snapshot=Partial<{[N in TableName]:Tables<N>[]} >;
export class Repository<N extends TableName> {
 constructor(readonly client:SupabaseClient<Database>,readonly owner:string,readonly table:N){}
 private ownerField(){return this.table==='profiles'?'id':'owner_id';}
 async list():Promise<Tables<N>[]>{
  const all:Tables<N>[]=[];
  for(let offset=0;;offset+=500){const {data,error,status}=await this.client.from(this.table as TableName).select('*').filter(this.ownerField(),'eq',this.owner).order('id').range(offset,offset+499);if(error)throw mapError({...error,status});const page=data as unknown as Tables<N>[];all.push(...page);if(page.length<500)return all;}
 }
 async get(id:string):Promise<Tables<N>>{const {data,error,status}=await this.client.from(this.table as TableName).select('*').filter(this.ownerField(),'eq',this.owner).eq('id',id).maybeSingle();if(error)throw mapError({...error,status});if(!data)throw new AtlasError('NOT_FOUND');return data as unknown as Tables<N>;}
 async insert(input:TablesInsert<N>):Promise<Tables<N>>{
  const field=this.ownerField();const row=input as Record<string,unknown>;
  if(row[field]!==undefined && row[field]!==this.owner)throw new AtlasError('PERMISSION_DENIED');
  const {data,error,status}=await this.client.from(this.table as TableName).insert({...input,[field]:this.owner} as never).select().single();if(error)throw mapError({...error,status});return data as unknown as Tables<N>;
 }
 async update(id:string,input:TablesUpdate<N>,expectedUpdatedAt?:string):Promise<Tables<N>>{
  const fields=input as Record<string,unknown>;if('owner_id' in fields || 'id' in fields)throw new AtlasError('VALIDATION_ERROR');
  let query=this.client.from(this.table as TableName).update(input as never).filter(this.ownerField(),'eq',this.owner).eq('id',id);
  if(expectedUpdatedAt)query=query.filter('updated_at','eq',expectedUpdatedAt);
  const {data,error,status}=await query.select().maybeSingle();if(error)throw mapError({...error,status});
  if(!data){await this.get(id);throw new AtlasError('CONFLICT');}return data as unknown as Tables<N>;
 }
 async delete(id:string){const {data,error,status}=await this.client.from(this.table as TableName).delete().filter(this.ownerField(),'eq',this.owner).eq('id',id).select('id');if(error)throw mapError({...error,status});if(!data?.length)throw new AtlasError('NOT_FOUND');}
}
export class ProgramRepository extends Repository<'programs'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'programs');}}
export class ApplicationRepository extends Repository<'applications'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'applications');}}
export class MaterialRepository extends Repository<'materials'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'materials');}}
export class EvidenceRepository extends Repository<'evidence_items'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'evidence_items');}}
export class EssayRepository extends Repository<'essays'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'essays');}}
export class RecommenderRepository extends Repository<'recommenders'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'recommenders');}}
export class TaskRepository extends Repository<'tasks'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'tasks');}}
export class InboxRepository extends Repository<'inbox_items'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'inbox_items');}}
export class DecisionRepository extends Repository<'decisions'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'decisions');}}
export class SubmissionRepository extends Repository<'submissions'>{constructor(c:SupabaseClient<Database>,o:string){super(c,o,'submissions');}}
export function repository<N extends TableName>(client:SupabaseClient<Database>,owner:string,name:N){return new Repository(client,owner,name);}
export async function loadSnapshot(client:SupabaseClient<Database>,owner:string,tables:readonly TableName[]=coreTables):Promise<Snapshot>{
  const entries=await Promise.all(tables.map(async name=>[name,await repository(client,owner,name).list()] as const));return Object.fromEntries(entries) as Snapshot;
}
export async function portableExport(client:SupabaseClient<Database>,owner:string){return {schemaVersion:3,exportedAt:new Date().toISOString(),tables:await loadSnapshot(client,owner)};}



