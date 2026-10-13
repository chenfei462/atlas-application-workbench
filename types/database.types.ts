
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "application_materials": {
                  Row: {
                    "application_id": string,"created_at": string,"id": string,"material_version_id": string | null,"notes": string | null,"owner_id": string,"program_id": string,"requirement_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"id"?: string,"material_version_id"?: string | null,"notes"?: string | null,"owner_id": string,"program_id": string,"requirement_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"id"?: string,"material_version_id"?: string | null,"notes"?: string | null,"owner_id"?: string,"program_id"?: string,"requirement_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_materials_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_materials_application_program_fk"
      columns: ["owner_id","program_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","program_id","id"]
    },{
      foreignKeyName: "application_materials_material_version_id_fkey"
      columns: ["material_version_id"]
isOneToOne: false
      referencedRelation: "material_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_materials_owner_application_fk"
      columns: ["owner_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "application_materials_owner_requirement_fk"
      columns: ["owner_id","requirement_id"]
isOneToOne: false
      referencedRelation: "program_material_requirements"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "application_materials_owner_version_fk"
      columns: ["owner_id","material_version_id"]
isOneToOne: false
      referencedRelation: "material_versions"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "application_materials_requirement_id_fkey"
      columns: ["requirement_id"]
isOneToOne: false
      referencedRelation: "program_material_requirements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_materials_requirement_program_fk"
      columns: ["owner_id","program_id","requirement_id"]
isOneToOne: false
      referencedRelation: "program_material_requirements"
      referencedColumns: ["owner_id","program_id","id"]
    }
                  ]
                },"application_rounds": {
                  Row: {
                    "applicant_type": string,"created_at": string,"deadline_date": string | null,"deadline_precision": string,"deadline_time": string | null,"id": string,"legacy_status": string | null,"name": string,"notes": string | null,"open_date": string | null,"owner_id": string,"program_id": string,"sort_order": number,"timezone": string | null,"updated_at": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "applicant_type"?: string,"created_at"?: string,"deadline_date"?: string | null,"deadline_precision"?: string,"deadline_time"?: string | null,"id"?: string,"legacy_status"?: string | null,"name": string,"notes"?: string | null,"open_date"?: string | null,"owner_id": string,"program_id": string,"sort_order"?: number,"timezone"?: string | null,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "applicant_type"?: string,"created_at"?: string,"deadline_date"?: string | null,"deadline_precision"?: string,"deadline_time"?: string | null,"id"?: string,"legacy_status"?: string | null,"name"?: string,"notes"?: string | null,"open_date"?: string | null,"owner_id"?: string,"program_id"?: string,"sort_order"?: number,"timezone"?: string | null,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_rounds_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rounds_owner_program_fk"
      columns: ["owner_id","program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "created_at": string,"id": string,"language_requirement_met": boolean | null,"legacy_readiness_score": number | null,"notes": string | null,"owner_id": string,"portal_payment_status": string | null,"portal_submission_status": string | null,"priority": string,"program_id": string,"status": string,"target_round_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"language_requirement_met"?: boolean | null,"legacy_readiness_score"?: number | null,"notes"?: string | null,"owner_id": string,"portal_payment_status"?: string | null,"portal_submission_status"?: string | null,"priority"?: string,"program_id": string,"status"?: string,"target_round_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"language_requirement_met"?: boolean | null,"legacy_readiness_score"?: number | null,"notes"?: string | null,"owner_id"?: string,"portal_payment_status"?: string | null,"portal_submission_status"?: string | null,"priority"?: string,"program_id"?: string,"status"?: string,"target_round_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_owner_program_fk"
      columns: ["owner_id","program_id"]
isOneToOne: true
      referencedRelation: "programs"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "applications_owner_round_fk"
      columns: ["owner_id","target_round_id"]
isOneToOne: false
      referencedRelation: "application_rounds"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "applications_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_program_round_fk"
      columns: ["program_id","target_round_id"]
isOneToOne: false
      referencedRelation: "application_rounds"
      referencedColumns: ["program_id","id"]
    },{
      foreignKeyName: "applications_target_round_id_fkey"
      columns: ["target_round_id"]
isOneToOne: false
      referencedRelation: "application_rounds"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"new_value": Json | null,"old_value": Json | null,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"entity_id": string,"entity_type": string,"id"?: string,"new_value"?: Json | null,"old_value"?: Json | null,"owner_id": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"new_value"?: Json | null,"old_value"?: Json | null,"owner_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"decisions": {
                  Row: {
                    "application_id": string,"conditions": (string)[],"created_at": string,"deposit_amount": number | null,"deposit_currency": string | null,"id": string,"notes": string | null,"owner_id": string,"received_at": string | null,"response_deadline": string | null,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"conditions"?: (string)[],"created_at"?: string,"deposit_amount"?: number | null,"deposit_currency"?: string | null,"id"?: string,"notes"?: string | null,"owner_id": string,"received_at"?: string | null,"response_deadline"?: string | null,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "application_id"?: string,"conditions"?: (string)[],"created_at"?: string,"deposit_amount"?: number | null,"deposit_currency"?: string | null,"id"?: string,"notes"?: string | null,"owner_id"?: string,"received_at"?: string | null,"response_deadline"?: string | null,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "decisions_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_owner_application_fk"
      columns: ["owner_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"essay_evidence_items": {
                  Row: {
                    "created_at": string,"essay_id": string,"evidence_item_id": string,"id": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"essay_id": string,"evidence_item_id": string,"id"?: string,"owner_id": string
                  }
                  Update: {
                    "created_at"?: string,"essay_id"?: string,"evidence_item_id"?: string,"id"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "essay_evidence_items_owner_id_essay_id_fkey"
      columns: ["owner_id","essay_id"]
isOneToOne: false
      referencedRelation: "essays"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "essay_evidence_items_owner_id_evidence_item_id_fkey"
      columns: ["owner_id","evidence_item_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"essay_evidence_links": {
                  Row: {
                    "claim_note": string | null,"created_at": string,"essay_version_id": string,"evidence_item_id": string,"id": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claim_note"?: string | null,"created_at"?: string,"essay_version_id": string,"evidence_item_id": string,"id"?: string,"owner_id": string
                  }
                  Update: {
                    "claim_note"?: string | null,"created_at"?: string,"essay_version_id"?: string,"evidence_item_id"?: string,"id"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "essay_evidence_links_essay_version_id_fkey"
      columns: ["essay_version_id"]
isOneToOne: false
      referencedRelation: "essay_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "essay_evidence_links_evidence_item_id_fkey"
      columns: ["evidence_item_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "essay_links_owner_evidence_fk"
      columns: ["owner_id","evidence_item_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "essay_links_owner_version_fk"
      columns: ["owner_id","essay_version_id"]
isOneToOne: false
      referencedRelation: "essay_versions"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"essay_versions": {
                  Row: {
                    "content": string,"content_hash": string | null,"created_at": string,"essay_id": string,"id": string,"notes": string | null,"owner_id": string,"version_number": number,"word_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: string,"content_hash"?: string | null,"created_at"?: string,"essay_id": string,"id"?: string,"notes"?: string | null,"owner_id": string,"version_number": number,"word_count"?: number
                  }
                  Update: {
                    "content"?: string,"content_hash"?: string | null,"created_at"?: string,"essay_id"?: string,"id"?: string,"notes"?: string | null,"owner_id"?: string,"version_number"?: number,"word_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "essay_versions_essay_id_fkey"
      columns: ["essay_id"]
isOneToOne: false
      referencedRelation: "essays"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "essay_versions_owner_essay_fk"
      columns: ["owner_id","essay_id"]
isOneToOne: false
      referencedRelation: "essays"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"essays": {
                  Row: {
                    "application_id": string,"created_at": string,"current_version_number": number | null,"deadline_date": string | null,"id": string,"notes": string | null,"owner_id": string,"program_essay_requirement_id": string | null,"program_id": string,"prompt": string | null,"status": string,"type": string,"updated_at": string,"word_limit": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"current_version_number"?: number | null,"deadline_date"?: string | null,"id"?: string,"notes"?: string | null,"owner_id": string,"program_essay_requirement_id"?: string | null,"program_id": string,"prompt"?: string | null,"status"?: string,"type": string,"updated_at"?: string,"word_limit"?: number | null
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"current_version_number"?: number | null,"deadline_date"?: string | null,"id"?: string,"notes"?: string | null,"owner_id"?: string,"program_essay_requirement_id"?: string | null,"program_id"?: string,"prompt"?: string | null,"status"?: string,"type"?: string,"updated_at"?: string,"word_limit"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "essays_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "essays_application_program_fk"
      columns: ["owner_id","program_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","program_id","id"]
    },{
      foreignKeyName: "essays_current_version_fk"
      columns: ["owner_id","id","current_version_number"]
isOneToOne: false
      referencedRelation: "essay_versions"
      referencedColumns: ["owner_id","essay_id","version_number"]
    },{
      foreignKeyName: "essays_owner_application_fk"
      columns: ["owner_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "essays_owner_requirement_fk"
      columns: ["owner_id","program_essay_requirement_id"]
isOneToOne: false
      referencedRelation: "program_essay_requirements"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "essays_program_essay_requirement_id_fkey"
      columns: ["program_essay_requirement_id"]
isOneToOne: false
      referencedRelation: "program_essay_requirements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "essays_requirement_program_fk"
      columns: ["owner_id","program_id","program_essay_requirement_id"]
isOneToOne: false
      referencedRelation: "program_essay_requirements"
      referencedColumns: ["owner_id","program_id","id"]
    }
                  ]
                },"evidence_items": {
                  Row: {
                    "achievements": (string)[],"created_at": string,"description": string | null,"end_date": string | null,"id": string,"metrics": (string)[],"notes": string | null,"organization": string | null,"owner_id": string,"responsibilities": (string)[],"role": string | null,"skills": (string)[],"start_date": string | null,"technologies": (string)[],"title": string,"type": string,"updated_at": string,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "achievements"?: (string)[],"created_at"?: string,"description"?: string | null,"end_date"?: string | null,"id"?: string,"metrics"?: (string)[],"notes"?: string | null,"organization"?: string | null,"owner_id": string,"responsibilities"?: (string)[],"role"?: string | null,"skills"?: (string)[],"start_date"?: string | null,"technologies"?: (string)[],"title": string,"type": string,"updated_at"?: string,"verified"?: boolean
                  }
                  Update: {
                    "achievements"?: (string)[],"created_at"?: string,"description"?: string | null,"end_date"?: string | null,"id"?: string,"metrics"?: (string)[],"notes"?: string | null,"organization"?: string | null,"owner_id"?: string,"responsibilities"?: (string)[],"role"?: string | null,"skills"?: (string)[],"start_date"?: string | null,"technologies"?: (string)[],"title"?: string,"type"?: string,"updated_at"?: string,"verified"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"evidence_material_links": {
                  Row: {
                    "created_at": string,"evidence_item_id": string,"id": string,"material_id": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"evidence_item_id": string,"id"?: string,"material_id": string,"owner_id": string
                  }
                  Update: {
                    "created_at"?: string,"evidence_item_id"?: string,"id"?: string,"material_id"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_material_links_owner_id_evidence_item_id_fkey"
      columns: ["owner_id","evidence_item_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "evidence_material_links_owner_id_material_id_fkey"
      columns: ["owner_id","material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"import_batches": {
                  Row: {
                    "archive_path": string | null,"checksum": string,"completed_at": string | null,"error": string | null,"id": string,"id_map": NonNullable<Json>,"owner_id": string,"plan_checksum": string | null,"records_imported": NonNullable<Json>,"source": string,"source_schema_version": number,"started_at": string,"status": string,"warnings": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "archive_path"?: string | null,"checksum": string,"completed_at"?: string | null,"error"?: string | null,"id"?: string,"id_map"?: NonNullable<Json>,"owner_id": string,"plan_checksum"?: string | null,"records_imported"?: NonNullable<Json>,"source"?: string,"source_schema_version": number,"started_at"?: string,"status"?: string,"warnings"?: NonNullable<Json>
                  }
                  Update: {
                    "archive_path"?: string | null,"checksum"?: string,"completed_at"?: string | null,"error"?: string | null,"id"?: string,"id_map"?: NonNullable<Json>,"owner_id"?: string,"plan_checksum"?: string | null,"records_imported"?: NonNullable<Json>,"source"?: string,"source_schema_version"?: number,"started_at"?: string,"status"?: string,"warnings"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"inbox_items": {
                  Row: {
                    "action_required": boolean,"application_id": string | null,"created_at": string,"due_at": string | null,"external_message_id": string | null,"id": string,"owner_id": string,"raw_metadata": NonNullable<Json>,"received_at": string | null,"sender": string | null,"status": string,"subject": string | null,"summary": string | null,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_required"?: boolean,"application_id"?: string | null,"created_at"?: string,"due_at"?: string | null,"external_message_id"?: string | null,"id"?: string,"owner_id": string,"raw_metadata"?: NonNullable<Json>,"received_at"?: string | null,"sender"?: string | null,"status"?: string,"subject"?: string | null,"summary"?: string | null,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "action_required"?: boolean,"application_id"?: string | null,"created_at"?: string,"due_at"?: string | null,"external_message_id"?: string | null,"id"?: string,"owner_id"?: string,"raw_metadata"?: NonNullable<Json>,"received_at"?: string | null,"sender"?: string | null,"status"?: string,"subject"?: string | null,"summary"?: string | null,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inbox_items_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inbox_items_owner_application_fk"
      columns: ["owner_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"material_application_links": {
                  Row: {
                    "application_id": string,"created_at": string,"id": string,"material_id": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"id"?: string,"material_id": string,"owner_id": string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"id"?: string,"material_id"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_application_links_owner_id_application_id_fkey"
      columns: ["owner_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "material_application_links_owner_id_material_id_fkey"
      columns: ["owner_id","material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"material_versions": {
                  Row: {
                    "created_at": string,"id": string,"material_id": string,"mime_type": string | null,"notes": string | null,"original_filename": string | null,"owner_id": string,"sha256": string | null,"size_bytes": number | null,"storage_path": string | null,"variant": string,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"material_id": string,"mime_type"?: string | null,"notes"?: string | null,"original_filename"?: string | null,"owner_id": string,"sha256"?: string | null,"size_bytes"?: number | null,"storage_path"?: string | null,"variant"?: string,"version_number": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"material_id"?: string,"mime_type"?: string | null,"notes"?: string | null,"original_filename"?: string | null,"owner_id"?: string,"sha256"?: string | null,"size_bytes"?: number | null,"storage_path"?: string | null,"variant"?: string,"version_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_versions_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_versions_owner_material_fk"
      columns: ["owner_id","material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"materials": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"id": string,"issued_at": string | null,"legacy_file_reference": string | null,"legacy_version_number": number | null,"notes": string | null,"owner_id": string,"status": string,"title": string,"type": string,"updated_at": string,"variant": string | null,"verified": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"issued_at"?: string | null,"legacy_file_reference"?: string | null,"legacy_version_number"?: number | null,"notes"?: string | null,"owner_id": string,"status"?: string,"title": string,"type": string,"updated_at"?: string,"variant"?: string | null,"verified"?: boolean | null
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"issued_at"?: string | null,"legacy_file_reference"?: string | null,"legacy_version_number"?: number | null,"notes"?: string | null,"owner_id"?: string,"status"?: string,"title"?: string,"type"?: string,"updated_at"?: string,"variant"?: string | null,"verified"?: boolean | null
                  }
                  Relationships: [
                    
                  ]
                },"portal_sections": {
                  Row: {
                    "application_id": string,"id": string,"label": string | null,"notes": string | null,"owner_id": string,"progress_percent": number,"section_key": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"id"?: string,"label"?: string | null,"notes"?: string | null,"owner_id": string,"progress_percent"?: number,"section_key": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "application_id"?: string,"id"?: string,"label"?: string | null,"notes"?: string | null,"owner_id"?: string,"progress_percent"?: number,"section_key"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "portal_sections_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portal_sections_owner_application_fk"
      columns: ["owner_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"program_essay_requirements": {
                  Row: {
                    "character_limit": number | null,"created_at": string,"essay_type": string,"id": string,"owner_id": string,"program_id": string,"prompt": string | null,"required": boolean,"source_id": string | null,"updated_at": string,"word_limit": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "character_limit"?: number | null,"created_at"?: string,"essay_type": string,"id"?: string,"owner_id": string,"program_id": string,"prompt"?: string | null,"required"?: boolean,"source_id"?: string | null,"updated_at"?: string,"word_limit"?: number | null
                  }
                  Update: {
                    "character_limit"?: number | null,"created_at"?: string,"essay_type"?: string,"id"?: string,"owner_id"?: string,"program_id"?: string,"prompt"?: string | null,"required"?: boolean,"source_id"?: string | null,"updated_at"?: string,"word_limit"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "essay_requirements_owner_program_fk"
      columns: ["owner_id","program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "essay_requirements_owner_source_fk"
      columns: ["owner_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "program_essay_requirements_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_essay_requirements_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"program_material_requirements": {
                  Row: {
                    "created_at": string,"id": string,"label": string,"material_type": string,"notes": string | null,"owner_id": string,"program_id": string,"quantity": number,"required": boolean,"source_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"label": string,"material_type": string,"notes"?: string | null,"owner_id": string,"program_id": string,"quantity"?: number,"required"?: boolean,"source_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"label"?: string,"material_type"?: string,"notes"?: string | null,"owner_id"?: string,"program_id"?: string,"quantity"?: number,"required"?: boolean,"source_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_requirements_owner_program_fk"
      columns: ["owner_id","program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "material_requirements_owner_source_fk"
      columns: ["owner_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "program_material_requirements_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_material_requirements_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"program_recommendation_requirements": {
                  Row: {
                    "created_at": string,"id": string,"maximum_count": number,"notes": string | null,"owner_id": string,"program_id": string,"required_count": number,"source_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"maximum_count"?: number,"notes"?: string | null,"owner_id": string,"program_id": string,"required_count"?: number,"source_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"maximum_count"?: number,"notes"?: string | null,"owner_id"?: string,"program_id"?: string,"required_count"?: number,"source_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_recommendation_requirements_program_id_fkey"
      columns: ["program_id"]
isOneToOne: true
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_recommendation_requirements_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recommendation_requirements_owner_program_fk"
      columns: ["owner_id","program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "recommendation_requirements_owner_source_fk"
      columns: ["owner_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"program_test_requirements": {
                  Row: {
                    "created_at": string,"id": string,"minimum_overall": number | null,"minimum_sections": NonNullable<Json>,"notes": string | null,"owner_id": string,"program_id": string,"required": boolean,"source_id": string | null,"test_type": string,"updated_at": string,"waiver_allowed": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"minimum_overall"?: number | null,"minimum_sections"?: NonNullable<Json>,"notes"?: string | null,"owner_id": string,"program_id": string,"required"?: boolean,"source_id"?: string | null,"test_type": string,"updated_at"?: string,"waiver_allowed"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"minimum_overall"?: number | null,"minimum_sections"?: NonNullable<Json>,"notes"?: string | null,"owner_id"?: string,"program_id"?: string,"required"?: boolean,"source_id"?: string | null,"test_type"?: string,"updated_at"?: string,"waiver_allowed"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_test_requirements_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_test_requirements_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "test_requirements_owner_program_fk"
      columns: ["owner_id","program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "test_requirements_owner_source_fk"
      columns: ["owner_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"programs": {
                  Row: {
                    "academic_requirements_text": string | null,"application_fee_text": string | null,"application_open_date": string | null,"country_text": string | null,"created_at": string,"degree_name": string | null,"duration_text": string | null,"id": string,"intake_term": string,"intake_year": number,"language_requirements_text": string | null,"legacy_application_status": string | null,"notes": string | null,"official_application_url": string | null,"official_program_url": string | null,"owner_id": string,"program_name": string,"region_text": string | null,"rolling_admission": boolean,"school_name": string | null,"study_mode": string,"tags": (string)[],"tuition_text": string | null,"university_id": string,"updated_at": string,"verification_status": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_requirements_text"?: string | null,"application_fee_text"?: string | null,"application_open_date"?: string | null,"country_text"?: string | null,"created_at"?: string,"degree_name"?: string | null,"duration_text"?: string | null,"id"?: string,"intake_term"?: string,"intake_year": number,"language_requirements_text"?: string | null,"legacy_application_status"?: string | null,"notes"?: string | null,"official_application_url"?: string | null,"official_program_url"?: string | null,"owner_id": string,"program_name": string,"region_text"?: string | null,"rolling_admission"?: boolean,"school_name"?: string | null,"study_mode"?: string,"tags"?: (string)[],"tuition_text"?: string | null,"university_id": string,"updated_at"?: string,"verification_status"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "academic_requirements_text"?: string | null,"application_fee_text"?: string | null,"application_open_date"?: string | null,"country_text"?: string | null,"created_at"?: string,"degree_name"?: string | null,"duration_text"?: string | null,"id"?: string,"intake_term"?: string,"intake_year"?: number,"language_requirements_text"?: string | null,"legacy_application_status"?: string | null,"notes"?: string | null,"official_application_url"?: string | null,"official_program_url"?: string | null,"owner_id"?: string,"program_name"?: string,"region_text"?: string | null,"rolling_admission"?: boolean,"school_name"?: string | null,"study_mode"?: string,"tags"?: (string)[],"tuition_text"?: string | null,"university_id"?: string,"updated_at"?: string,"verification_status"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_owner_university_fk"
      columns: ["owner_id","university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "programs_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"recommendation_requests": {
                  Row: {
                    "accepted_at": string | null,"application_id": string,"created_at": string,"due_date": string | null,"id": string,"notes": string | null,"owner_id": string,"recommender_id": string,"reminder_at": string | null,"requested_at": string | null,"required": boolean | null,"status": string,"submitted_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"application_id": string,"created_at"?: string,"due_date"?: string | null,"id"?: string,"notes"?: string | null,"owner_id": string,"recommender_id": string,"reminder_at"?: string | null,"requested_at"?: string | null,"required"?: boolean | null,"status"?: string,"submitted_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"application_id"?: string,"created_at"?: string,"due_date"?: string | null,"id"?: string,"notes"?: string | null,"owner_id"?: string,"recommender_id"?: string,"reminder_at"?: string | null,"requested_at"?: string | null,"required"?: boolean | null,"status"?: string,"submitted_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recommendation_requests_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recommendation_requests_owner_application_fk"
      columns: ["owner_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "recommendation_requests_owner_recommender_fk"
      columns: ["owner_id","recommender_id"]
isOneToOne: false
      referencedRelation: "recommenders"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "recommendation_requests_recommender_id_fkey"
      columns: ["recommender_id"]
isOneToOne: false
      referencedRelation: "recommenders"
      referencedColumns: ["id"]
    }
                  ]
                },"recommenders": {
                  Row: {
                    "created_at": string,"email": string | null,"id": string,"name": string,"notes": string | null,"organization": string | null,"owner_id": string,"relationship": string | null,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"organization"?: string | null,"owner_id": string,"relationship"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"organization"?: string | null,"owner_id"?: string,"relationship"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"source_assertions": {
                  Row: {
                    "application_round_id": string | null,"created_at": string,"field_path": string,"id": string,"notes": string | null,"observed_value": NonNullable<Json>,"owner_id": string,"program_id": string,"source_id": string,"updated_at": string,"verification_status": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_round_id"?: string | null,"created_at"?: string,"field_path": string,"id"?: string,"notes"?: string | null,"observed_value": NonNullable<Json>,"owner_id": string,"program_id": string,"source_id": string,"updated_at"?: string,"verification_status"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "application_round_id"?: string | null,"created_at"?: string,"field_path"?: string,"id"?: string,"notes"?: string | null,"observed_value"?: NonNullable<Json>,"owner_id"?: string,"program_id"?: string,"source_id"?: string,"updated_at"?: string,"verification_status"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assertions_owner_program_fk"
      columns: ["owner_id","program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "assertions_owner_round_fk"
      columns: ["owner_id","application_round_id"]
isOneToOne: false
      referencedRelation: "application_rounds"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "assertions_owner_source_fk"
      columns: ["owner_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "assertions_program_round_fk"
      columns: ["program_id","application_round_id"]
isOneToOne: false
      referencedRelation: "application_rounds"
      referencedColumns: ["program_id","id"]
    },{
      foreignKeyName: "source_assertions_application_round_id_fkey"
      columns: ["application_round_id"]
isOneToOne: false
      referencedRelation: "application_rounds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_assertions_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_assertions_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "content_hash": string | null,"created_at": string,"id": string,"notes": string | null,"owner_id": string,"retrieved_at": string | null,"source_type": string,"title": string | null,"updated_at": string,"url": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash"?: string | null,"created_at"?: string,"id"?: string,"notes"?: string | null,"owner_id": string,"retrieved_at"?: string | null,"source_type": string,"title"?: string | null,"updated_at"?: string,"url": string,"verified_at"?: string | null
                  }
                  Update: {
                    "content_hash"?: string | null,"created_at"?: string,"id"?: string,"notes"?: string | null,"owner_id"?: string,"retrieved_at"?: string | null,"source_type"?: string,"title"?: string | null,"updated_at"?: string,"url"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"submissions": {
                  Row: {
                    "application_id": string,"application_number": string | null,"confirmation_received": boolean,"created_at": string,"id": string,"notes": string | null,"owner_id": string,"payment_amount": number | null,"payment_currency": string | null,"receipt_storage_path": string | null,"submitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"application_number"?: string | null,"confirmation_received"?: boolean,"created_at"?: string,"id"?: string,"notes"?: string | null,"owner_id": string,"payment_amount"?: number | null,"payment_currency"?: string | null,"receipt_storage_path"?: string | null,"submitted_at": string
                  }
                  Update: {
                    "application_id"?: string,"application_number"?: string | null,"confirmation_received"?: boolean,"created_at"?: string,"id"?: string,"notes"?: string | null,"owner_id"?: string,"payment_amount"?: number | null,"payment_currency"?: string | null,"receipt_storage_path"?: string | null,"submitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_owner_application_fk"
      columns: ["owner_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "application_id": string | null,"completed_at": string | null,"created_at": string,"description": string | null,"due_at": string | null,"id": string,"manual": boolean,"owner_id": string,"priority": string,"source_key": string | null,"source_type": string,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_at"?: string | null,"id"?: string,"manual"?: boolean,"owner_id": string,"priority"?: string,"source_key"?: string | null,"source_type"?: string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "application_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_at"?: string | null,"id"?: string,"manual"?: boolean,"owner_id"?: string,"priority"?: string,"source_key"?: string | null,"source_type"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_owner_application_fk"
      columns: ["owner_id","application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"universities": {
                  Row: {
                    "city": string | null,"country_code": string | null,"country_text": string | null,"created_at": string,"id": string,"name": string,"owner_id": string,"short_name": string | null,"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"country_code"?: string | null,"country_text"?: string | null,"created_at"?: string,"id"?: string,"name": string,"owner_id": string,"short_name"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"country_code"?: string | null,"country_text"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"short_name"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "delete_material_version":
{ Args: { "p_id": string }; Returns: undefined
                           },
"import_atlas_backup":
{ Args: { "p_archive_path": string,"p_checksum": string,"p_id_map": Json,"p_rows": Json,"p_schema_version": number,"p_warnings": Json }; Returns: Json
                           },
"is_owner":
{ Args: { "candidate": string }; Returns: boolean
                           },
"record_submission":
{ Args: { "p_application_id": string,"p_application_number": string,"p_confirmation_received": boolean,"p_receipt_path"?: string,"p_submitted_at": string }; Returns: Json
                           },
"save_essay_version":
{ Args: { "p_content": string,"p_essay_id": string,"p_expected_version": number }; Returns: Json
                           },
"seed_demo_data":
{ Args: { "target_owner": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
