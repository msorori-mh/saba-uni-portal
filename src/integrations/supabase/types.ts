export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      absence_excuse_details: {
        Row: {
          absence_date: string
          absence_reason_detail: string | null
          course_section_id: string
          created_at: string
          id: string
          reason_type: string
          record_applied_at: string | null
          request_id: string
          updated_at: string
        }
        Insert: {
          absence_date: string
          absence_reason_detail?: string | null
          course_section_id: string
          created_at?: string
          id?: string
          reason_type?: string
          record_applied_at?: string | null
          request_id: string
          updated_at?: string
        }
        Update: {
          absence_date?: string
          absence_reason_detail?: string | null
          course_section_id?: string
          created_at?: string
          id?: string
          reason_type?: string
          record_applied_at?: string | null
          request_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      academic_council_agenda_items: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          is_approved: boolean
          meeting_id: string
          notes: string | null
          order_index: number
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_status: Database["public"]["Enums"]["academic_council_agenda_item_session_status"]
          title: string
          topic_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_approved?: boolean
          meeting_id: string
          notes?: string | null
          order_index: number
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_status?: Database["public"]["Enums"]["academic_council_agenda_item_session_status"]
          title: string
          topic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_approved?: boolean
          meeting_id?: string
          notes?: string | null
          order_index?: number
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_status?: Database["public"]["Enums"]["academic_council_agenda_item_session_status"]
          title?: string
          topic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_agenda_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_agenda_items_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "academic_council_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_attendance_audit_events: {
        Row: {
          action_type: string
          actor_user_id: string | null
          council_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          meeting_id: string | null
          payload: Json
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          council_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          meeting_id?: string | null
          payload?: Json
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          council_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          meeting_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_attendance_audit_events_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_attendance_audit_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_audit_events: {
        Row: {
          action_type: string
          actor_user_id: string | null
          correlation_id: string | null
          council_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          meeting_id: string | null
          payload: Json
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          correlation_id?: string | null
          council_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          meeting_id?: string | null
          payload?: Json
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          correlation_id?: string | null
          council_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          meeting_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_audit_events_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_audit_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_decisions: {
        Row: {
          agenda_item_id: string | null
          body: string
          canonical_decision_number: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          decision_number: number
          due_date: string | null
          evidence_metadata: Json
          execution_note: string | null
          id: string
          meeting_id: string
          minutes_id: string | null
          responsible_unit: string | null
          responsible_user_id: string | null
          status: Database["public"]["Enums"]["academic_council_decision_status"]
          title: string
          topic_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agenda_item_id?: string | null
          body: string
          canonical_decision_number?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          decision_number: number
          due_date?: string | null
          evidence_metadata?: Json
          execution_note?: string | null
          id?: string
          meeting_id: string
          minutes_id?: string | null
          responsible_unit?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["academic_council_decision_status"]
          title: string
          topic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agenda_item_id?: string | null
          body?: string
          canonical_decision_number?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          decision_number?: number
          due_date?: string | null
          evidence_metadata?: Json
          execution_note?: string | null
          id?: string
          meeting_id?: string
          minutes_id?: string | null
          responsible_unit?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["academic_council_decision_status"]
          title?: string
          topic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_decisions_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "academic_council_agenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_decisions_minutes_id_fkey"
            columns: ["minutes_id"]
            isOneToOne: false
            referencedRelation: "academic_council_minutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_decisions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "academic_council_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_meeting_attendance: {
        Row: {
          attendance_state: Database["public"]["Enums"]["academic_council_attendance_state"]
          created_at: string
          id: string
          meeting_id: string
          member_role: Database["public"]["Enums"]["academic_council_member_role"]
          membership_active_from: string
          membership_active_to: string | null
          membership_id: string
          recorded_at: string | null
          recorded_by: string | null
          roll_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_state?: Database["public"]["Enums"]["academic_council_attendance_state"]
          created_at?: string
          id?: string
          meeting_id: string
          member_role: Database["public"]["Enums"]["academic_council_member_role"]
          membership_active_from: string
          membership_active_to?: string | null
          membership_id: string
          recorded_at?: string | null
          recorded_by?: string | null
          roll_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_state?: Database["public"]["Enums"]["academic_council_attendance_state"]
          created_at?: string
          id?: string
          meeting_id?: string
          member_role?: Database["public"]["Enums"]["academic_council_member_role"]
          membership_active_from?: string
          membership_active_to?: string | null
          membership_id?: string
          recorded_at?: string | null
          recorded_by?: string | null
          roll_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_meeting_attendance_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_meeting_attendance_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "academic_council_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_meeting_attendance_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meeting_attendance_rolls"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_meeting_attendance_rolls: {
        Row: {
          council_id: string
          created_at: string
          eligible_member_count: number
          finalized_at: string | null
          finalized_by: string | null
          id: string
          meeting_id: string
          opened_by: string
          snapshot_taken_at: string
          status: Database["public"]["Enums"]["academic_council_attendance_roll_status"]
          updated_at: string
        }
        Insert: {
          council_id: string
          created_at?: string
          eligible_member_count?: number
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          meeting_id: string
          opened_by: string
          snapshot_taken_at?: string
          status?: Database["public"]["Enums"]["academic_council_attendance_roll_status"]
          updated_at?: string
        }
        Update: {
          council_id?: string
          created_at?: string
          eligible_member_count?: number
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          meeting_id?: string
          opened_by?: string
          snapshot_taken_at?: string
          status?: Database["public"]["Enums"]["academic_council_attendance_roll_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_meeting_attendance_rolls_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_meeting_attendance_rolls_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_meeting_quorum_evaluations: {
        Row: {
          created_at: string
          eligible_member_count: number
          evaluated_at: string
          evaluated_by: string
          id: string
          is_final: boolean
          meeting_id: string
          policy_id: string
          policy_version: number
          present_member_count: number
          quorum_met: boolean
          required_member_count: number
          roll_id: string
        }
        Insert: {
          created_at?: string
          eligible_member_count: number
          evaluated_at?: string
          evaluated_by: string
          id?: string
          is_final?: boolean
          meeting_id: string
          policy_id: string
          policy_version: number
          present_member_count: number
          quorum_met: boolean
          required_member_count: number
          roll_id: string
        }
        Update: {
          created_at?: string
          eligible_member_count?: number
          evaluated_at?: string
          evaluated_by?: string
          id?: string
          is_final?: boolean
          meeting_id?: string
          policy_id?: string
          policy_version?: number
          present_member_count?: number
          quorum_met?: boolean
          required_member_count?: number
          roll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_meeting_quorum_evaluations_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_meeting_quorum_evaluations_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "academic_council_quorum_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_meeting_quorum_evaluations_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meeting_attendance_rolls"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_meeting_transition_events: {
        Row: {
          actor_user_id: string
          council_id: string
          evidence: Json
          expected_from_status: Database["public"]["Enums"]["academic_council_meeting_status"]
          from_status: Database["public"]["Enums"]["academic_council_meeting_status"]
          id: string
          meeting_id: string
          to_status: Database["public"]["Enums"]["academic_council_meeting_status"]
          transitioned_at: string
        }
        Insert: {
          actor_user_id: string
          council_id: string
          evidence?: Json
          expected_from_status: Database["public"]["Enums"]["academic_council_meeting_status"]
          from_status: Database["public"]["Enums"]["academic_council_meeting_status"]
          id?: string
          meeting_id: string
          to_status: Database["public"]["Enums"]["academic_council_meeting_status"]
          transitioned_at?: string
        }
        Update: {
          actor_user_id?: string
          council_id?: string
          evidence?: Json
          expected_from_status?: Database["public"]["Enums"]["academic_council_meeting_status"]
          from_status?: Database["public"]["Enums"]["academic_council_meeting_status"]
          id?: string
          meeting_id?: string
          to_status?: Database["public"]["Enums"]["academic_council_meeting_status"]
          transitioned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_meeting_transition_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_meetings: {
        Row: {
          academic_year_id: string | null
          closed_at: string | null
          closed_by: string | null
          council_id: string
          created_at: string
          created_by: string
          id: string
          intake_closes_at: string | null
          intake_opens_at: string | null
          location: string | null
          meeting_number: number
          notes: string | null
          opened_at: string | null
          opened_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["academic_council_meeting_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          academic_year_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          council_id: string
          created_at?: string
          created_by: string
          id?: string
          intake_closes_at?: string | null
          intake_opens_at?: string | null
          location?: string | null
          meeting_number: number
          notes?: string | null
          opened_at?: string | null
          opened_by?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["academic_council_meeting_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          academic_year_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          council_id?: string
          created_at?: string
          created_by?: string
          id?: string
          intake_closes_at?: string | null
          intake_opens_at?: string | null
          location?: string | null
          meeting_number?: number
          notes?: string | null
          opened_at?: string | null
          opened_by?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["academic_council_meeting_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_meetings_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_meetings_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_members: {
        Row: {
          active_from: string
          active_to: string | null
          council_id: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          member_role: Database["public"]["Enums"]["academic_council_member_role"]
          membership_source: Database["public"]["Enums"]["council_membership_source"]
          notes: string | null
          source_position_assignment_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          active_from?: string
          active_to?: string | null
          council_id: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          member_role?: Database["public"]["Enums"]["academic_council_member_role"]
          membership_source?: Database["public"]["Enums"]["council_membership_source"]
          notes?: string | null
          source_position_assignment_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          active_from?: string
          active_to?: string | null
          council_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          member_role?: Database["public"]["Enums"]["academic_council_member_role"]
          membership_source?: Database["public"]["Enums"]["council_membership_source"]
          notes?: string | null
          source_position_assignment_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_members_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_members_source_position_assignment_id_fkey"
            columns: ["source_position_assignment_id"]
            isOneToOne: false
            referencedRelation: "position_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_minutes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          created_at: string
          drafted_by: string
          fingerprint: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          meeting_id: string
          status: Database["public"]["Enums"]["academic_council_minutes_status"]
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          created_at?: string
          drafted_by: string
          fingerprint?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          meeting_id: string
          status?: Database["public"]["Enums"]["academic_council_minutes_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          created_at?: string
          drafted_by?: string
          fingerprint?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          meeting_id?: string
          status?: Database["public"]["Enums"]["academic_council_minutes_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_minutes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_minutes_amendments: {
        Row: {
          amended_content: string
          amendment_number: number
          created_at: string
          created_by: string
          id: string
          meeting_id: string
          minutes_id: string
          reason: string
        }
        Insert: {
          amended_content: string
          amendment_number: number
          created_at?: string
          created_by: string
          id?: string
          meeting_id: string
          minutes_id: string
          reason: string
        }
        Update: {
          amended_content?: string
          amendment_number?: number
          created_at?: string
          created_by?: string
          id?: string
          meeting_id?: string
          minutes_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_minutes_amendments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_minutes_amendments_minutes_id_fkey"
            columns: ["minutes_id"]
            isOneToOne: false
            referencedRelation: "academic_council_minutes"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_notifications: {
        Row: {
          body: string
          council_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          is_read: boolean
          meeting_id: string | null
          payload: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          council_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          is_read?: boolean
          meeting_id?: string | null
          payload?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          council_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          is_read?: boolean
          meeting_id?: string | null
          payload?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_notifications_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_quorum_policies: {
        Row: {
          absolute_count: number | null
          approved_at: string | null
          approved_by: string | null
          council_id: string
          created_at: string
          created_by: string
          id: string
          policy_version: number
          ratio_denominator: number | null
          ratio_numerator: number | null
          status: Database["public"]["Enums"]["academic_council_quorum_policy_status"]
          superseded_at: string | null
          threshold_kind: Database["public"]["Enums"]["academic_council_quorum_threshold_kind"]
          updated_at: string
        }
        Insert: {
          absolute_count?: number | null
          approved_at?: string | null
          approved_by?: string | null
          council_id: string
          created_at?: string
          created_by: string
          id?: string
          policy_version: number
          ratio_denominator?: number | null
          ratio_numerator?: number | null
          status?: Database["public"]["Enums"]["academic_council_quorum_policy_status"]
          superseded_at?: string | null
          threshold_kind: Database["public"]["Enums"]["academic_council_quorum_threshold_kind"]
          updated_at?: string
        }
        Update: {
          absolute_count?: number | null
          approved_at?: string | null
          approved_by?: string | null
          council_id?: string
          created_at?: string
          created_by?: string
          id?: string
          policy_version?: number
          ratio_denominator?: number | null
          ratio_numerator?: number | null
          status?: Database["public"]["Enums"]["academic_council_quorum_policy_status"]
          superseded_at?: string | null
          threshold_kind?: Database["public"]["Enums"]["academic_council_quorum_threshold_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_quorum_policies_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_topic_attachments: {
        Row: {
          council_id: string
          created_at: string
          deleted_at: string | null
          file_ext: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          storage_bucket: string
          topic_id: string
          uploaded_by: string
        }
        Insert: {
          council_id: string
          created_at?: string
          deleted_at?: string | null
          file_ext: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          storage_bucket?: string
          topic_id: string
          uploaded_by: string
        }
        Update: {
          council_id?: string
          created_at?: string
          deleted_at?: string | null
          file_ext?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_bucket?: string
          topic_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_topic_attachments_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_topic_attachments_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "academic_council_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_topics: {
        Row: {
          body: string
          category: string | null
          council_id: string
          created_at: string
          decided_at: string | null
          id: string
          meeting_id: string | null
          review_note: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["academic_council_topic_status"]
          submitted_at: string | null
          submitted_by: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          council_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          meeting_id?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["academic_council_topic_status"]
          submitted_at?: string | null
          submitted_by: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          council_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          meeting_id?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["academic_council_topic_status"]
          submitted_at?: string | null
          submitted_by?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_topics_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_topics_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_vote_results: {
        Row: {
          abstain_count: number
          agenda_item_id: string
          calculated_at: string
          calculated_by: string
          council_id: string
          id: string
          meeting_id: string
          no_count: number
          outcome: string
          total_votes: number
          yes_count: number
        }
        Insert: {
          abstain_count?: number
          agenda_item_id: string
          calculated_at?: string
          calculated_by: string
          council_id: string
          id?: string
          meeting_id: string
          no_count?: number
          outcome: string
          total_votes?: number
          yes_count?: number
        }
        Update: {
          abstain_count?: number
          agenda_item_id?: string
          calculated_at?: string
          calculated_by?: string
          council_id?: string
          id?: string
          meeting_id?: string
          no_count?: number
          outcome?: string
          total_votes?: number
          yes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_vote_results_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: true
            referencedRelation: "academic_council_agenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_vote_results_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_vote_results_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_council_votes: {
        Row: {
          agenda_item_id: string
          cast_at: string
          council_id: string
          id: string
          meeting_id: string
          vote_value: Database["public"]["Enums"]["academic_council_vote_value"]
          voter_user_id: string
        }
        Insert: {
          agenda_item_id: string
          cast_at?: string
          council_id: string
          id?: string
          meeting_id: string
          vote_value: Database["public"]["Enums"]["academic_council_vote_value"]
          voter_user_id: string
        }
        Update: {
          agenda_item_id?: string
          cast_at?: string
          council_id?: string
          id?: string
          meeting_id?: string
          vote_value?: Database["public"]["Enums"]["academic_council_vote_value"]
          voter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_votes_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "academic_council_agenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_votes_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "academic_councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_council_votes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_councils: {
        Row: {
          council_type: Database["public"]["Enums"]["academic_council_type"]
          created_at: string
          created_by: string
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          name_en: string | null
          settings: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          council_type: Database["public"]["Enums"]["academic_council_type"]
          created_at?: string
          created_by: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_en?: string | null
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          council_type?: Database["public"]["Enums"]["academic_council_type"]
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_en?: string | null
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_councils_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_levels: {
        Row: {
          created_at: string
          id: string
          level_number: number
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          level_number: number
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          level_number?: number
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      academic_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          name: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          name: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          name?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          announcement_id: string
          id?: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          announcement_id?: string
          id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          announcement_type: string
          content_ar: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          publish_at: string
          target_audience: string
          target_department_ids: string[]
          target_level_ids: string[]
          target_program_ids: string[]
          title_ar: string
          updated_at: string
        }
        Insert: {
          announcement_type?: string
          content_ar: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          publish_at?: string
          target_audience?: string
          target_department_ids?: string[]
          target_level_ids?: string[]
          target_program_ids?: string[]
          title_ar: string
          updated_at?: string
        }
        Update: {
          announcement_type?: string
          content_ar?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          publish_at?: string
          target_audience?: string
          target_department_ids?: string[]
          target_level_ids?: string[]
          target_program_ids?: string[]
          title_ar?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          notes: string | null
          old_values: Json | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          notes?: string | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          notes?: string | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      automation_settings: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      b1_draft_mutation_idempotency: {
        Row: {
          created_at: string
          idempotency_key: string
          operation: string
          payload_hash: string
          request_id: string
          student_profile_id: string
        }
        Insert: {
          created_at?: string
          idempotency_key: string
          operation: string
          payload_hash: string
          request_id: string
          student_profile_id: string
        }
        Update: {
          created_at?: string
          idempotency_key?: string
          operation?: string
          payload_hash?: string
          request_id?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b1_draft_mutation_idempotency_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b1_draft_mutation_idempotency_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "b1_draft_mutation_idempotency_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      b1_e2e_88_actor_bindings: {
        Row: {
          action: string
          active: boolean
          actor_user_id: string
          applied_assignee_snapshot: Json
          correlation_id: string
          created_at: string
          deactivated_at: string | null
          department_id: string | null
          department_side: string | null
          e2e_position_assignment_id: string | null
          execution_id: string
          expires_at: string
          id: string
          prior_assignee_snapshot: Json
          processing_role_id: string
          processing_unit_id: string
          request_id: string
          runtime_step_id: string
          workflow_step_id: string
        }
        Insert: {
          action: string
          active?: boolean
          actor_user_id: string
          applied_assignee_snapshot?: Json
          correlation_id: string
          created_at?: string
          deactivated_at?: string | null
          department_id?: string | null
          department_side?: string | null
          e2e_position_assignment_id?: string | null
          execution_id: string
          expires_at: string
          id?: string
          prior_assignee_snapshot?: Json
          processing_role_id: string
          processing_unit_id: string
          request_id: string
          runtime_step_id: string
          workflow_step_id: string
        }
        Update: {
          action?: string
          active?: boolean
          actor_user_id?: string
          applied_assignee_snapshot?: Json
          correlation_id?: string
          created_at?: string
          deactivated_at?: string | null
          department_id?: string | null
          department_side?: string | null
          e2e_position_assignment_id?: string | null
          execution_id?: string
          expires_at?: string
          id?: string
          prior_assignee_snapshot?: Json
          processing_role_id?: string
          processing_unit_id?: string
          request_id?: string
          runtime_step_id?: string
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b1_e2e_88_actor_bindings_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "b1_e2e_88_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      b1_e2e_88_audit_events: {
        Row: {
          actor_user_id: string | null
          correlation_id: string | null
          created_at: string
          detail: Json
          event_type: string
          execution_id: string | null
          id: number
          request_id: string | null
          runtime_step_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          execution_id?: string | null
          id?: number
          request_id?: string | null
          runtime_step_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          execution_id?: string | null
          id?: number
          request_id?: string | null
          runtime_step_id?: string | null
        }
        Relationships: []
      }
      b1_e2e_88_executions: {
        Row: {
          audit_metadata: Json
          closed_at: string | null
          correlation_id: string
          created_at: string
          created_by: string | null
          created_request_id: string | null
          expires_at: string
          id: string
          marker: string
          service_code: string
          starts_at: string
          status: string
          student_user_id: string
        }
        Insert: {
          audit_metadata?: Json
          closed_at?: string | null
          correlation_id: string
          created_at?: string
          created_by?: string | null
          created_request_id?: string | null
          expires_at: string
          id?: string
          marker?: string
          service_code: string
          starts_at?: string
          status?: string
          student_user_id: string
        }
        Update: {
          audit_metadata?: Json
          closed_at?: string | null
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          created_request_id?: string | null
          expires_at?: string
          id?: string
          marker?: string
          service_code?: string
          starts_at?: string
          status?: string
          student_user_id?: string
        }
        Relationships: []
      }
      b1_e2e_assignment_snapshot: {
        Row: {
          assignment_id: string
          assignment_type: string
          captured_at: string
          department_id: string | null
          ends_at: string | null
          faculty_profile_id: string | null
          id: string
          is_active: boolean
          position_assignment_id: string | null
          role_id: string | null
          staff_profile_id: string | null
          starts_at: string | null
          tag: string
          unit_id: string
          user_id: string | null
        }
        Insert: {
          assignment_id: string
          assignment_type: string
          captured_at?: string
          department_id?: string | null
          ends_at?: string | null
          faculty_profile_id?: string | null
          id?: string
          is_active: boolean
          position_assignment_id?: string | null
          role_id?: string | null
          staff_profile_id?: string | null
          starts_at?: string | null
          tag: string
          unit_id: string
          user_id?: string | null
        }
        Update: {
          assignment_id?: string
          assignment_type?: string
          captured_at?: string
          department_id?: string | null
          ends_at?: string | null
          faculty_profile_id?: string | null
          id?: string
          is_active?: boolean
          position_assignment_id?: string | null
          role_id?: string | null
          staff_profile_id?: string | null
          starts_at?: string | null
          tag?: string
          unit_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      b1_fixture_15_reissue_44_evidence: {
        Row: {
          archive_step_comment: string | null
          archive_step_completed_at: string | null
          archive_step_completed_by: string | null
          archive_step_decision: string | null
          archive_step_id: string | null
          archive_step_status: string | null
          captured_at: string
          event_actor_user_id: string | null
          event_created_at: string | null
          event_id: string | null
          event_message_ar: string | null
          event_payload: Json | null
          event_type: string | null
          evidence: Json
          id: string
          marker: string
          request_completed_at: string | null
          request_id: string
          request_number: string
          request_status: string | null
        }
        Insert: {
          archive_step_comment?: string | null
          archive_step_completed_at?: string | null
          archive_step_completed_by?: string | null
          archive_step_decision?: string | null
          archive_step_id?: string | null
          archive_step_status?: string | null
          captured_at?: string
          event_actor_user_id?: string | null
          event_created_at?: string | null
          event_id?: string | null
          event_message_ar?: string | null
          event_payload?: Json | null
          event_type?: string | null
          evidence: Json
          id?: string
          marker?: string
          request_completed_at?: string | null
          request_id: string
          request_number: string
          request_status?: string | null
        }
        Update: {
          archive_step_comment?: string | null
          archive_step_completed_at?: string | null
          archive_step_completed_by?: string | null
          archive_step_decision?: string | null
          archive_step_id?: string | null
          archive_step_status?: string | null
          captured_at?: string
          event_actor_user_id?: string | null
          event_created_at?: string | null
          event_id?: string | null
          event_message_ar?: string | null
          event_payload?: Json | null
          event_type?: string | null
          evidence?: Json
          id?: string
          marker?: string
          request_completed_at?: string | null
          request_id?: string
          request_number?: string
          request_status?: string | null
        }
        Relationships: []
      }
      b1_workflow_runtime_contract_snapshot: {
        Row: {
          action_code: string | null
          action_type: string
          id: string
          pinned_at: string
          request_type_code: string
          role_code: string
          step_key: string
          step_order: number
          unit_code: string
          workflow_id: string
          workflow_version: number
        }
        Insert: {
          action_code?: string | null
          action_type: string
          id?: string
          pinned_at?: string
          request_type_code: string
          role_code: string
          step_key: string
          step_order: number
          unit_code: string
          workflow_id: string
          workflow_version: number
        }
        Update: {
          action_code?: string | null
          action_type?: string
          id?: string
          pinned_at?: string
          request_type_code?: string
          role_code?: string
          step_key?: string
          step_order?: number
          unit_code?: string
          workflow_id?: string
          workflow_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "b1_workflow_runtime_contract_snapshot_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "request_type_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_verifications: {
        Row: {
          check_kind: string
          checklist_items: string[]
          created_at: string
          id: string
          notes: string | null
          observed_rpo_minutes: number | null
          observed_rto_minutes: number | null
          performed_by: string
          result: string
          verified_at: string
        }
        Insert: {
          check_kind: string
          checklist_items?: string[]
          created_at?: string
          id?: string
          notes?: string | null
          observed_rpo_minutes?: number | null
          observed_rto_minutes?: number | null
          performed_by?: string
          result: string
          verified_at?: string
        }
        Update: {
          check_kind?: string
          checklist_items?: string[]
          created_at?: string
          id?: string
          notes?: string | null
          observed_rpo_minutes?: number | null
          observed_rto_minutes?: number | null
          performed_by?: string
          result?: string
          verified_at?: string
        }
        Relationships: []
      }
      buildings: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      central_signatory_references: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name_ar: string
          scope: string
          title_ar: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name_ar: string
          scope?: string
          title_ar: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          scope?: string
          title_ar?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_schedule: {
        Row: {
          course_section_id: string
          created_at: string
          faculty_profile_id: string | null
          id: string
          room_id: string
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          status: Database["public"]["Enums"]["schedule_status"]
          time_slot_id: string
          updated_at: string
        }
        Insert: {
          course_section_id: string
          created_at?: string
          faculty_profile_id?: string | null
          id?: string
          room_id: string
          schedule_type?: Database["public"]["Enums"]["schedule_type"]
          status?: Database["public"]["Enums"]["schedule_status"]
          time_slot_id: string
          updated_at?: string
        }
        Update: {
          course_section_id?: string
          created_at?: string
          faculty_profile_id?: string | null
          id?: string
          room_id?: string
          schedule_type?: Database["public"]["Enums"]["schedule_type"]
          status?: Database["public"]["Enums"]["schedule_status"]
          time_slot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedule_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_schedule_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_section_id"]
          },
          {
            foreignKeyName: "class_schedule_faculty_profile_id_fkey"
            columns: ["faculty_profile_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_schedule_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_schedule_time_slot_id_fkey"
            columns: ["time_slot_id"]
            isOneToOne: false
            referencedRelation: "time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_read: boolean
          message: string
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_read?: boolean
          message: string
          status?: string
          subject: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_read?: boolean
          message?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      course_delivery_plan_sessions: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          planned_title: string
          planned_topics: string | null
          session_number: number
          syllabus_session_id: string | null
          updated_at: string
          week_number: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          planned_title: string
          planned_topics?: string | null
          session_number: number
          syllabus_session_id?: string | null
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          planned_title?: string
          planned_topics?: string | null
          session_number?: number
          syllabus_session_id?: string | null
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_delivery_plan_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "course_delivery_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_delivery_plan_sessions_syllabus_session_id_fkey"
            columns: ["syllabus_session_id"]
            isOneToOne: false
            referencedRelation: "course_syllabus_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_delivery_plans: {
        Row: {
          course_section_id: string
          created_at: string
          created_by: string | null
          id: string
          is_current: boolean
          planned_session_count: number
          published_at: string | null
          source: string
          status: string
          superseded_at: string | null
          superseded_by: string | null
          syllabus_id: string | null
          syllabus_version: number | null
          updated_at: string
        }
        Insert: {
          course_section_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean
          planned_session_count: number
          published_at?: string | null
          source?: string
          status?: string
          superseded_at?: string | null
          superseded_by?: string | null
          syllabus_id?: string | null
          syllabus_version?: number | null
          updated_at?: string
        }
        Update: {
          course_section_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean
          planned_session_count?: number
          published_at?: string | null
          source?: string
          status?: string
          superseded_at?: string | null
          superseded_by?: string | null
          syllabus_id?: string | null
          syllabus_version?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_delivery_plans_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_delivery_plans_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_section_id"]
          },
          {
            foreignKeyName: "course_delivery_plans_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "course_delivery_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_delivery_plans_syllabus_id_fkey"
            columns: ["syllabus_id"]
            isOneToOne: false
            referencedRelation: "course_syllabi"
            referencedColumns: ["id"]
          },
        ]
      }
      course_material_events: {
        Row: {
          actor_user_id: string | null
          course_material_id: string
          created_at: string
          event: string
          id: string
          meta: Json | null
        }
        Insert: {
          actor_user_id?: string | null
          course_material_id: string
          created_at?: string
          event: string
          id?: string
          meta?: Json | null
        }
        Update: {
          actor_user_id?: string | null
          course_material_id?: string
          created_at?: string
          event?: string
          id?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "course_material_events_course_material_id_fkey"
            columns: ["course_material_id"]
            isOneToOne: false
            referencedRelation: "course_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      course_material_files: {
        Row: {
          course_material_id: string
          file_hash: string | null
          id: string
          mime_type: string
          original_filename: string
          scan_state: string
          size_bytes: number
          storage_path: string
          uploaded_at: string
          version_number: number
        }
        Insert: {
          course_material_id: string
          file_hash?: string | null
          id?: string
          mime_type: string
          original_filename: string
          scan_state?: string
          size_bytes: number
          storage_path: string
          uploaded_at?: string
          version_number?: number
        }
        Update: {
          course_material_id?: string
          file_hash?: string | null
          id?: string
          mime_type?: string
          original_filename?: string
          scan_state?: string
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_material_files_course_material_id_fkey"
            columns: ["course_material_id"]
            isOneToOne: false
            referencedRelation: "course_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      course_materials: {
        Row: {
          course_section_id: string
          created_at: string
          description: string | null
          faculty_profile_id: string
          id: string
          lecture_number: number | null
          material_scope: string
          plan_session_id: string | null
          published_at: string | null
          status: string
          study_system: string
          title: string
          updated_at: string
          week_number: number | null
        }
        Insert: {
          course_section_id: string
          created_at?: string
          description?: string | null
          faculty_profile_id: string
          id?: string
          lecture_number?: number | null
          material_scope?: string
          plan_session_id?: string | null
          published_at?: string | null
          status?: string
          study_system: string
          title: string
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          course_section_id?: string
          created_at?: string
          description?: string | null
          faculty_profile_id?: string
          id?: string
          lecture_number?: number | null
          material_scope?: string
          plan_session_id?: string | null
          published_at?: string | null
          status?: string
          study_system?: string
          title?: string
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_materials_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_materials_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_section_id"]
          },
          {
            foreignKeyName: "course_materials_faculty_profile_id_fkey"
            columns: ["faculty_profile_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_materials_plan_session_id_fkey"
            columns: ["plan_session_id"]
            isOneToOne: false
            referencedRelation: "course_delivery_plan_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_offerings: {
        Row: {
          academic_year_id: string
          course_id: string
          created_at: string
          id: string
          level_id: string
          program_id: string
          semester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          course_id: string
          created_at?: string
          id?: string
          level_id: string
          program_id: string
          semester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          course_id?: string
          created_at?: string
          id?: string
          level_id?: string
          program_id?: string
          semester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_offerings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_offerings_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "academic_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      course_sections: {
        Row: {
          capacity: number | null
          course_offering_id: string
          created_at: string
          faculty_profile_id: string | null
          id: string
          section_code: string
          status: string
          study_system: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          course_offering_id: string
          created_at?: string
          faculty_profile_id?: string | null
          id?: string
          section_code: string
          status?: string
          study_system?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          course_offering_id?: string
          created_at?: string
          faculty_profile_id?: string | null
          id?: string
          section_code?: string
          status?: string
          study_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_sections_course_offering_id_fkey"
            columns: ["course_offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_sections_faculty_profile_id_fkey"
            columns: ["faculty_profile_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_session_execution_events: {
        Row: {
          actor_id: string | null
          compensation_date: string | null
          created_at: string
          execution_date: string | null
          from_status: string | null
          id: string
          notes: string | null
          plan_session_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          compensation_date?: string | null
          created_at?: string
          execution_date?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          plan_session_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          compensation_date?: string | null
          created_at?: string
          execution_date?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          plan_session_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_session_execution_events_plan_session_id_fkey"
            columns: ["plan_session_id"]
            isOneToOne: false
            referencedRelation: "course_delivery_plan_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_session_executions: {
        Row: {
          compensation_date: string | null
          compensation_recorded_at: string | null
          created_at: string
          execution_date: string | null
          id: string
          migration_review_flag: boolean
          notes: string | null
          plan_session_id: string
          previous_status: string | null
          reason: string | null
          recorded_at: string
          recorded_by: string
          status: string
          updated_at: string
        }
        Insert: {
          compensation_date?: string | null
          compensation_recorded_at?: string | null
          created_at?: string
          execution_date?: string | null
          id?: string
          migration_review_flag?: boolean
          notes?: string | null
          plan_session_id: string
          previous_status?: string | null
          reason?: string | null
          recorded_at?: string
          recorded_by: string
          status: string
          updated_at?: string
        }
        Update: {
          compensation_date?: string | null
          compensation_recorded_at?: string | null
          created_at?: string
          execution_date?: string | null
          id?: string
          migration_review_flag?: boolean
          notes?: string | null
          plan_session_id?: string
          previous_status?: string | null
          reason?: string | null
          recorded_at?: string
          recorded_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_session_executions_plan_session_id_fkey"
            columns: ["plan_session_id"]
            isOneToOne: true
            referencedRelation: "course_delivery_plan_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_syllabi: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          course_id: string
          created_at: string
          created_by: string | null
          description_ar: string | null
          id: string
          is_current: boolean
          objectives_ar: string | null
          planned_session_count: number
          references_ar: string | null
          source_fingerprint: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          id?: string
          is_current?: boolean
          objectives_ar?: string | null
          planned_session_count?: number
          references_ar?: string | null
          source_fingerprint?: string | null
          status?: string
          updated_at?: string
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          id?: string
          is_current?: boolean
          objectives_ar?: string | null
          planned_session_count?: number
          references_ar?: string | null
          source_fingerprint?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_syllabi_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_syllabi_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_id"]
          },
        ]
      }
      course_syllabus_sessions: {
        Row: {
          created_at: string
          id: string
          session_number: number
          syllabus_id: string
          title_ar: string
          topics_ar: string | null
          updated_at: string
          week_number: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          session_number: number
          syllabus_id: string
          title_ar: string
          topics_ar?: string | null
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          session_number?: number
          syllabus_id?: string
          title_ar?: string
          topics_ar?: string | null
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_syllabus_sessions_syllabus_id_fkey"
            columns: ["syllabus_id"]
            isOneToOne: false
            referencedRelation: "course_syllabi"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          credit_hours: number
          department_id: string | null
          description_ar: string | null
          id: string
          name_ar: string
          name_en: string | null
          practical_hours: number
          status: string
          theory_hours: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          credit_hours?: number
          department_id?: string | null
          description_ar?: string | null
          id?: string
          name_ar: string
          name_en?: string | null
          practical_hours?: number
          status?: string
          theory_hours?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          credit_hours?: number
          department_id?: string | null
          description_ar?: string | null
          id?: string
          name_ar?: string
          name_en?: string | null
          practical_hours?: number
          status?: string
          theory_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_stats: {
        Row: {
          icon: string | null
          id: string
          label_ar: string
          label_en: string | null
          sort_order: number
          stat_key: string
          updated_at: string
          value: number
        }
        Insert: {
          icon?: string | null
          id?: string
          label_ar: string
          label_en?: string | null
          sort_order?: number
          stat_key: string
          updated_at?: string
          value?: number
        }
        Update: {
          icon?: string | null
          id?: string
          label_ar?: string
          label_en?: string | null
          sort_order?: number
          stat_key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          icon: string | null
          id: string
          image: string | null
          is_active: boolean
          name_ar: string
          name_en: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          image?: string | null
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          image?: string | null
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      discount_types: {
        Row: {
          code: string
          created_at: string
          default_value: number
          description_ar: string | null
          discount_type: string
          id: string
          is_active: boolean
          name_ar: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_value?: number
          description_ar?: string | null
          discount_type: string
          id?: string
          is_active?: boolean
          name_ar: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_value?: number
          description_ar?: string | null
          discount_type?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          metadata: Json
          provider: string
          provider_message_id: string | null
          recipient_email: string
          related_entity_id: string | null
          related_entity_type: string | null
          status: string
          subject: string
          template_name: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_message_id?: string | null
          recipient_email: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          status: string
          subject: string
          template_name: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_message_id?: string | null
          recipient_email?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: string
          subject?: string
          template_name?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      enrollment_certificate_document_details: {
        Row: {
          academic_number: string
          academic_year_id: string | null
          academic_year_name: string
          created_at: string
          department_id: string | null
          department_name_ar: string
          enrollment_status: string
          id: string
          issued_snapshot_at: string
          level_id: string | null
          level_name: string
          official_document_id: string
          program_id: string | null
          program_name_ar: string
          semester_id: string | null
          semester_name: string
          student_name_ar: string
          student_profile_id: string
          student_request_id: string
          student_study_status: string | null
          study_system: string | null
          updated_at: string
        }
        Insert: {
          academic_number: string
          academic_year_id?: string | null
          academic_year_name: string
          created_at?: string
          department_id?: string | null
          department_name_ar: string
          enrollment_status: string
          id?: string
          issued_snapshot_at?: string
          level_id?: string | null
          level_name: string
          official_document_id: string
          program_id?: string | null
          program_name_ar: string
          semester_id?: string | null
          semester_name: string
          student_name_ar: string
          student_profile_id: string
          student_request_id: string
          student_study_status?: string | null
          study_system?: string | null
          updated_at?: string
        }
        Update: {
          academic_number?: string
          academic_year_id?: string | null
          academic_year_name?: string
          created_at?: string
          department_id?: string | null
          department_name_ar?: string
          enrollment_status?: string
          id?: string
          issued_snapshot_at?: string
          level_id?: string | null
          level_name?: string
          official_document_id?: string
          program_id?: string | null
          program_name_ar?: string
          semester_id?: string | null
          semester_name?: string
          student_name_ar?: string
          student_profile_id?: string
          student_request_id?: string
          student_study_status?: string | null
          study_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_certificate_document_detai_official_document_id_fkey"
            columns: ["official_document_id"]
            isOneToOne: true
            referencedRelation: "official_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_certificate_document_details_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_certificate_document_details_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_certificate_document_details_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "academic_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_certificate_document_details_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_certificate_document_details_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_certificate_document_details_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "enrollment_certificate_document_details_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_certificate_document_details_student_request_id_fkey"
            columns: ["student_request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_certificate_document_generation_attempts: {
        Row: {
          content_sha256: string | null
          created_at: string
          created_by: string | null
          document_type: string
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          file_size_bytes: number | null
          finalized_at: string | null
          generated_at: string | null
          generating_at: string | null
          id: string
          idempotency_key: string
          official_document_id: string | null
          prepared_at: string | null
          snapshot: Json | null
          status: string
          storage_bucket: string
          storage_path: string
          student_request_id: string
          updated_at: string
          uploaded_at: string | null
          verification_token_hash: string | null
          verification_token_pending: string | null
          workflow_step_id: string | null
        }
        Insert: {
          content_sha256?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          file_size_bytes?: number | null
          finalized_at?: string | null
          generated_at?: string | null
          generating_at?: string | null
          id?: string
          idempotency_key: string
          official_document_id?: string | null
          prepared_at?: string | null
          snapshot?: Json | null
          status: string
          storage_bucket?: string
          storage_path: string
          student_request_id: string
          updated_at?: string
          uploaded_at?: string | null
          verification_token_hash?: string | null
          verification_token_pending?: string | null
          workflow_step_id?: string | null
        }
        Update: {
          content_sha256?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          file_size_bytes?: number | null
          finalized_at?: string | null
          generated_at?: string | null
          generating_at?: string | null
          id?: string
          idempotency_key?: string
          official_document_id?: string | null
          prepared_at?: string | null
          snapshot?: Json | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          student_request_id?: string
          updated_at?: string
          uploaded_at?: string | null
          verification_token_hash?: string | null
          verification_token_pending?: string | null
          workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_certificate_document_gener_official_document_id_fkey"
            columns: ["official_document_id"]
            isOneToOne: false
            referencedRelation: "official_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_certificate_document_generat_student_request_id_fkey"
            columns: ["student_request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_reinstatement_details: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          reinstatement_reason: string
          request_id: string
          requested_from_academic_year_id: string
          requested_from_semester_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          reinstatement_reason: string
          request_id: string
          requested_from_academic_year_id: string
          requested_from_semester_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          reinstatement_reason?: string
          request_id?: string
          requested_from_academic_year_id?: string
          requested_from_semester_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_reinstatement_deta_requested_from_academic_year_fkey"
            columns: ["requested_from_academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_reinstatement_detail_requested_from_semester_id_fkey"
            columns: ["requested_from_semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_reinstatement_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_suspension_details: {
        Row: {
          created_at: string
          effect_applied_at: string | null
          id: string
          notes: string | null
          request_id: string
          requested_from_academic_year_id: string
          requested_from_semester_id: string
          suspension_duration_type: string
          suspension_reason: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effect_applied_at?: string | null
          id?: string
          notes?: string | null
          request_id: string
          requested_from_academic_year_id: string
          requested_from_semester_id: string
          suspension_duration_type: string
          suspension_reason: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effect_applied_at?: string | null
          id?: string
          notes?: string | null
          request_id?: string
          requested_from_academic_year_id?: string
          requested_from_semester_id?: string
          suspension_duration_type?: string
          suspension_reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_suspension_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_suspension_details_requested_from_academic_year_fkey"
            columns: ["requested_from_academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_suspension_details_requested_from_semester_id_fkey"
            columns: ["requested_from_semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      equivalency_courses: {
        Row: {
          created_at: string
          equivalency_request_id: string
          external_course_code: string
          external_course_name: string
          external_credit_hours: number | null
          id: string
          reviewer_notes: string | null
          status: string
          target_course_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          equivalency_request_id: string
          external_course_code: string
          external_course_name: string
          external_credit_hours?: number | null
          id?: string
          reviewer_notes?: string | null
          status?: string
          target_course_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          equivalency_request_id?: string
          external_course_code?: string
          external_course_name?: string
          external_credit_hours?: number | null
          id?: string
          reviewer_notes?: string | null
          status?: string
          target_course_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equivalency_courses_equivalency_request_id_fkey"
            columns: ["equivalency_request_id"]
            isOneToOne: false
            referencedRelation: "equivalency_request_details"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "equivalency_courses_target_course_id_fkey"
            columns: ["target_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equivalency_courses_target_course_id_fkey"
            columns: ["target_course_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_id"]
          },
        ]
      }
      equivalency_request_details: {
        Row: {
          created_at: string
          credits_applied_at: string | null
          id: string
          notes: string | null
          previous_program_name: string
          previous_university_name: string
          request_id: string
          transfer_reference: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_applied_at?: string | null
          id?: string
          notes?: string | null
          previous_program_name: string
          previous_university_name: string
          request_id: string
          transfer_reference?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_applied_at?: string | null
          id?: string
          notes?: string | null
          previous_program_name?: string
          previous_university_name?: string
          request_id?: string
          transfer_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equivalency_request_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          event_date: string
          event_time: string | null
          id: string
          image: string | null
          is_featured: boolean
          is_published: boolean
          location: string | null
          registration_url: string | null
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          image?: string | null
          is_featured?: boolean
          is_published?: boolean
          location?: string | null
          registration_url?: string | null
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          image?: string | null
          is_featured?: boolean
          is_published?: boolean
          location?: string | null
          registration_url?: string | null
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      extra_chance_details: {
        Row: {
          academic_year_id: string
          chance_applied_at: string | null
          chance_type: string
          created_at: string
          id: string
          notes: string | null
          reason: string
          request_id: string
          semester_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          chance_applied_at?: string | null
          chance_type: string
          created_at?: string
          id?: string
          notes?: string | null
          reason: string
          request_id: string
          semester_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          chance_applied_at?: string | null
          chance_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string
          request_id?: string
          semester_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_chance_details_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_chance_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_chance_details_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty: {
        Row: {
          admin_position: string | null
          admin_position_order: number | null
          bio_ar: string | null
          bio_en: string | null
          category: string
          created_at: string
          degree: string | null
          email: string | null
          employee_id: string
          full_name_ar: string
          full_name_en: string | null
          id: string
          is_active: boolean
          phone: string | null
          photo: string | null
          program_id: string | null
          rank: string | null
          sort_order: number
          specialization: string | null
          start_year: number | null
          updated_at: string
        }
        Insert: {
          admin_position?: string | null
          admin_position_order?: number | null
          bio_ar?: string | null
          bio_en?: string | null
          category?: string
          created_at?: string
          degree?: string | null
          email?: string | null
          employee_id: string
          full_name_ar: string
          full_name_en?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          photo?: string | null
          program_id?: string | null
          rank?: string | null
          sort_order?: number
          specialization?: string | null
          start_year?: number | null
          updated_at?: string
        }
        Update: {
          admin_position?: string | null
          admin_position_order?: number | null
          bio_ar?: string | null
          bio_en?: string | null
          category?: string
          created_at?: string
          degree?: string | null
          email?: string | null
          employee_id?: string
          full_name_ar?: string
          full_name_en?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          photo?: string | null
          program_id?: string | null
          rank?: string | null
          sort_order?: number
          specialization?: string | null
          start_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty_profiles: {
        Row: {
          academic_rank: string | null
          created_at: string
          department_id: string | null
          employee_number: string | null
          faculty_id: string
          full_name_ar: string
          full_name_en: string | null
          id: string
          must_change_password: boolean
          position_title: string | null
          program_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          academic_rank?: string | null
          created_at?: string
          department_id?: string | null
          employee_number?: string | null
          faculty_id: string
          full_name_ar: string
          full_name_en?: string | null
          id?: string
          must_change_password?: boolean
          position_title?: string | null
          program_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          academic_rank?: string | null
          created_at?: string
          department_id?: string | null
          employee_number?: string | null
          faculty_id?: string
          full_name_ar?: string
          full_name_en?: string | null
          id?: string
          must_change_password?: boolean
          position_title?: string | null
          program_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faculty_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_profiles_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: true
            referencedRelation: "faculty"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_profiles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_types: {
        Row: {
          amount: number
          code: string
          created_at: string
          description_ar: string | null
          id: string
          is_active: boolean
          name_ar: string
          updated_at: string
        }
        Insert: {
          amount?: number
          code: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          updated_at?: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          updated_at?: string
        }
        Relationships: []
      }
      file_withdrawal_details: {
        Row: {
          activities_cleared_at: string | null
          created_at: string
          effect_applied_at: string | null
          finance_cleared_at: string | null
          impact_ack: boolean
          labs_cleared_at: string | null
          library_cleared_at: string | null
          notes: string | null
          records_transferred_at: string | null
          request_id: string
          updated_at: string
          withdrawal_reason: string
        }
        Insert: {
          activities_cleared_at?: string | null
          created_at?: string
          effect_applied_at?: string | null
          finance_cleared_at?: string | null
          impact_ack: boolean
          labs_cleared_at?: string | null
          library_cleared_at?: string | null
          notes?: string | null
          records_transferred_at?: string | null
          request_id: string
          updated_at?: string
          withdrawal_reason: string
        }
        Update: {
          activities_cleared_at?: string | null
          created_at?: string
          effect_applied_at?: string | null
          finance_cleared_at?: string | null
          impact_ack?: boolean
          labs_cleared_at?: string | null
          library_cleared_at?: string | null
          notes?: string | null
          records_transferred_at?: string | null
          request_id?: string
          updated_at?: string
          withdrawal_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_withdrawal_details_request_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ga_e2e_matrix_results: {
        Row: {
          case_name: string
          case_no: number
          created_at: string
          detail: string | null
          expectation: string
          id: string
          outcome: string
          run_tag: string
        }
        Insert: {
          case_name: string
          case_no: number
          created_at?: string
          detail?: string | null
          expectation: string
          id?: string
          outcome: string
          run_tag: string
        }
        Update: {
          case_name?: string
          case_no?: number
          created_at?: string
          detail?: string | null
          expectation?: string
          id?: string
          outcome?: string
          run_tag?: string
        }
        Relationships: []
      }
      ga_ops_authz_matrix_results: {
        Row: {
          actor: string
          actual: string
          created_at: string
          expected: string
          id: string
          op: string
          run_id: string
          verdict: string
        }
        Insert: {
          actor: string
          actual: string
          created_at?: string
          expected: string
          id?: string
          op: string
          run_id: string
          verdict: string
        }
        Update: {
          actor?: string
          actual?: string
          created_at?: string
          expected?: string
          id?: string
          op?: string
          run_id?: string
          verdict?: string
        }
        Relationships: []
      }
      ga_ops_lifecycle_matrix_results: {
        Row: {
          actor: string
          actual: string
          created_at: string
          detail: string | null
          domain: string
          expected: string
          id: string
          run_id: string
          step: string
          verdict: string
        }
        Insert: {
          actor: string
          actual: string
          created_at?: string
          detail?: string | null
          domain: string
          expected: string
          id?: string
          run_id: string
          step: string
          verdict: string
        }
        Update: {
          actor?: string
          actual?: string
          created_at?: string
          detail?: string | null
          domain?: string
          expected?: string
          id?: string
          run_id?: string
          step?: string
          verdict?: string
        }
        Relationships: []
      }
      grade_appeal_details: {
        Row: {
          academic_year_id: string
          appeal_kind: string
          appeal_window_end: string | null
          approved_final_result: number | null
          approved_total_score: number | null
          course_id: string | null
          course_section_id: string
          created_at: string
          current_grade_status: string | null
          current_grade_total: number | null
          final_result_published_at: string | null
          grades_applied_at: string | null
          id: string
          notes: string | null
          previous_final_result: number | null
          reason: string
          request_id: string
          result_change_applied_at: string | null
          result_change_applied_by: string | null
          semester_id: string
          student_enrollment_id: string | null
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          appeal_kind?: string
          appeal_window_end?: string | null
          approved_final_result?: number | null
          approved_total_score?: number | null
          course_id?: string | null
          course_section_id: string
          created_at?: string
          current_grade_status?: string | null
          current_grade_total?: number | null
          final_result_published_at?: string | null
          grades_applied_at?: string | null
          id?: string
          notes?: string | null
          previous_final_result?: number | null
          reason: string
          request_id: string
          result_change_applied_at?: string | null
          result_change_applied_by?: string | null
          semester_id: string
          student_enrollment_id?: string | null
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          appeal_kind?: string
          appeal_window_end?: string | null
          approved_final_result?: number | null
          approved_total_score?: number | null
          course_id?: string | null
          course_section_id?: string
          created_at?: string
          current_grade_status?: string | null
          current_grade_total?: number | null
          final_result_published_at?: string | null
          grades_applied_at?: string | null
          id?: string
          notes?: string | null
          previous_final_result?: number | null
          reason?: string
          request_id?: string
          result_change_applied_at?: string | null
          result_change_applied_by?: string | null
          semester_id?: string
          student_enrollment_id?: string | null
          student_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_appeal_details_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_appeal_details_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_appeal_details_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "grade_appeal_details_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_appeal_details_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_section_id"]
          },
          {
            foreignKeyName: "grade_appeal_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_appeal_details_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_appeal_details_student_enrollment_id_fkey"
            columns: ["student_enrollment_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "grade_appeal_details_student_enrollment_id_fkey"
            columns: ["student_enrollment_id"]
            isOneToOne: false
            referencedRelation: "student_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_components: {
        Row: {
          course_section_id: string
          created_at: string
          id: string
          max_score: number
          name: string
          sort_order: number
          updated_at: string
          weight: number | null
        }
        Insert: {
          course_section_id: string
          created_at?: string
          id?: string
          max_score: number
          name: string
          sort_order?: number
          updated_at?: string
          weight?: number | null
        }
        Update: {
          course_section_id?: string
          created_at?: string
          id?: string
          max_score?: number
          name?: string
          sort_order?: number
          updated_at?: string
          weight?: number | null
        }
        Relationships: []
      }
      graduate_account_continuity_policies: {
        Row: {
          allow_portal_sign_in: boolean
          allow_university_email_reuse: boolean
          allowed_capabilities: Json
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          id: string
          is_current: boolean
          policy_code: string
          policy_state: Database["public"]["Enums"]["graduate_account_policy_state"]
          supersedes_policy_id: string | null
          valid_from: string | null
        }
        Insert: {
          allow_portal_sign_in?: boolean
          allow_university_email_reuse?: boolean
          allowed_capabilities?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          is_current?: boolean
          policy_code: string
          policy_state?: Database["public"]["Enums"]["graduate_account_policy_state"]
          supersedes_policy_id?: string | null
          valid_from?: string | null
        }
        Update: {
          allow_portal_sign_in?: boolean
          allow_university_email_reuse?: boolean
          allowed_capabilities?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          is_current?: boolean
          policy_code?: string
          policy_state?: Database["public"]["Enums"]["graduate_account_policy_state"]
          supersedes_policy_id?: string | null
          valid_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graduate_account_continuity_policies_supersedes_policy_id_fkey"
            columns: ["supersedes_policy_id"]
            isOneToOne: false
            referencedRelation: "graduate_account_continuity_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_communication_events: {
        Row: {
          channel: string
          consent_id: string
          contact_point_id: string
          graduate_record_id: string
          id: string
          notice_version: string
          payload_meta: Json
          purpose_code: string
          sent_at: string
          sent_by: string
          template_code: string
        }
        Insert: {
          channel: string
          consent_id: string
          contact_point_id: string
          graduate_record_id: string
          id?: string
          notice_version: string
          payload_meta?: Json
          purpose_code: string
          sent_at?: string
          sent_by: string
          template_code: string
        }
        Update: {
          channel?: string
          consent_id?: string
          contact_point_id?: string
          graduate_record_id?: string
          id?: string
          notice_version?: string
          payload_meta?: Json
          purpose_code?: string
          sent_at?: string
          sent_by?: string
          template_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduate_communication_events_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "graduate_consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_communication_events_contact_point_id_fkey"
            columns: ["contact_point_id"]
            isOneToOne: false
            referencedRelation: "graduate_contact_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_communication_events_graduate_record_id_fkey"
            columns: ["graduate_record_id"]
            isOneToOne: false
            referencedRelation: "graduate_records"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_consents: {
        Row: {
          affirmative_action_at: string
          consent_state: string
          created_at: string
          graduate_record_id: string
          id: string
          notice_version: string
          purpose_code: string
          withdrawn_at: string | null
        }
        Insert: {
          affirmative_action_at: string
          consent_state: string
          created_at?: string
          graduate_record_id: string
          id?: string
          notice_version: string
          purpose_code: string
          withdrawn_at?: string | null
        }
        Update: {
          affirmative_action_at?: string
          consent_state?: string
          created_at?: string
          graduate_record_id?: string
          id?: string
          notice_version?: string
          purpose_code?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graduate_consents_graduate_record_id_fkey"
            columns: ["graduate_record_id"]
            isOneToOne: false
            referencedRelation: "graduate_records"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_contact_points: {
        Row: {
          channel_type: string
          created_at: string
          graduate_record_id: string
          id: string
          protected_value: string
          purpose_code: string
          revoked_at: string | null
          verified_at: string | null
        }
        Insert: {
          channel_type: string
          created_at?: string
          graduate_record_id: string
          id?: string
          protected_value: string
          purpose_code: string
          revoked_at?: string | null
          verified_at?: string | null
        }
        Update: {
          channel_type?: string
          created_at?: string
          graduate_record_id?: string
          id?: string
          protected_value?: string
          purpose_code?: string
          revoked_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graduate_contact_points_graduate_record_id_fkey"
            columns: ["graduate_record_id"]
            isOneToOne: false
            referencedRelation: "graduate_records"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_domain_events: {
        Row: {
          actor_user_id: string
          aggregate_id: string
          aggregate_type: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          purpose_code: string
        }
        Insert: {
          actor_user_id: string
          aggregate_id: string
          aggregate_type: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          purpose_code: string
        }
        Update: {
          actor_user_id?: string
          aggregate_id?: string
          aggregate_type?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          purpose_code?: string
        }
        Relationships: []
      }
      graduate_employers: {
        Row: {
          archived_at: string | null
          id: string
          legal_name: string
          normalized_name: string
          sector_code: string | null
          verification_state: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          archived_at?: string | null
          id?: string
          legal_name: string
          normalized_name: string
          sector_code?: string | null
          verification_state?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          archived_at?: string | null
          id?: string
          legal_name?: string
          normalized_name?: string
          sector_code?: string | null
          verification_state?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      graduate_employment_events: {
        Row: {
          employer_id: string | null
          employer_name_reported: string | null
          employment_status: Database["public"]["Enums"]["graduate_employment_status"]
          ended_on: string | null
          graduate_record_id: string
          id: string
          occupation_title: string | null
          recorded_at: string
          specialization_relationship: Database["public"]["Enums"]["graduate_specialization_relationship"]
          started_on: string | null
          supersedes_event_id: string | null
          verification_state: string
        }
        Insert: {
          employer_id?: string | null
          employer_name_reported?: string | null
          employment_status: Database["public"]["Enums"]["graduate_employment_status"]
          ended_on?: string | null
          graduate_record_id: string
          id?: string
          occupation_title?: string | null
          recorded_at?: string
          specialization_relationship?: Database["public"]["Enums"]["graduate_specialization_relationship"]
          started_on?: string | null
          supersedes_event_id?: string | null
          verification_state?: string
        }
        Update: {
          employer_id?: string | null
          employer_name_reported?: string | null
          employment_status?: Database["public"]["Enums"]["graduate_employment_status"]
          ended_on?: string | null
          graduate_record_id?: string
          id?: string
          occupation_title?: string | null
          recorded_at?: string
          specialization_relationship?: Database["public"]["Enums"]["graduate_specialization_relationship"]
          started_on?: string | null
          supersedes_event_id?: string | null
          verification_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduate_employment_events_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "graduate_employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_employment_events_graduate_record_id_fkey"
            columns: ["graduate_record_id"]
            isOneToOne: false
            referencedRelation: "graduate_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_employment_events_supersedes_event_id_fkey"
            columns: ["supersedes_event_id"]
            isOneToOne: false
            referencedRelation: "graduate_employment_events"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_event_registrations: {
        Row: {
          cancelled_at: string | null
          consent_id: string
          event_id: string
          graduate_record_id: string
          id: string
          registered_at: string
        }
        Insert: {
          cancelled_at?: string | null
          consent_id: string
          event_id: string
          graduate_record_id: string
          id?: string
          registered_at?: string
        }
        Update: {
          cancelled_at?: string | null
          consent_id?: string
          event_id?: string
          graduate_record_id?: string
          id?: string
          registered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduate_event_registrations_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "graduate_consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "graduate_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_event_registrations_graduate_record_id_fkey"
            columns: ["graduate_record_id"]
            isOneToOne: false
            referencedRelation: "graduate_records"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_events: {
        Row: {
          audience_scope: Json
          ends_at: string
          event_type: string
          id: string
          notice_version: string
          purpose_code: string
          starts_at: string
          state: string
          title: string
        }
        Insert: {
          audience_scope?: Json
          ends_at: string
          event_type: string
          id?: string
          notice_version: string
          purpose_code: string
          starts_at: string
          state?: string
          title: string
        }
        Update: {
          audience_scope?: Json
          ends_at?: string
          event_type?: string
          id?: string
          notice_version?: string
          purpose_code?: string
          starts_at?: string
          state?: string
          title?: string
        }
        Relationships: []
      }
      graduate_followup_types: {
        Row: {
          code: string
          created_at: string
          description_ar: string | null
          id: string
          is_active: boolean
          label_ar: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          label_ar: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          label_ar?: string
          updated_at?: string
        }
        Relationships: []
      }
      graduate_followup_workflows: {
        Row: {
          created_at: string
          followup_type_id: string
          id: string
          initial_state: string
          is_current: boolean
          max_active_per_graduate: number
          notes: string | null
          published_at: string | null
          require_outcome_on_complete: boolean
          states: Json
          status: Database["public"]["Enums"]["graduate_followup_workflow_status"]
          superseded_at: string | null
          terminal_states: Json
          transitions: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          followup_type_id: string
          id?: string
          initial_state: string
          is_current?: boolean
          max_active_per_graduate?: number
          notes?: string | null
          published_at?: string | null
          require_outcome_on_complete?: boolean
          states: Json
          status?: Database["public"]["Enums"]["graduate_followup_workflow_status"]
          superseded_at?: string | null
          terminal_states?: Json
          transitions: Json
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          followup_type_id?: string
          id?: string
          initial_state?: string
          is_current?: boolean
          max_active_per_graduate?: number
          notes?: string | null
          published_at?: string | null
          require_outcome_on_complete?: boolean
          states?: Json
          status?: Database["public"]["Enums"]["graduate_followup_workflow_status"]
          superseded_at?: string | null
          terminal_states?: Json
          transitions?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "graduate_followup_workflows_followup_type_id_fkey"
            columns: ["followup_type_id"]
            isOneToOne: false
            referencedRelation: "graduate_followup_types"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_followups: {
        Row: {
          assignee_user_id: string
          created_at: string
          followup_type_id: string | null
          graduate_record_id: string
          id: string
          next_action_at: string | null
          notes_protected: string | null
          outcome: string | null
          purpose_code: string
          state: string
          updated_at: string
          workflow_id: string | null
          workflow_pin_source: string
          workflow_pinned_at: string
          workflow_snapshot: Json
        }
        Insert: {
          assignee_user_id: string
          created_at?: string
          followup_type_id?: string | null
          graduate_record_id: string
          id?: string
          next_action_at?: string | null
          notes_protected?: string | null
          outcome?: string | null
          purpose_code: string
          state?: string
          updated_at?: string
          workflow_id?: string | null
          workflow_pin_source: string
          workflow_pinned_at?: string
          workflow_snapshot?: Json
        }
        Update: {
          assignee_user_id?: string
          created_at?: string
          followup_type_id?: string | null
          graduate_record_id?: string
          id?: string
          next_action_at?: string | null
          notes_protected?: string | null
          outcome?: string | null
          purpose_code?: string
          state?: string
          updated_at?: string
          workflow_id?: string | null
          workflow_pin_source?: string
          workflow_pinned_at?: string
          workflow_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "graduate_followups_followup_type_id_fkey"
            columns: ["followup_type_id"]
            isOneToOne: false
            referencedRelation: "graduate_followup_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_followups_graduate_record_id_fkey"
            columns: ["graduate_record_id"]
            isOneToOne: false
            referencedRelation: "graduate_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_followups_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "graduate_followup_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_official_decisions: {
        Row: {
          academic_snapshot: Json | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          decision_state: Database["public"]["Enums"]["graduate_decision_state"]
          department_id: string | null
          effective_graduation_date: string | null
          id: string
          program_id: string | null
          source_kind: Database["public"]["Enums"]["graduate_source_kind"]
          source_payload_sha256: string
          source_reference: string
          student_profile_id: string
          supersedes_decision_id: string | null
        }
        Insert: {
          academic_snapshot?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decision_state?: Database["public"]["Enums"]["graduate_decision_state"]
          department_id?: string | null
          effective_graduation_date?: string | null
          id?: string
          program_id?: string | null
          source_kind: Database["public"]["Enums"]["graduate_source_kind"]
          source_payload_sha256: string
          source_reference: string
          student_profile_id: string
          supersedes_decision_id?: string | null
        }
        Update: {
          academic_snapshot?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decision_state?: Database["public"]["Enums"]["graduate_decision_state"]
          department_id?: string | null
          effective_graduation_date?: string | null
          id?: string
          program_id?: string | null
          source_kind?: Database["public"]["Enums"]["graduate_source_kind"]
          source_payload_sha256?: string
          source_reference?: string
          student_profile_id?: string
          supersedes_decision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graduate_official_decisions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_official_decisions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_official_decisions_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "graduate_official_decisions_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_official_decisions_supersedes_decision_id_fkey"
            columns: ["supersedes_decision_id"]
            isOneToOne: false
            referencedRelation: "graduate_official_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_opportunities: {
        Row: {
          audience_scope: Json
          closes_at: string | null
          created_at: string
          description: string
          employer_id: string | null
          id: string
          moderated_by: string | null
          opportunity_type: string
          published_at: string | null
          state: Database["public"]["Enums"]["graduate_opportunity_state"]
          title: string
        }
        Insert: {
          audience_scope?: Json
          closes_at?: string | null
          created_at?: string
          description: string
          employer_id?: string | null
          id?: string
          moderated_by?: string | null
          opportunity_type: string
          published_at?: string | null
          state?: Database["public"]["Enums"]["graduate_opportunity_state"]
          title: string
        }
        Update: {
          audience_scope?: Json
          closes_at?: string | null
          created_at?: string
          description?: string
          employer_id?: string | null
          id?: string
          moderated_by?: string | null
          opportunity_type?: string
          published_at?: string | null
          state?: Database["public"]["Enums"]["graduate_opportunity_state"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduate_opportunities_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "graduate_employers"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_profiles: {
        Row: {
          career_summary: string | null
          graduate_record_id: string
          preferred_contact_channel: string | null
          profile_visibility: string
          public_display_name: string | null
          row_version: number
          updated_at: string
        }
        Insert: {
          career_summary?: string | null
          graduate_record_id: string
          preferred_contact_channel?: string | null
          profile_visibility?: string
          public_display_name?: string | null
          row_version?: number
          updated_at?: string
        }
        Update: {
          career_summary?: string | null
          graduate_record_id?: string
          preferred_contact_channel?: string | null
          profile_visibility?: string
          public_display_name?: string | null
          row_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduate_profiles_graduate_record_id_fkey"
            columns: ["graduate_record_id"]
            isOneToOne: true
            referencedRelation: "graduate_records"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_records: {
        Row: {
          academic_snapshot: Json
          created_at: string
          created_by: string
          department_id: string
          effective_graduation_date: string
          id: string
          official_decision_id: string
          program_id: string
          record_state: Database["public"]["Enums"]["graduate_decision_state"]
          student_profile_id: string
          version: number
        }
        Insert: {
          academic_snapshot: Json
          created_at?: string
          created_by: string
          department_id: string
          effective_graduation_date: string
          id?: string
          official_decision_id: string
          program_id: string
          record_state?: Database["public"]["Enums"]["graduate_decision_state"]
          student_profile_id: string
          version?: number
        }
        Update: {
          academic_snapshot?: Json
          created_at?: string
          created_by?: string
          department_id?: string
          effective_graduation_date?: string
          id?: string
          official_decision_id?: string
          program_id?: string
          record_state?: Database["public"]["Enums"]["graduate_decision_state"]
          student_profile_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "graduate_records_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_records_official_decision_id_fkey"
            columns: ["official_decision_id"]
            isOneToOne: true
            referencedRelation: "graduate_official_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_records_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_records_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "graduate_records_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_survey_responses: {
        Row: {
          answers: Json
          consent_id: string
          graduate_record_id: string
          id: string
          submitted_at: string
          survey_version_id: string
          withdrawn_at: string | null
        }
        Insert: {
          answers: Json
          consent_id: string
          graduate_record_id: string
          id?: string
          submitted_at?: string
          survey_version_id: string
          withdrawn_at?: string | null
        }
        Update: {
          answers?: Json
          consent_id?: string
          graduate_record_id?: string
          id?: string
          submitted_at?: string
          survey_version_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graduate_survey_responses_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "graduate_consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_survey_responses_graduate_record_id_fkey"
            columns: ["graduate_record_id"]
            isOneToOne: false
            referencedRelation: "graduate_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduate_survey_responses_survey_version_id_fkey"
            columns: ["survey_version_id"]
            isOneToOne: false
            referencedRelation: "graduate_survey_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_survey_versions: {
        Row: {
          id: string
          notice_version: string
          published_at: string | null
          questions: Json
          survey_id: string
          version: number
        }
        Insert: {
          id?: string
          notice_version: string
          published_at?: string | null
          questions: Json
          survey_id: string
          version: number
        }
        Update: {
          id?: string
          notice_version?: string
          published_at?: string | null
          questions?: Json
          survey_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "graduate_survey_versions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "graduate_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      graduate_surveys: {
        Row: {
          audience_scope: Json
          created_at: string
          id: string
          minimum_report_cell_size: number
          purpose_code: string
          state: string
          title: string
        }
        Insert: {
          audience_scope?: Json
          created_at?: string
          id?: string
          minimum_report_cell_size?: number
          purpose_code: string
          state?: string
          title: string
        }
        Update: {
          audience_scope?: Json
          created_at?: string
          id?: string
          minimum_report_cell_size?: number
          purpose_code?: string
          state?: string
          title?: string
        }
        Relationships: []
      }
      graduation_project_approvals: {
        Row: {
          assignment_id: string
          decided_at: string
          decision: string
          id: string
          project_id: string
          reason: string | null
          stage: string
        }
        Insert: {
          assignment_id: string
          decided_at?: string
          decision: string
          id?: string
          project_id: string
          reason?: string | null
          stage: string
        }
        Update: {
          assignment_id?: string
          decided_at?: string
          decision?: string
          id?: string
          project_id?: string
          reason?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_approvals_assignment_id_project_id_fkey"
            columns: ["assignment_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_assignments"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "graduation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_project_assignments: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string
          department_id: string
          ended_at: string | null
          faculty_profile_id: string | null
          id: string
          is_leader: boolean
          processing_role:
            | Database["public"]["Enums"]["graduation_project_assignment_role"]
            | null
          processing_unit_id: string | null
          project_id: string
          role: Database["public"]["Enums"]["graduation_project_assignment_role"]
          student_profile_id: string | null
          supervision_status:
            | Database["public"]["Enums"]["graduation_project_supervision_status"]
            | null
          user_id: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by: string
          department_id: string
          ended_at?: string | null
          faculty_profile_id?: string | null
          id?: string
          is_leader?: boolean
          processing_role?:
            | Database["public"]["Enums"]["graduation_project_assignment_role"]
            | null
          processing_unit_id?: string | null
          project_id: string
          role: Database["public"]["Enums"]["graduation_project_assignment_role"]
          student_profile_id?: string | null
          supervision_status?:
            | Database["public"]["Enums"]["graduation_project_supervision_status"]
            | null
          user_id: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string
          department_id?: string
          ended_at?: string | null
          faculty_profile_id?: string | null
          id?: string
          is_leader?: boolean
          processing_role?:
            | Database["public"]["Enums"]["graduation_project_assignment_role"]
            | null
          processing_unit_id?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["graduation_project_assignment_role"]
          student_profile_id?: string | null
          supervision_status?:
            | Database["public"]["Enums"]["graduation_project_supervision_status"]
            | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_project_department_fk"
            columns: ["project_id", "department_id"]
            isOneToOne: false
            referencedRelation: "graduation_projects"
            referencedColumns: ["id", "department_id"]
          },
          {
            foreignKeyName: "graduation_project_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_project_assignments_faculty_profile_id_fkey"
            columns: ["faculty_profile_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "graduation_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_project_assignments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "graduation_project_assignments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_project_department_coordinators: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string
          department_id: string
          ended_at: string | null
          faculty_profile_id: string
          id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by: string
          department_id: string
          ended_at?: string | null
          faculty_profile_id: string
          id?: string
          user_id: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string
          department_id?: string
          ended_at?: string | null
          faculty_profile_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_department_coordinat_faculty_profile_id_fkey"
            columns: ["faculty_profile_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_project_department_coordinators_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_project_discussions: {
        Row: {
          coordinator_assignment_id: string
          held_at: string | null
          id: string
          project_id: string
          starts_at: string
          state: string
          venue: string
        }
        Insert: {
          coordinator_assignment_id: string
          held_at?: string | null
          id?: string
          project_id: string
          starts_at: string
          state?: string
          venue: string
        }
        Update: {
          coordinator_assignment_id?: string
          held_at?: string | null
          id?: string
          project_id?: string
          starts_at?: string
          state?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_discussion_coordinator_assignment_id_pr_fkey"
            columns: ["coordinator_assignment_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_assignments"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_discussions_coordinator_assignment_id_fkey"
            columns: ["coordinator_assignment_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_project_discussions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "graduation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_project_evaluations: {
        Row: {
          discussion_id: string
          evaluation_round: number
          id: string
          notes: string | null
          panel_member_id: string
          project_id: string
          score: number | null
          state: string
          submitted_at: string | null
        }
        Insert: {
          discussion_id: string
          evaluation_round?: number
          id?: string
          notes?: string | null
          panel_member_id: string
          project_id: string
          score?: number | null
          state?: string
          submitted_at?: string | null
        }
        Update: {
          discussion_id?: string
          evaluation_round?: number
          id?: string
          notes?: string | null
          panel_member_id?: string
          project_id?: string
          score?: number | null
          state?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_evaluation_panel_member_id_discussion_i_fkey"
            columns: ["panel_member_id", "discussion_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_panel_members"
            referencedColumns: ["id", "discussion_id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_evaluations_discussion_id_project_id_fkey"
            columns: ["discussion_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_discussions"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_evaluations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "graduation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_project_events: {
        Row: {
          actor_assignment_id: string | null
          actor_user_id: string
          correlation_id: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: number
          occurred_at: string
          payload: Json
          project_id: string
          reason: string | null
        }
        Insert: {
          actor_assignment_id?: string | null
          actor_user_id: string
          correlation_id: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: never
          occurred_at?: string
          payload?: Json
          project_id: string
          reason?: string | null
        }
        Update: {
          actor_assignment_id?: string | null
          actor_user_id?: string
          correlation_id?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: never
          occurred_at?: string
          payload?: Json
          project_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_events_actor_assignment_id_project_id_fkey"
            columns: ["actor_assignment_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_assignments"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "graduation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_project_files: {
        Row: {
          byte_size: number
          category: Database["public"]["Enums"]["graduation_project_file_category"]
          created_at: string
          finalized_at: string | null
          id: string
          is_current: boolean
          media_type: string
          object_key: string
          original_name: string
          progress_entry_id: string | null
          project_id: string
          scan_state: Database["public"]["Enums"]["graduation_project_scan_state"]
          sha256: string | null
          superseded_at: string | null
          upload_status: Database["public"]["Enums"]["graduation_project_file_upload_status"]
          uploaded_by_assignment_id: string
        }
        Insert: {
          byte_size: number
          category: Database["public"]["Enums"]["graduation_project_file_category"]
          created_at?: string
          finalized_at?: string | null
          id?: string
          is_current?: boolean
          media_type: string
          object_key: string
          original_name: string
          progress_entry_id?: string | null
          project_id: string
          scan_state?: Database["public"]["Enums"]["graduation_project_scan_state"]
          sha256?: string | null
          superseded_at?: string | null
          upload_status?: Database["public"]["Enums"]["graduation_project_file_upload_status"]
          uploaded_by_assignment_id: string
        }
        Update: {
          byte_size?: number
          category?: Database["public"]["Enums"]["graduation_project_file_category"]
          created_at?: string
          finalized_at?: string | null
          id?: string
          is_current?: boolean
          media_type?: string
          object_key?: string
          original_name?: string
          progress_entry_id?: string | null
          project_id?: string
          scan_state?: Database["public"]["Enums"]["graduation_project_scan_state"]
          sha256?: string | null
          superseded_at?: string | null
          upload_status?: Database["public"]["Enums"]["graduation_project_file_upload_status"]
          uploaded_by_assignment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_files_progress_entry_id_project_id_fkey"
            columns: ["progress_entry_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_progress_entries"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "graduation_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_project_files_uploaded_by_assignment_id_project_fkey"
            columns: ["uploaded_by_assignment_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_assignments"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      graduation_project_final_archives: {
        Row: {
          archived_at: string
          archived_by_assignment_id: string
          average_score: number | null
          correlation_id: string
          final_decision: Database["public"]["Enums"]["graduation_project_final_decision"]
          final_file_id: string
          id: string
          project_id: string
          snapshot: Json
        }
        Insert: {
          archived_at?: string
          archived_by_assignment_id: string
          average_score?: number | null
          correlation_id: string
          final_decision: Database["public"]["Enums"]["graduation_project_final_decision"]
          final_file_id: string
          id?: string
          project_id: string
          snapshot: Json
        }
        Update: {
          archived_at?: string
          archived_by_assignment_id?: string
          average_score?: number | null
          correlation_id?: string
          final_decision?: Database["public"]["Enums"]["graduation_project_final_decision"]
          final_file_id?: string
          id?: string
          project_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_final_arch_archived_by_assignment_id_pr_fkey"
            columns: ["archived_by_assignment_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_assignments"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_final_archives_final_file_id_project_id_fkey"
            columns: ["final_file_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_files"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_final_archives_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "graduation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_project_panel_members: {
        Row: {
          assignment_id: string
          discussion_id: string
          id: string
          project_id: string
        }
        Insert: {
          assignment_id: string
          discussion_id: string
          id?: string
          project_id: string
        }
        Update: {
          assignment_id?: string
          discussion_id?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_panel_members_assignment_id_project_id_fkey"
            columns: ["assignment_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_assignments"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_panel_members_discussion_id_project_id_fkey"
            columns: ["discussion_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_discussions"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_panel_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "graduation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_project_policies: {
        Row: {
          academic_year_id: string | null
          allow_co_supervisor: boolean
          created_at: string
          created_by: string | null
          defense_window_end: string | null
          defense_window_start: string | null
          department_id: string | null
          enforce_defense_window: boolean | null
          enforce_proposal_window: boolean | null
          id: string
          max_committee_members: number | null
          max_revision_rounds: number | null
          max_supervisors: number
          max_team_size: number | null
          min_committee_members: number | null
          min_team_size: number | null
          notes: string | null
          passing_score: number | null
          proposal_window_end: string | null
          proposal_window_start: string | null
          published_at: string | null
          published_by: string | null
          required_progress_reports: number | null
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          academic_year_id?: string | null
          allow_co_supervisor?: boolean
          created_at?: string
          created_by?: string | null
          defense_window_end?: string | null
          defense_window_start?: string | null
          department_id?: string | null
          enforce_defense_window?: boolean | null
          enforce_proposal_window?: boolean | null
          id?: string
          max_committee_members?: number | null
          max_revision_rounds?: number | null
          max_supervisors?: number
          max_team_size?: number | null
          min_committee_members?: number | null
          min_team_size?: number | null
          notes?: string | null
          passing_score?: number | null
          proposal_window_end?: string | null
          proposal_window_start?: string | null
          published_at?: string | null
          published_by?: string | null
          required_progress_reports?: number | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          academic_year_id?: string | null
          allow_co_supervisor?: boolean
          created_at?: string
          created_by?: string | null
          defense_window_end?: string | null
          defense_window_start?: string | null
          department_id?: string | null
          enforce_defense_window?: boolean | null
          enforce_proposal_window?: boolean | null
          id?: string
          max_committee_members?: number | null
          max_revision_rounds?: number | null
          max_supervisors?: number
          max_team_size?: number | null
          min_committee_members?: number | null
          min_team_size?: number | null
          notes?: string | null
          passing_score?: number | null
          proposal_window_end?: string | null
          proposal_window_start?: string | null
          published_at?: string | null
          published_by?: string | null
          required_progress_reports?: number | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_policies_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_project_policies_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_project_progress_entries: {
        Row: {
          file_id: string | null
          id: string
          project_id: string
          review_comments: string | null
          reviewed_at: string | null
          reviewed_by_assignment_id: string | null
          state: string
          submitted_at: string
          submitted_by_assignment_id: string
          summary: string
          version_no: number
        }
        Insert: {
          file_id?: string | null
          id?: string
          project_id: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by_assignment_id?: string | null
          state: string
          submitted_at?: string
          submitted_by_assignment_id: string
          summary: string
          version_no: number
        }
        Update: {
          file_id?: string | null
          id?: string
          project_id?: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by_assignment_id?: string | null
          state?: string
          submitted_at?: string
          submitted_by_assignment_id?: string
          summary?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "graduation_project_progress_e_reviewed_by_assignment_id_pr_fkey"
            columns: ["reviewed_by_assignment_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_assignments"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_progress_e_submitted_by_assignment_id_p_fkey"
            columns: ["submitted_by_assignment_id", "project_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_assignments"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "graduation_project_progress_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "graduation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_projects: {
        Row: {
          academic_year_id: string | null
          approved_at: string | null
          archived_at: string | null
          average_score: number | null
          created_at: string
          department_id: string
          evaluation_round: number
          final_decision:
            | Database["public"]["Enums"]["graduation_project_final_decision"]
            | null
          id: string
          lifecycle_state: Database["public"]["Enums"]["graduation_project_state"]
          objectives: string | null
          policy_id: string | null
          policy_pin_source: string | null
          policy_pinned_at: string | null
          policy_snapshot: Json | null
          problem_statement: string | null
          program_id: string | null
          semester_id: string | null
          summary: string | null
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          academic_year_id?: string | null
          approved_at?: string | null
          archived_at?: string | null
          average_score?: number | null
          created_at?: string
          department_id: string
          evaluation_round?: number
          final_decision?:
            | Database["public"]["Enums"]["graduation_project_final_decision"]
            | null
          id?: string
          lifecycle_state?: Database["public"]["Enums"]["graduation_project_state"]
          objectives?: string | null
          policy_id?: string | null
          policy_pin_source?: string | null
          policy_pinned_at?: string | null
          policy_snapshot?: Json | null
          problem_statement?: string | null
          program_id?: string | null
          semester_id?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          academic_year_id?: string | null
          approved_at?: string | null
          archived_at?: string | null
          average_score?: number | null
          created_at?: string
          department_id?: string
          evaluation_round?: number
          final_decision?:
            | Database["public"]["Enums"]["graduation_project_final_decision"]
            | null
          id?: string
          lifecycle_state?: Database["public"]["Enums"]["graduation_project_state"]
          objectives?: string | null
          policy_id?: string | null
          policy_pin_source?: string | null
          policy_pinned_at?: string | null
          policy_snapshot?: Json | null
          problem_statement?: string | null
          program_id?: string | null
          semester_id?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "graduation_projects_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_projects_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "graduation_project_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_projects_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_projects_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      import_logs: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          import_type: string
          notes: string | null
          rows_failed: number
          rows_success: number
          rows_total: number
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          import_type: string
          notes?: string | null
          rows_failed?: number
          rows_success?: number
          rows_total?: number
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          import_type?: string
          notes?: string | null
          rows_failed?: number
          rows_success?: number
          rows_total?: number
          status?: string
        }
        Relationships: []
      }
      internal_messages: {
        Row: {
          id: string
          is_read: boolean
          message_body: string
          read_at: string | null
          recipient_user_id: string
          sender_user_id: string
          sent_at: string
          subject: string
        }
        Insert: {
          id?: string
          is_read?: boolean
          message_body: string
          read_at?: string | null
          recipient_user_id: string
          sender_user_id: string
          sent_at?: string
          subject: string
        }
        Update: {
          id?: string
          is_read?: boolean
          message_body?: string
          read_at?: string | null
          recipient_user_id?: string
          sender_user_id?: string
          sent_at?: string
          subject?: string
        }
        Relationships: []
      }
      media_library: {
        Row: {
          alt_text: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          mime_type: string | null
          thumbnail_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type: string
          id?: string
          mime_type?: string | null
          thumbnail_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          mime_type?: string | null
          thumbnail_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      news: {
        Row: {
          category: string
          content_ar: string | null
          content_en: string | null
          created_at: string
          excerpt_ar: string | null
          excerpt_en: string | null
          featured_image: string | null
          id: string
          is_published: boolean
          published_at: string
          slug: string
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          content_ar?: string | null
          content_en?: string | null
          created_at?: string
          excerpt_ar?: string | null
          excerpt_en?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean
          published_at?: string
          slug: string
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          content_ar?: string | null
          content_en?: string | null
          created_at?: string
          excerpt_ar?: string | null
          excerpt_en?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean
          published_at?: string
          slug?: string
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_type: string
          reference_id: string | null
          reference_type: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          notification_type: string
          reference_id?: string | null
          reference_type?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      october_exam_entry_details: {
        Row: {
          academic_level_order: number
          academic_year_id: string | null
          approved_list_generated_at: string
          created_at: string
          eligibility_snapshot: Json
          eligible_requirement_ids: string[]
          id: string
          remaining_courses_count: number
          request_id: string
          selected_requirement_ids: string[]
          semester_id: string | null
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          academic_level_order: number
          academic_year_id?: string | null
          approved_list_generated_at?: string
          created_at?: string
          eligibility_snapshot?: Json
          eligible_requirement_ids?: string[]
          id?: string
          remaining_courses_count: number
          request_id: string
          selected_requirement_ids?: string[]
          semester_id?: string | null
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          academic_level_order?: number
          academic_year_id?: string | null
          approved_list_generated_at?: string
          created_at?: string
          eligibility_snapshot?: Json
          eligible_requirement_ids?: string[]
          id?: string
          remaining_courses_count?: number
          request_id?: string
          selected_requirement_ids?: string[]
          semester_id?: string | null
          student_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "october_exam_entry_details_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "october_exam_entry_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "october_exam_entry_details_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "october_exam_entry_details_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "october_exam_entry_details_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      official_documents: {
        Row: {
          created_at: string
          document_number: string
          document_type: string
          id: string
          issued_at: string
          issued_by: string | null
          metadata: Json
          notes: string | null
          pdf_url: string | null
          status: string
          student_profile_id: string
          student_request_id: string | null
          updated_at: string
          verification_code: string
        }
        Insert: {
          created_at?: string
          document_number: string
          document_type: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          metadata?: Json
          notes?: string | null
          pdf_url?: string | null
          status?: string
          student_profile_id: string
          student_request_id?: string | null
          updated_at?: string
          verification_code: string
        }
        Update: {
          created_at?: string
          document_number?: string
          document_type?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          metadata?: Json
          notes?: string | null
          pdf_url?: string | null
          status?: string
          student_profile_id?: string
          student_request_id?: string | null
          updated_at?: string
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_documents_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "official_documents_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_documents_student_request_id_fkey"
            columns: ["student_request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      official_transcript_request_details: {
        Row: {
          created_at: string
          document_issued_at: string | null
          id: string
          notes: string | null
          official_document_id: string | null
          purpose: string | null
          request_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_issued_at?: string | null
          id?: string
          notes?: string | null
          official_document_id?: string | null
          purpose?: string | null
          request_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_issued_at?: string | null
          id?: string
          notes?: string | null
          official_document_id?: string | null
          purpose?: string | null
          request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_transcript_request_details_official_document_id_fkey"
            columns: ["official_document_id"]
            isOneToOne: false
            referencedRelation: "official_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_transcript_request_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      organizational_positions: {
        Row: {
          code: string
          created_at: string
          department_id: string | null
          id: string
          is_active: boolean
          is_department_head_position: boolean
          name_ar: string
          name_en: string | null
          notes: string | null
          parent_code: string | null
          sort_order: number
          unit_type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_department_head_position?: boolean
          name_ar: string
          name_en?: string | null
          notes?: string | null
          parent_code?: string | null
          sort_order?: number
          unit_type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_department_head_position?: boolean
          name_ar?: string
          name_en?: string | null
          notes?: string | null
          parent_code?: string | null
          sort_order?: number
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizational_positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      p1_e2e_07_executions: {
        Row: {
          closed_at: string | null
          created_at: string
          created_request_id: string | null
          expires_at: string
          id: string
          marker: string
          run_id: string
          service_code: string
          starts_at: string
          status: string
          student_user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_request_id?: string | null
          expires_at?: string
          id?: string
          marker?: string
          run_id: string
          service_code: string
          starts_at?: string
          status?: string
          student_user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_request_id?: string | null
          expires_at?: string
          id?: string
          marker?: string
          run_id?: string
          service_code?: string
          starts_at?: string
          status?: string
          student_user_id?: string
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          amount: number
          created_at: string
          file_name: string
          file_url: string
          id: string
          payment_date: string
          payment_method: string
          receipt_reference: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          student_fee_id: string
          student_payment_id: string | null
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          payment_date?: string
          payment_method: string
          receipt_reference?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_fee_id: string
          student_payment_id?: string | null
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          payment_date?: string
          payment_method?: string
          receipt_reference?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_fee_id?: string
          student_payment_id?: string | null
          student_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_student_fee_id_fkey"
            columns: ["student_fee_id"]
            isOneToOne: false
            referencedRelation: "student_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_student_payment_id_fkey"
            columns: ["student_payment_id"]
            isOneToOne: false
            referencedRelation: "student_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "payment_receipts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_checklist_items: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string
          order_index: number
          period: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label: string
          order_index?: number
          period: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string
          order_index?: number
          period?: string
        }
        Relationships: []
      }
      pilot_checklist_runs: {
        Row: {
          completed: boolean
          completed_at: string
          completed_by: string | null
          id: string
          item_id: string
          notes: string | null
          run_date: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string
          completed_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          run_date?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string
          completed_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          run_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_checklist_runs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pilot_checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_config: {
        Row: {
          created_at: string
          id: number
          launch_date: string | null
          notes: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          launch_date?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          launch_date?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pilot_feedback: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          recorded_by: string | null
          subject: string | null
          subject_user_id: string | null
          type: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          recorded_by?: string | null
          subject?: string | null
          subject_user_id?: string | null
          type: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          recorded_by?: string | null
          subject?: string | null
          subject_user_id?: string | null
          type?: string
        }
        Relationships: []
      }
      pilot_issues: {
        Row: {
          assigned_to: string | null
          category: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pilot_participants: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          full_name: string
          id: string
          notes: string | null
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          full_name: string
          id?: string
          notes?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pilot_test_results: {
        Row: {
          notes: string | null
          result: string
          scenario_id: string
          tested_at: string | null
          tested_by: string | null
          updated_at: string
        }
        Insert: {
          notes?: string | null
          result?: string
          scenario_id: string
          tested_at?: string | null
          tested_by?: string | null
          updated_at?: string
        }
        Update: {
          notes?: string | null
          result?: string
          scenario_id?: string
          tested_at?: string | null
          tested_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_test_results_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "pilot_test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_test_scenarios: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          order_index: number
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          order_index?: number
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          order_index?: number
        }
        Relationships: []
      }
      position_assignments: {
        Row: {
          assigned_from: string
          assigned_to: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          position_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_from?: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          position_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_from?: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          position_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_assignments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "organizational_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_role_mapping: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          position_id: string
          role_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          position_id: string
          role_code: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          position_id?: string
          role_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_role_mapping_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "organizational_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_role_mapping_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles_catalog"
            referencedColumns: ["code"]
          },
        ]
      }
      programs: {
        Row: {
          admission_requirements: string | null
          career_opportunities: string | null
          code: string
          created_at: string
          degree_type: string | null
          department_id: string | null
          description_ar: string | null
          description_en: string | null
          icon: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          sort_order: number
          status: string
          study_plan: Json | null
          updated_at: string
          years: number | null
        }
        Insert: {
          admission_requirements?: string | null
          career_opportunities?: string | null
          code: string
          created_at?: string
          degree_type?: string | null
          department_id?: string | null
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          sort_order?: number
          status?: string
          study_plan?: Json | null
          updated_at?: string
          years?: number | null
        }
        Update: {
          admission_requirements?: string | null
          career_opportunities?: string | null
          code?: string
          created_at?: string
          degree_type?: string | null
          department_id?: string | null
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          sort_order?: number
          status?: string
          study_plan?: Json | null
          updated_at?: string
          years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_attempts: {
        Row: {
          action: string
          actor_identifier: string | null
          blocked_until: string | null
          created_at: string
          expires_at: string
          id: string
          ip_hash: string | null
          key: string
          metadata: Json
          user_agent_hash: string | null
        }
        Insert: {
          action: string
          actor_identifier?: string | null
          blocked_until?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          key: string
          metadata?: Json
          user_agent_hash?: string | null
        }
        Update: {
          action?: string
          actor_identifier?: string | null
          blocked_until?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          key?: string
          metadata?: Json
          user_agent_hash?: string | null
        }
        Relationships: []
      }
      replacement_card_details: {
        Row: {
          card_issued_at: string | null
          card_issued_by: string | null
          created_at: string
          id: string
          issued_card_serial: string | null
          loss_declaration_ack: boolean
          loss_incident_date: string | null
          loss_reason: string
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          previous_card_serial: string | null
          request_id: string
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          card_issued_at?: string | null
          card_issued_by?: string | null
          created_at?: string
          id?: string
          issued_card_serial?: string | null
          loss_declaration_ack?: boolean
          loss_incident_date?: string | null
          loss_reason: string
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          previous_card_serial?: string | null
          request_id: string
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          card_issued_at?: string | null
          card_issued_by?: string | null
          created_at?: string
          id?: string
          issued_card_serial?: string | null
          loss_declaration_ack?: boolean
          loss_incident_date?: string | null
          loss_reason?: string
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          previous_card_serial?: string | null
          request_id?: string
          student_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "replacement_card_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacement_card_details_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "replacement_card_details_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_eligibility_rule_catalog: {
        Row: {
          code: string
          created_at: string
          default_message_ar: string
          description_ar: string | null
          is_active: boolean
          name_ar: string
          param_schema: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_message_ar: string
          description_ar?: string | null
          is_active?: boolean
          name_ar: string
          param_schema?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_message_ar?: string
          description_ar?: string | null
          is_active?: boolean
          name_ar?: string
          param_schema?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      request_processing_assignments: {
        Row: {
          assignment_type: string
          created_at: string
          department_id: string | null
          ends_at: string | null
          faculty_profile_id: string | null
          id: string
          is_active: boolean
          position_assignment_id: string | null
          role_id: string | null
          staff_profile_id: string | null
          starts_at: string | null
          unit_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assignment_type: string
          created_at?: string
          department_id?: string | null
          ends_at?: string | null
          faculty_profile_id?: string | null
          id?: string
          is_active?: boolean
          position_assignment_id?: string | null
          role_id?: string | null
          staff_profile_id?: string | null
          starts_at?: string | null
          unit_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assignment_type?: string
          created_at?: string
          department_id?: string | null
          ends_at?: string | null
          faculty_profile_id?: string | null
          id?: string
          is_active?: boolean
          position_assignment_id?: string | null
          role_id?: string | null
          staff_profile_id?: string | null
          starts_at?: string | null
          unit_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_processing_assignments_department_id_fk"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_processing_assignments_faculty_profile_id_fk"
            columns: ["faculty_profile_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_processing_assignments_position_assignment_id_fk"
            columns: ["position_assignment_id"]
            isOneToOne: false
            referencedRelation: "position_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_processing_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "request_processing_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_processing_assignments_staff_profile_id_fk"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_processing_assignments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "request_processing_units"
            referencedColumns: ["id"]
          },
        ]
      }
      request_processing_roles: {
        Row: {
          app_role: string | null
          code: string
          created_at: string
          description_ar: string | null
          id: string
          is_active: boolean
          is_managerial: boolean
          name_ar: string
          name_en: string | null
          position_code: string | null
          sort_order: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          app_role?: string | null
          code: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          is_managerial?: boolean
          name_ar: string
          name_en?: string | null
          position_code?: string | null
          sort_order?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          app_role?: string | null
          code?: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          is_managerial?: boolean
          name_ar?: string
          name_en?: string | null
          position_code?: string | null
          sort_order?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_processing_roles_position_code_fk"
            columns: ["position_code"]
            isOneToOne: false
            referencedRelation: "organizational_positions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "request_processing_roles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "request_processing_units"
            referencedColumns: ["id"]
          },
        ]
      }
      request_processing_units: {
        Row: {
          code: string
          created_at: string
          default_app_role: string | null
          description_ar: string | null
          id: string
          is_academic_unit: boolean
          is_active: boolean
          name_ar: string
          name_en: string | null
          portal_scope: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_app_role?: string | null
          description_ar?: string | null
          id?: string
          is_academic_unit?: boolean
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          portal_scope?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_app_role?: string | null
          description_ar?: string | null
          id?: string
          is_academic_unit?: boolean
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          portal_scope?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      request_type_eligibility_rules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          message_ar: string
          params: Json
          request_type_id: string
          rule_code: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message_ar: string
          params?: Json
          request_type_id: string
          rule_code: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message_ar?: string
          params?: Json
          request_type_id?: string
          rule_code?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_type_eligibility_rules_request_type_id_fkey"
            columns: ["request_type_id"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_type_eligibility_rules_rule_code_fkey"
            columns: ["rule_code"]
            isOneToOne: false
            referencedRelation: "request_eligibility_rule_catalog"
            referencedColumns: ["code"]
          },
        ]
      }
      request_type_workflow_change_log: {
        Row: {
          change_kind: string
          change_note: string | null
          changed_by: string | null
          created_at: string
          id: string
          request_type_id: string
          snapshot: Json
          version: number | null
          workflow_id: string | null
        }
        Insert: {
          change_kind: string
          change_note?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          request_type_id: string
          snapshot?: Json
          version?: number | null
          workflow_id?: string | null
        }
        Update: {
          change_kind?: string
          change_note?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          request_type_id?: string
          snapshot?: Json
          version?: number | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_type_workflow_change_log_request_type_id_fkey"
            columns: ["request_type_id"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_type_workflow_change_log_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "request_type_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      request_type_workflow_steps: {
        Row: {
          action_code: string | null
          action_type: string
          assignment_strategy: string
          can_reject: boolean
          can_return_to_student: boolean
          can_skip: boolean
          config: Json
          created_at: string
          description_ar: string | null
          form_schema: Json
          id: string
          is_required: boolean
          notify_on_complete: boolean
          notify_on_enter: boolean
          processing_role_id: string | null
          processing_unit_id: string | null
          produces_document: boolean
          requires_attachment: boolean
          requires_payment: boolean
          status_on_complete: string | null
          status_on_enter: string | null
          step_key: string
          step_name_ar: string
          step_name_en: string | null
          step_order: number
          updated_at: string
          visible_to_student: boolean
          workflow_id: string
        }
        Insert: {
          action_code?: string | null
          action_type?: string
          assignment_strategy?: string
          can_reject?: boolean
          can_return_to_student?: boolean
          can_skip?: boolean
          config?: Json
          created_at?: string
          description_ar?: string | null
          form_schema?: Json
          id?: string
          is_required?: boolean
          notify_on_complete?: boolean
          notify_on_enter?: boolean
          processing_role_id?: string | null
          processing_unit_id?: string | null
          produces_document?: boolean
          requires_attachment?: boolean
          requires_payment?: boolean
          status_on_complete?: string | null
          status_on_enter?: string | null
          step_key: string
          step_name_ar: string
          step_name_en?: string | null
          step_order: number
          updated_at?: string
          visible_to_student?: boolean
          workflow_id: string
        }
        Update: {
          action_code?: string | null
          action_type?: string
          assignment_strategy?: string
          can_reject?: boolean
          can_return_to_student?: boolean
          can_skip?: boolean
          config?: Json
          created_at?: string
          description_ar?: string | null
          form_schema?: Json
          id?: string
          is_required?: boolean
          notify_on_complete?: boolean
          notify_on_enter?: boolean
          processing_role_id?: string | null
          processing_unit_id?: string | null
          produces_document?: boolean
          requires_attachment?: boolean
          requires_payment?: boolean
          status_on_complete?: string | null
          status_on_enter?: string | null
          step_key?: string
          step_name_ar?: string
          step_name_en?: string | null
          step_order?: number
          updated_at?: string
          visible_to_student?: boolean
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_type_workflow_steps_action_code_fkey"
            columns: ["action_code"]
            isOneToOne: false
            referencedRelation: "request_workflow_action_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "request_type_workflow_steps_processing_role_id_fkey"
            columns: ["processing_role_id"]
            isOneToOne: false
            referencedRelation: "request_processing_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_type_workflow_steps_processing_unit_id_fkey"
            columns: ["processing_unit_id"]
            isOneToOne: false
            referencedRelation: "request_processing_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_type_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "request_type_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      request_type_workflow_transitions: {
        Row: {
          action_result: string
          condition_schema: Json
          created_at: string
          from_step_id: string | null
          id: string
          is_default: boolean
          label_ar: string | null
          priority: number
          to_step_id: string | null
          workflow_id: string
        }
        Insert: {
          action_result: string
          condition_schema?: Json
          created_at?: string
          from_step_id?: string | null
          id?: string
          is_default?: boolean
          label_ar?: string | null
          priority?: number
          to_step_id?: string | null
          workflow_id: string
        }
        Update: {
          action_result?: string
          condition_schema?: Json
          created_at?: string
          from_step_id?: string | null
          id?: string
          is_default?: boolean
          label_ar?: string | null
          priority?: number
          to_step_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_type_workflow_transitions_from_step_id_fkey"
            columns: ["from_step_id"]
            isOneToOne: false
            referencedRelation: "request_type_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_type_workflow_transitions_to_step_id_fkey"
            columns: ["to_step_id"]
            isOneToOne: false
            referencedRelation: "request_type_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_type_workflow_transitions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "request_type_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      request_type_workflows: {
        Row: {
          change_note: string | null
          code: string
          created_at: string
          created_by: string | null
          description_ar: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          published_at: string | null
          request_type_id: string
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          change_note?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          published_at?: string | null
          request_type_id: string
          status?: string
          superseded_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          change_note?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          published_at?: string | null
          request_type_id?: string
          status?: string
          superseded_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "request_type_workflows_request_type_id_fkey"
            columns: ["request_type_id"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["id"]
          },
        ]
      }
      request_types: {
        Row: {
          article_ref: string | null
          category: string | null
          code: string
          created_at: string
          description_ar: string | null
          form_schema: Json
          id: string
          ineligible_display_mode: string
          is_active: boolean
          name_ar: string
          request_audience: string
          required_documents: Json
          requires_attachment: boolean
          sort_order: number
          student_visible: boolean
          title_en: string | null
          updated_at: string
          workflow_schema: Json
        }
        Insert: {
          article_ref?: string | null
          category?: string | null
          code: string
          created_at?: string
          description_ar?: string | null
          form_schema?: Json
          id?: string
          ineligible_display_mode?: string
          is_active?: boolean
          name_ar: string
          request_audience?: string
          required_documents?: Json
          requires_attachment?: boolean
          sort_order?: number
          student_visible?: boolean
          title_en?: string | null
          updated_at?: string
          workflow_schema?: Json
        }
        Update: {
          article_ref?: string | null
          category?: string | null
          code?: string
          created_at?: string
          description_ar?: string | null
          form_schema?: Json
          id?: string
          ineligible_display_mode?: string
          is_active?: boolean
          name_ar?: string
          request_audience?: string
          required_documents?: Json
          requires_attachment?: boolean
          sort_order?: number
          student_visible?: boolean
          title_en?: string | null
          updated_at?: string
          workflow_schema?: Json
        }
        Relationships: []
      }
      request_workflow_action_catalog: {
        Row: {
          action_type: string | null
          code: string
          created_at: string
          description_ar: string | null
          effect_function: string | null
          id: string
          is_active: boolean
          kind: string
          name_ar: string
          restricted_request_type_code: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          action_type?: string | null
          code: string
          created_at?: string
          description_ar?: string | null
          effect_function?: string | null
          id?: string
          is_active?: boolean
          kind: string
          name_ar: string
          restricted_request_type_code?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          action_type?: string | null
          code?: string
          created_at?: string
          description_ar?: string | null
          effect_function?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name_ar?: string
          restricted_request_type_code?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      request_workflow_publish_validations: {
        Row: {
          checked_at: string
          id: string
          is_valid: boolean
          message: string | null
          request_type_code: string
          workflow_id: string | null
        }
        Insert: {
          checked_at?: string
          id?: string
          is_valid: boolean
          message?: string | null
          request_type_code: string
          workflow_id?: string | null
        }
        Update: {
          checked_at?: string
          id?: string
          is_valid?: boolean
          message?: string | null
          request_type_code?: string
          workflow_id?: string | null
        }
        Relationships: []
      }
      request_workflow_transition_condition_catalog: {
        Row: {
          code: string
          created_at: string
          description_ar: string | null
          id: string
          is_active: boolean
          name_ar: string
          params_schema: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          params_schema?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          params_schema?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      research_papers: {
        Row: {
          abstract_ar: string | null
          abstract_en: string | null
          authors: string
          citations_count: number
          created_at: string
          doi: string | null
          external_url: string | null
          faculty_id: string | null
          id: string
          is_published: boolean
          journal_name: string | null
          keywords: string | null
          pdf_url: string | null
          program_id: string | null
          publication_date: string | null
          publication_year: number
          sort_order: number
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          abstract_ar?: string | null
          abstract_en?: string | null
          authors: string
          citations_count?: number
          created_at?: string
          doi?: string | null
          external_url?: string | null
          faculty_id?: string | null
          id?: string
          is_published?: boolean
          journal_name?: string | null
          keywords?: string | null
          pdf_url?: string | null
          program_id?: string | null
          publication_date?: string | null
          publication_year: number
          sort_order?: number
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          abstract_ar?: string | null
          abstract_en?: string | null
          authors?: string
          citations_count?: number
          created_at?: string
          doi?: string | null
          external_url?: string | null
          faculty_id?: string | null
          id?: string
          is_published?: boolean
          journal_name?: string | null
          keywords?: string | null
          pdf_url?: string | null
          program_id?: string | null
          publication_date?: string | null
          publication_year?: number
          sort_order?: number
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_papers_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_papers_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      roles_catalog: {
        Row: {
          app_role_mapping: Database["public"]["Enums"]["app_role"] | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          updated_at: string
        }
        Insert: {
          app_role_mapping?: Database["public"]["Enums"]["app_role"] | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          updated_at?: string
        }
        Update: {
          app_role_mapping?: Database["public"]["Enums"]["app_role"] | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          building_id: string
          capacity: number
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          room_type: Database["public"]["Enums"]["room_type"]
          updated_at: string
        }
        Insert: {
          building_id: string
          capacity?: number
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          room_type?: Database["public"]["Enums"]["room_type"]
          updated_at?: string
        }
        Update: {
          building_id?: string
          capacity?: number
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          room_type?: Database["public"]["Enums"]["room_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          academic_year_id: string
          code: string
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          name: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          code: string
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          name: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          code?: string
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          name?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "semesters_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      service_platform_runtime_flags: {
        Row: {
          legacy_fallback_enabled: boolean
          service_code: string
          updated_at: string
        }
        Insert: {
          legacy_fallback_enabled?: boolean
          service_code: string
          updated_at?: string
        }
        Update: {
          legacy_fallback_enabled?: boolean
          service_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_pages: {
        Row: {
          content_ar: string | null
          content_en: string | null
          created_at: string
          id: string
          is_published: boolean
          meta_description: string | null
          slug: string
          sort_order: number
          template: string
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          content_ar?: string | null
          content_en?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          meta_description?: string | null
          slug: string
          sort_order?: number
          template?: string
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          content_ar?: string | null
          content_en?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          meta_description?: string | null
          slug?: string
          sort_order?: number
          template?: string
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          created_at: string
          id: string
          setting_group: string
          setting_key: string
          setting_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_group?: string
          setting_key: string
          setting_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_group?: string
          setting_key?: string
          setting_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staff_profile_departments: {
        Row: {
          created_at: string
          department_id: string
          staff_profile_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          staff_profile_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          staff_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profile_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profile_departments_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string
          department_id: string | null
          department_scope: string
          email: string | null
          employee_number: string | null
          full_name_ar: string
          full_name_en: string | null
          id: string
          job_title: string
          must_change_password: boolean
          role_type: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          department_scope?: string
          email?: string | null
          employee_number?: string | null
          full_name_ar: string
          full_name_en?: string | null
          id?: string
          job_title: string
          must_change_password?: boolean
          role_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          department_scope?: string
          email?: string | null
          employee_number?: string | null
          full_name_ar?: string
          full_name_en?: string | null
          id?: string
          job_title?: string
          must_change_password?: boolean
          role_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      step_up_challenges: {
        Row: {
          action_code: string
          consumed_at: string | null
          created_at: string
          device_id: string
          expires_at: string
          id: string
          nonce: string
          payload_hash: string
          request_id: string
          user_id: string
        }
        Insert: {
          action_code: string
          consumed_at?: string | null
          created_at?: string
          device_id: string
          expires_at: string
          id?: string
          nonce: string
          payload_hash: string
          request_id: string
          user_id: string
        }
        Update: {
          action_code?: string
          consumed_at?: string | null
          created_at?: string
          device_id?: string
          expires_at?: string
          id?: string
          nonce?: string
          payload_hash?: string
          request_id?: string
          user_id?: string
        }
        Relationships: []
      }
      step_up_proofs: {
        Row: {
          action_code: string
          challenge_id: string | null
          consumed_at: string | null
          created_at: string
          device_id: string
          expires_at: string
          payload_hash: string
          proof_token: string
          request_id: string
          user_id: string
        }
        Insert: {
          action_code: string
          challenge_id?: string | null
          consumed_at?: string | null
          created_at?: string
          device_id: string
          expires_at: string
          payload_hash: string
          proof_token: string
          request_id: string
          user_id: string
        }
        Update: {
          action_code?: string
          challenge_id?: string | null
          consumed_at?: string | null
          created_at?: string
          device_id?: string
          expires_at?: string
          payload_hash?: string
          proof_token?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_up_proofs_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "step_up_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      student_academic_status: {
        Row: {
          academic_year_id: string
          created_at: string
          enrollment_status: string
          id: string
          level_id: string
          semester_id: string
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          enrollment_status?: string
          id?: string
          level_id: string
          semester_id: string
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          enrollment_status?: string
          id?: string
          level_id?: string
          semester_id?: string
          student_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_academic_status_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_academic_status_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "academic_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_academic_status_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_academic_status_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "student_academic_status_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_discounts: {
        Row: {
          academic_year_id: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          discount_type_id: string
          id: string
          notes: string | null
          semester_id: string
          status: string
          student_profile_id: string
          updated_at: string
          value: number
        }
        Insert: {
          academic_year_id: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount_type_id: string
          id?: string
          notes?: string | null
          semester_id: string
          status?: string
          student_profile_id: string
          updated_at?: string
          value: number
        }
        Update: {
          academic_year_id?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount_type_id?: string
          id?: string
          notes?: string | null
          semester_id?: string
          status?: string
          student_profile_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_discounts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_discounts_discount_type_id_fkey"
            columns: ["discount_type_id"]
            isOneToOne: false
            referencedRelation: "discount_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_discounts_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_discounts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "student_discounts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_enrollments: {
        Row: {
          course_section_id: string
          created_at: string
          enrolled_at: string
          enrollment_status: string
          id: string
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          course_section_id: string
          created_at?: string
          enrolled_at?: string
          enrollment_status?: string
          id?: string
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          course_section_id?: string
          created_at?: string
          enrolled_at?: string
          enrollment_status?: string
          id?: string
          student_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_section_id"]
          },
          {
            foreignKeyName: "student_enrollments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "student_enrollments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_equivalency_credits: {
        Row: {
          applied_at: string
          course_id: string
          created_at: string
          credit_hours: number | null
          equivalency_course_id: string
          equivalency_request_id: string
          external_course_code: string
          external_course_name: string
          id: string
          student_profile_id: string
        }
        Insert: {
          applied_at?: string
          course_id: string
          created_at?: string
          credit_hours?: number | null
          equivalency_course_id: string
          equivalency_request_id: string
          external_course_code: string
          external_course_name: string
          id?: string
          student_profile_id: string
        }
        Update: {
          applied_at?: string
          course_id?: string
          created_at?: string
          credit_hours?: number | null
          equivalency_course_id?: string
          equivalency_request_id?: string
          external_course_code?: string
          external_course_name?: string
          id?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_equivalency_credits_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_equivalency_credits_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "student_equivalency_credits_equivalency_course_id_fkey"
            columns: ["equivalency_course_id"]
            isOneToOne: true
            referencedRelation: "equivalency_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_equivalency_credits_equivalency_request_id_fkey"
            columns: ["equivalency_request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      student_excused_absences: {
        Row: {
          absence_date: string
          absence_excuse_request_id: string
          applied_at: string
          course_section_id: string
          created_at: string
          id: string
          reason_type: string
          student_profile_id: string
        }
        Insert: {
          absence_date: string
          absence_excuse_request_id: string
          applied_at?: string
          course_section_id: string
          created_at?: string
          id?: string
          reason_type: string
          student_profile_id: string
        }
        Update: {
          absence_date?: string
          absence_excuse_request_id?: string
          applied_at?: string
          course_section_id?: string
          created_at?: string
          id?: string
          reason_type?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_excused_absences_absence_excuse_request_id_fkey"
            columns: ["absence_excuse_request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_excused_absences_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_excused_absences_course_section_id_fkey"
            columns: ["course_section_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_section_id"]
          },
        ]
      }
      student_extra_chances: {
        Row: {
          academic_year_id: string
          approved_at: string
          approved_by: string | null
          chance_type: string
          created_at: string
          id: string
          reason: string
          request_id: string
          semester_id: string
          student_profile_id: string
        }
        Insert: {
          academic_year_id: string
          approved_at?: string
          approved_by?: string | null
          chance_type: string
          created_at?: string
          id?: string
          reason: string
          request_id: string
          semester_id: string
          student_profile_id: string
        }
        Update: {
          academic_year_id?: string
          approved_at?: string
          approved_by?: string | null
          chance_type?: string
          created_at?: string
          id?: string
          reason?: string
          request_id?: string
          semester_id?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_extra_chances_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_extra_chances_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_extra_chances_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      student_fee_adjustments: {
        Row: {
          created_at: string
          discount_amount: number
          final_amount: number
          id: string
          original_amount: number
          student_discount_id: string
          student_fee_id: string
        }
        Insert: {
          created_at?: string
          discount_amount: number
          final_amount: number
          id?: string
          original_amount: number
          student_discount_id: string
          student_fee_id: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          final_amount?: number
          id?: string
          original_amount?: number
          student_discount_id?: string
          student_fee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fee_adjustments_student_discount_id_fkey"
            columns: ["student_discount_id"]
            isOneToOne: false
            referencedRelation: "student_discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fee_adjustments_student_fee_id_fkey"
            columns: ["student_fee_id"]
            isOneToOne: false
            referencedRelation: "student_fees"
            referencedColumns: ["id"]
          },
        ]
      }
      student_fees: {
        Row: {
          academic_year_id: string
          amount: number
          created_at: string
          fee_type_id: string
          id: string
          notes: string | null
          semester_id: string
          status: string
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          amount: number
          created_at?: string
          fee_type_id: string
          id?: string
          notes?: string | null
          semester_id: string
          status?: string
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          amount?: number
          created_at?: string
          fee_type_id?: string
          id?: string
          notes?: string | null
          semester_id?: string
          status?: string
          student_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "student_fees_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_grades: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          entered_by: string | null
          grade_component_id: string
          id: string
          score: number
          status: string
          student_enrollment_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entered_by?: string | null
          grade_component_id: string
          id?: string
          score: number
          status?: string
          student_enrollment_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entered_by?: string | null
          grade_component_id?: string
          id?: string
          score?: number
          status?: string
          student_enrollment_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          receipt_number: string
          student_fee_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method: string
          receipt_number: string
          student_fee_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          receipt_number?: string
          student_fee_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_payments_student_fee_id_fkey"
            columns: ["student_fee_id"]
            isOneToOne: false
            referencedRelation: "student_fees"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          academic_number: string
          consecutive_suspension_years_count: number
          created_at: string
          department_id: string | null
          email: string | null
          full_name_ar: string
          full_name_en: string | null
          id: string
          must_change_password: boolean
          national_id: string | null
          phone: string | null
          previous_suspension_semesters_count: number
          program_id: string | null
          status: string
          student_study_status: string | null
          study_system: string | null
          transferred_current_year: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          academic_number: string
          consecutive_suspension_years_count?: number
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name_ar: string
          full_name_en?: string | null
          id?: string
          must_change_password?: boolean
          national_id?: string | null
          phone?: string | null
          previous_suspension_semesters_count?: number
          program_id?: string | null
          status?: string
          student_study_status?: string | null
          study_system?: string | null
          transferred_current_year?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          academic_number?: string
          consecutive_suspension_years_count?: number
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name_ar?: string
          full_name_en?: string | null
          id?: string
          must_change_password?: boolean
          national_id?: string | null
          phone?: string | null
          previous_suspension_semesters_count?: number
          program_id?: string | null
          status?: string
          student_study_status?: string | null
          study_system?: string | null
          transferred_current_year?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      student_request_attachment_uploads: {
        Row: {
          attached_at: string | null
          checksum_sha256: string | null
          created_at: string
          created_by: string
          field_key: string
          id: string
          mime_type: string
          original_file_name: string
          rejected_at: string | null
          rejection_code: string | null
          size_bytes: number
          storage_bucket: string
          storage_object_path: string
          student_profile_id: string
          student_request_id: string
          upload_status: string
          uploaded_at: string | null
        }
        Insert: {
          attached_at?: string | null
          checksum_sha256?: string | null
          created_at?: string
          created_by: string
          field_key: string
          id?: string
          mime_type: string
          original_file_name: string
          rejected_at?: string | null
          rejection_code?: string | null
          size_bytes: number
          storage_bucket: string
          storage_object_path: string
          student_profile_id: string
          student_request_id: string
          upload_status?: string
          uploaded_at?: string | null
        }
        Update: {
          attached_at?: string | null
          checksum_sha256?: string | null
          created_at?: string
          created_by?: string
          field_key?: string
          id?: string
          mime_type?: string
          original_file_name?: string
          rejected_at?: string | null
          rejection_code?: string | null
          size_bytes?: number
          storage_bucket?: string
          storage_object_path?: string
          student_profile_id?: string
          student_request_id?: string
          upload_status?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_request_attachment_uploads_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "student_request_attachment_uploads_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_attachment_uploads_student_request_id_fkey"
            columns: ["student_request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      student_request_attachments: {
        Row: {
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          request_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          request_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          request_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      student_request_fee_assessments: {
        Row: {
          amount: number
          assessed_at: string
          assessed_by: string | null
          created_at: string
          currency: string
          hafiza_reference: string | null
          id: string
          notes: string | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_reference: string | null
          payment_status: string
          request_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          assessed_at?: string
          assessed_by?: string | null
          created_at?: string
          currency?: string
          hafiza_reference?: string | null
          id?: string
          notes?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_reference?: string | null
          payment_status?: string
          request_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          assessed_at?: string
          assessed_by?: string | null
          created_at?: string
          currency?: string
          hafiza_reference?: string | null
          id?: string
          notes?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_reference?: string | null
          payment_status?: string
          request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_request_fee_assessments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      student_request_parallel_group_members: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          created_at: string
          group_id: string
          id: string
          notes: string | null
          processing_role_id: string | null
          processing_unit_id: string | null
          role_key: string | null
          status: string
          unit_key: string | null
          updated_at: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          created_at?: string
          group_id: string
          id?: string
          notes?: string | null
          processing_role_id?: string | null
          processing_unit_id?: string | null
          role_key?: string | null
          status?: string
          unit_key?: string | null
          updated_at?: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          created_at?: string
          group_id?: string
          id?: string
          notes?: string | null
          processing_role_id?: string | null
          processing_unit_id?: string | null
          role_key?: string | null
          status?: string
          unit_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_request_parallel_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "student_request_parallel_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_parallel_group_members_processing_role_id_fkey"
            columns: ["processing_role_id"]
            isOneToOne: false
            referencedRelation: "request_processing_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_parallel_group_members_processing_unit_id_fkey"
            columns: ["processing_unit_id"]
            isOneToOne: false
            referencedRelation: "request_processing_units"
            referencedColumns: ["id"]
          },
        ]
      }
      student_request_parallel_groups: {
        Row: {
          completed_at: string | null
          created_at: string
          group_key: string
          id: string
          mode: string
          status: string
          student_request_id: string
          student_request_workflow_step_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          group_key: string
          id?: string
          mode?: string
          status?: string
          student_request_id: string
          student_request_workflow_step_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          group_key?: string
          id?: string
          mode?: string
          status?: string
          student_request_id?: string
          student_request_workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_request_parallel_grou_student_request_workflow_ste_fkey"
            columns: ["student_request_workflow_step_id"]
            isOneToOne: false
            referencedRelation: "student_request_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_parallel_groups_student_request_id_fkey"
            columns: ["student_request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      student_request_service_windows: {
        Row: {
          academic_year_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          is_active: boolean
          max_allowed_courses: number | null
          notes: string | null
          request_type_code: string
          semester_id: string | null
          starts_at: string
          target_semester_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          is_active?: boolean
          max_allowed_courses?: number | null
          notes?: string | null
          request_type_code: string
          semester_id?: string | null
          starts_at: string
          target_semester_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          is_active?: boolean
          max_allowed_courses?: number | null
          notes?: string | null
          request_type_code?: string
          semester_id?: string | null
          starts_at?: string
          target_semester_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_request_service_windows_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_service_windows_request_type_code_fk"
            columns: ["request_type_code"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "student_request_service_windows_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_service_windows_target_semester_id_fkey"
            columns: ["target_semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      student_request_workflow_events: {
        Row: {
          actor_role_id: string | null
          actor_unit_id: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          message_ar: string | null
          message_en: string | null
          payload: Json
          student_request_id: string
          visible_to_student: boolean
          workflow_step_runtime_id: string | null
        }
        Insert: {
          actor_role_id?: string | null
          actor_unit_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message_ar?: string | null
          message_en?: string | null
          payload?: Json
          student_request_id: string
          visible_to_student?: boolean
          workflow_step_runtime_id?: string | null
        }
        Update: {
          actor_role_id?: string | null
          actor_unit_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message_ar?: string | null
          message_en?: string | null
          payload?: Json
          student_request_id?: string
          visible_to_student?: boolean
          workflow_step_runtime_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_request_workflow_events_actor_role_id_fkey"
            columns: ["actor_role_id"]
            isOneToOne: false
            referencedRelation: "request_processing_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_workflow_events_actor_unit_id_fkey"
            columns: ["actor_unit_id"]
            isOneToOne: false
            referencedRelation: "request_processing_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_workflow_events_student_request_id_fkey"
            columns: ["student_request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_workflow_events_workflow_step_runtime_id_fkey"
            columns: ["workflow_step_runtime_id"]
            isOneToOne: false
            referencedRelation: "student_request_workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      student_request_workflow_steps: {
        Row: {
          assigned_faculty_profile_id: string | null
          assigned_position_assignment_id: string | null
          assigned_staff_profile_id: string | null
          assigned_user_id: string | null
          comment: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          decision: string | null
          entered_at: string | null
          id: string
          metadata: Json
          processing_role_id: string | null
          processing_unit_id: string | null
          status: string
          step_key: string
          step_name_ar: string
          step_order: number
          student_request_id: string
          updated_at: string
          workflow_id: string | null
          workflow_step_id: string | null
        }
        Insert: {
          assigned_faculty_profile_id?: string | null
          assigned_position_assignment_id?: string | null
          assigned_staff_profile_id?: string | null
          assigned_user_id?: string | null
          comment?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decision?: string | null
          entered_at?: string | null
          id?: string
          metadata?: Json
          processing_role_id?: string | null
          processing_unit_id?: string | null
          status?: string
          step_key: string
          step_name_ar: string
          step_order: number
          student_request_id: string
          updated_at?: string
          workflow_id?: string | null
          workflow_step_id?: string | null
        }
        Update: {
          assigned_faculty_profile_id?: string | null
          assigned_position_assignment_id?: string | null
          assigned_staff_profile_id?: string | null
          assigned_user_id?: string | null
          comment?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decision?: string | null
          entered_at?: string | null
          id?: string
          metadata?: Json
          processing_role_id?: string | null
          processing_unit_id?: string | null
          status?: string
          step_key?: string
          step_name_ar?: string
          step_order?: number
          student_request_id?: string
          updated_at?: string
          workflow_id?: string | null
          workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "srw_steps_assigned_faculty_profile_id_fk"
            columns: ["assigned_faculty_profile_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "srw_steps_assigned_position_assignment_id_fk"
            columns: ["assigned_position_assignment_id"]
            isOneToOne: false
            referencedRelation: "position_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "srw_steps_assigned_staff_profile_id_fk"
            columns: ["assigned_staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_workflow_steps_processing_role_id_fkey"
            columns: ["processing_role_id"]
            isOneToOne: false
            referencedRelation: "request_processing_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_workflow_steps_processing_unit_id_fkey"
            columns: ["processing_unit_id"]
            isOneToOne: false
            referencedRelation: "request_processing_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_workflow_steps_student_request_id_fkey"
            columns: ["student_request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "request_type_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_request_workflow_steps_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "request_type_workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      student_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          current_assignee_id: string | null
          current_role_key: string | null
          current_step_index: number
          description: string | null
          form_data: Json
          id: string
          internal_notes: string | null
          rejection_reason: string | null
          request_number: string | null
          request_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          student_notes: string | null
          student_profile_id: string
          submitted_at: string | null
          title: string
          updated_at: string
          workflow_id: string | null
          workflow_version: number | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          current_assignee_id?: string | null
          current_role_key?: string | null
          current_step_index?: number
          description?: string | null
          form_data?: Json
          id?: string
          internal_notes?: string | null
          rejection_reason?: string | null
          request_number?: string | null
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_notes?: string | null
          student_profile_id: string
          submitted_at?: string | null
          title: string
          updated_at?: string
          workflow_id?: string | null
          workflow_version?: number | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          current_assignee_id?: string | null
          current_role_key?: string | null
          current_step_index?: number
          description?: string | null
          form_data?: Json
          id?: string
          internal_notes?: string | null
          rejection_reason?: string | null
          request_number?: string | null
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_notes?: string | null
          student_profile_id?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
          workflow_id?: string | null
          workflow_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_requests_type_request_types_code_fk"
            columns: ["request_type"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "student_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "request_type_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      student_service_request_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          from_step_index: number | null
          id: string
          notes: string | null
          payload: Json
          request_id: string
          to_status: string | null
          to_step_index: number | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          from_step_index?: number | null
          id?: string
          notes?: string | null
          payload?: Json
          request_id: string
          to_status?: string | null
          to_step_index?: number | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          from_step_index?: number | null
          id?: string
          notes?: string | null
          payload?: Json
          request_id?: string
          to_status?: string | null
          to_step_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_service_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      student_service_request_steps: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          action: string | null
          assigned_to: string | null
          created_at: string
          id: string
          notes: string | null
          request_id: string
          role_key: string
          status: string
          step_index: number
          step_key: string
          step_title_ar: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          action?: string | null
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          request_id: string
          role_key: string
          status?: string
          step_index: number
          step_key: string
          step_title_ar: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          action?: string | null
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          request_id?: string
          role_key?: string
          status?: string
          step_index?: number
          step_key?: string
          step_title_ar?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_service_request_steps_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      student_trusted_devices: {
        Row: {
          algorithm: string
          created_at: string
          device_id: string
          id: string
          platform: string
          public_key: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          algorithm?: string
          created_at?: string
          device_id: string
          id?: string
          platform?: string
          public_key: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          algorithm?: string
          created_at?: string
          device_id?: string
          id?: string
          platform?: string
          public_key?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_plan_courses: {
        Row: {
          course_id: string
          created_at: string
          id: string
          is_required: boolean
          level_id: string
          prerequisite_course_id: string | null
          semester_code: string
          sort_order: number
          study_plan_id: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          is_required?: boolean
          level_id: string
          prerequisite_course_id?: string | null
          semester_code: string
          sort_order?: number
          study_plan_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          is_required?: boolean
          level_id?: string
          prerequisite_course_id?: string | null
          semester_code?: string
          sort_order?: number
          study_plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plan_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "study_plan_courses_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "academic_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plan_courses_prerequisite_course_id_fkey"
            columns: ["prerequisite_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plan_courses_prerequisite_course_id_fkey"
            columns: ["prerequisite_course_id"]
            isOneToOne: false
            referencedRelation: "student_course_grade_summary"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "study_plan_courses_study_plan_id_fkey"
            columns: ["study_plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          program_id: string
          status: string
          total_credit_hours: number
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          program_id: string
          status?: string
          total_credit_hours?: number
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          program_id?: string
          status?: string
          total_credit_hours?: number
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plans_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      time_slots: {
        Row: {
          created_at: string
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          end_time: string
          id: string
          is_active: boolean
          name_ar: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          end_time: string
          id?: string
          is_active?: boolean
          name_ar: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: Database["public"]["Enums"]["day_of_week"]
          end_time?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      transfer_request_details: {
        Row: {
          created_at: string
          current_department_id: string | null
          current_program_id: string
          effect_applied_at: string | null
          id: string
          notes: string | null
          previous_department_id: string | null
          previous_program_id: string | null
          request_id: string
          requested_department_id: string | null
          requested_program_id: string
          transfer_reason: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_department_id?: string | null
          current_program_id: string
          effect_applied_at?: string | null
          id?: string
          notes?: string | null
          previous_department_id?: string | null
          previous_program_id?: string | null
          request_id: string
          requested_department_id?: string | null
          requested_program_id: string
          transfer_reason: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_department_id?: string | null
          current_program_id?: string
          effect_applied_at?: string | null
          id?: string
          notes?: string | null
          previous_department_id?: string | null
          previous_program_id?: string | null
          request_id?: string
          requested_department_id?: string | null
          requested_program_id?: string
          transfer_reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_request_details_current_department_id_fkey"
            columns: ["current_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_request_details_current_program_id_fkey"
            columns: ["current_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_request_details_previous_department_id_fkey"
            columns: ["previous_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_request_details_previous_program_id_fkey"
            columns: ["previous_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_request_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "student_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_request_details_requested_department_id_fkey"
            columns: ["requested_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_request_details_requested_program_id_fkey"
            columns: ["requested_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          notes: string | null
          role_code: string
          source_position_assignment_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          role_code: string
          source_position_assignment_id?: string | null
          source_type?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          role_code?: string
          source_position_assignment_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_role_assignments_source_position_assignment_id_fkey"
            columns: ["source_position_assignment_id"]
            isOneToOne: false
            referencedRelation: "position_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      student_course_grade_summary: {
        Row: {
          academic_number: string | null
          course_code: string | null
          course_id: string | null
          course_name: string | null
          course_section_id: string | null
          enrollment_id: string | null
          overall_status: string | null
          percentage: number | null
          section_code: string | null
          student_name: string | null
          student_profile_id: string | null
          total_max: number | null
          total_score: number | null
        }
        Relationships: []
      }
      student_transcript_summary: {
        Row: {
          academic_number: string | null
          academic_year_id: string | null
          academic_year_name: string | null
          avg_percentage: number | null
          courses_count: number | null
          failed_count: number | null
          level_id: string | null
          level_name: string | null
          level_number: number | null
          passed_count: number | null
          passed_hours: number | null
          registered_hours: number | null
          semester_code: string | null
          semester_id: string | null
          semester_name: string | null
          student_name_ar: string | null
          student_profile_id: string | null
        }
        Relationships: []
      }
      student_unofficial_transcript: {
        Row: {
          academic_number: string | null
          academic_year_id: string | null
          academic_year_name: string | null
          course_code: string | null
          course_id: string | null
          course_name: string | null
          course_status: string | null
          credit_hours: number | null
          department_id: string | null
          department_name: string | null
          enrollment_id: string | null
          enrollment_status: string | null
          final_score: number | null
          grade_label: string | null
          level_id: string | null
          level_name: string | null
          level_number: number | null
          max_score: number | null
          notes: string | null
          official_result: number | null
          percentage: number | null
          program_id: string | null
          program_name: string | null
          section_code: string | null
          semester_code: string | null
          semester_id: string | null
          semester_name: string | null
          student_name_ar: string | null
          student_name_en: string | null
          student_profile_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _assert_enrollment_certificate_e2e_processing_assignments: {
        Args: never
        Returns: undefined
      }
      _ec_new_verification_token: { Args: never; Returns: string }
      _ec_sha256_hex: { Args: { p_text: string }; Returns: string }
      _enrollment_certificate_e2e_load_hidden_type: {
        Args: { p_require_inactive: boolean }
        Returns: {
          article_ref: string | null
          category: string | null
          code: string
          created_at: string
          description_ar: string | null
          form_schema: Json
          id: string
          ineligible_display_mode: string
          is_active: boolean
          name_ar: string
          request_audience: string
          required_documents: Json
          requires_attachment: boolean
          sort_order: number
          student_visible: boolean
          title_en: string | null
          updated_at: string
          workflow_schema: Json
        }
        SetofOptions: {
          from: "*"
          to: "request_types"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _ga_extract_state_values: { Args: { p_states: Json }; Returns: string[] }
      acknowledge_council_notification: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      act_on_b1_student_request_step_atomic: {
        Args: {
          p_action: string
          p_comment?: string
          p_payload?: Json
          p_step_id: string
        }
        Returns: Json
      }
      act_on_student_request_step: {
        Args: {
          p_action: string
          p_comment?: string
          p_payload?: Json
          p_step_id: string
        }
        Returns: Json
      }
      add_graduation_project_team_member: {
        Args: {
          p_correlation_id: string
          p_project_id: string
          p_student_profile_id: string
          p_student_user_id: string
        }
        Returns: string
      }
      admin_create_enrollment_certificate_e2e_draft: {
        Args: {
          p_e2e_marker: string
          p_student_notes?: string
          p_student_user_id: string
        }
        Returns: Json
      }
      admin_get_request_workflow_config: {
        Args: { p_request_type_id: string }
        Returns: Json
      }
      admin_get_service_definition: {
        Args: { p_request_type_id: string }
        Returns: Json
      }
      admin_mark_faculty_password_reset: {
        Args: { _profile_id: string }
        Returns: {
          must_change_password: boolean
          profile_id: string
          user_id: string
        }[]
      }
      admin_mark_staff_password_reset: {
        Args: { _profile_id: string }
        Returns: {
          must_change_password: boolean
          profile_id: string
          user_id: string
        }[]
      }
      admin_mark_student_password_reset: {
        Args: { _profile_id: string }
        Returns: {
          must_change_password: boolean
          profile_id: string
          user_id: string
        }[]
      }
      admin_save_request_type_eligibility_rules: {
        Args: { p_request_type_id: string; p_rules: Json }
        Returns: Json
      }
      admin_save_request_workflow_config: {
        Args: {
          p_request_type_id: string
          p_steps: Json
          p_transitions: Json
          p_workflow: Json
        }
        Returns: Json
      }
      admin_set_enrollment_certificate_e2e_submit_window: {
        Args: { p_e2e_marker: string; p_open: boolean }
        Returns: Json
      }
      admin_set_faculty_status: {
        Args: { _active: boolean; _profile_id: string }
        Returns: {
          profile_id: string
          status: string
          user_id: string
        }[]
      }
      admin_set_request_workflow_step_actions: {
        Args: { p_step_actions: Json; p_workflow_id: string }
        Returns: Json
      }
      admin_set_staff_status: {
        Args: { _active: boolean; _profile_id: string }
        Returns: {
          profile_id: string
          status: string
          user_id: string
        }[]
      }
      admin_set_student_status: {
        Args: { _active: boolean; _profile_id: string }
        Returns: {
          profile_id: string
          status: string
          user_id: string
        }[]
      }
      admin_unlink_portal_login: {
        Args: { p_kind: string; p_profile_id: string }
        Returns: string
      }
      apply_b1_academic_effect_for_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      apply_b1_department_transfer_effect: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      apply_b1_detail_rpc_write_boundaries: { Args: never; Returns: undefined }
      apply_b1_enrollment_suspension_effect: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      apply_b1_excused_absence_effect: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      apply_b1_file_withdrawal_effect: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      apply_b1_final_chance_effect: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      apply_configured_action_effect: {
        Args: { p_action_code: string; p_request_id: string }
        Returns: undefined
      }
      apply_student_discount: {
        Args: { _discount_id: string }
        Returns: undefined
      }
      apply_student_request_workflow_transition: {
        Args: {
          p_action_result: string
          p_actor_user_id?: string
          p_from_runtime_step_id: string
          p_request_id: string
        }
        Returns: string
      }
      approve_and_lock_council_minutes: {
        Args: { p_approved_body?: string; p_meeting_id: string }
        Returns: Json
      }
      archive_council_meeting: { Args: { p_meeting_id: string }; Returns: Json }
      archive_enrollment_certificate_from_workflow_step: {
        Args: { p_comment?: string; p_payload?: Json; p_step_id: string }
        Returns: Json
      }
      archive_graduation_project: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_project_id: string
        }
        Returns: string
      }
      assert_b1_academic_period_reference: {
        Args: { p_academic_year_id: string; p_semester_id: string }
        Returns: undefined
      }
      assert_b1_active_course_enrollment: {
        Args: { p_course_section_id: string; p_student_profile_id: string }
        Returns: undefined
      }
      assert_b1_runtime_step_assignee_effective: {
        Args: { p_step_id: string }
        Returns: undefined
      }
      assert_b1_runtime_step_row_assignee_effective: {
        Args: {
          p_step: Database["public"]["Tables"]["student_request_workflow_steps"]["Row"]
        }
        Returns: undefined
      }
      assert_b1_target_program_department: {
        Args: { p_department_id: string; p_program_id: string }
        Returns: undefined
      }
      assert_can_activate_request_workflow: { Args: never; Returns: undefined }
      assert_can_admin_enrollment_certificate_e2e: {
        Args: never
        Returns: undefined
      }
      assert_can_admin_save_request_workflow: {
        Args: never
        Returns: undefined
      }
      assert_can_assess_student_request_fee: { Args: never; Returns: undefined }
      assert_can_confirm_student_request_fee_payment: {
        Args: never
        Returns: undefined
      }
      assert_can_read_student_eligibility_context: {
        Args: { p_student_profile_id: string }
        Returns: undefined
      }
      assert_enrollment_certificate_pdf_generation_ready: {
        Args: never
        Returns: undefined
      }
      assert_final_chance_type_for_new_write: {
        Args: { p_chance_type: string }
        Returns: undefined
      }
      assert_required_student_request_attachments: {
        Args: { p_attachment_ids: string[]; p_student_request_id: string }
        Returns: undefined
      }
      assert_student_can_use_request_type: {
        Args: { _profile_status: string; _request_audience: string }
        Returns: undefined
      }
      assert_student_request_eligibility_rules: {
        Args: { p_request_type_code: string; p_student_profile_id: string }
        Returns: undefined
      }
      assess_student_request_fee: {
        Args: { p_amount: number; p_notes?: string; p_request_id: string }
        Returns: Json
      }
      assign_graduation_project_committee_member: {
        Args: {
          p_correlation_id: string
          p_faculty_profile_id: string
          p_project_id: string
          p_user_id: string
        }
        Returns: string
      }
      assign_graduation_project_supervisor: {
        Args: {
          p_correlation_id: string
          p_faculty_profile_id: string
          p_project_id: string
          p_user_id: string
        }
        Returns: string
      }
      audit_resolve_role: { Args: { _user_id: string }; Returns: string }
      authorize_student_request_attachment_download: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      b1_assert_draft_allowlist: {
        Args: { p_canonical: string; p_form: Json }
        Returns: undefined
      }
      b1_assert_draft_form_object: {
        Args: { p_form: Json }
        Returns: undefined
      }
      b1_assert_uuid_array_field: {
        Args: { p_form: Json; p_key: string }
        Returns: undefined
      }
      b1_assignment_identity_lock_key: { Args: never; Returns: number }
      b1_attachment_meta_json: {
        Args: {
          a: Database["public"]["Tables"]["student_request_attachment_uploads"]["Row"]
        }
        Returns: Json
      }
      b1_build_student_draft_dto: {
        Args: { p_request_id: string }
        Returns: Json
      }
      b1_canonical_primary_stored_code: {
        Args: { p_canonical: string }
        Returns: string
      }
      b1_canonical_to_stored_codes: {
        Args: { p_canonical: string }
        Returns: string[]
      }
      b1_deny_draft_mutation: { Args: never; Returns: undefined }
      b1_deny_read: { Args: never; Returns: undefined }
      b1_draft_form_allowlist: {
        Args: { p_canonical: string }
        Returns: string[]
      }
      b1_draft_payload_hash: {
        Args: { p_canonical: string; p_form: Json; p_request_id: string }
        Returns: string
      }
      b1_e2e_88_allows_hidden_create: {
        Args: { p_form_data: Json; p_request_type: string }
        Returns: boolean
      }
      b1_e2e_88_correlations_aligned: {
        Args: {
          p_binding_correlation: string
          p_execution_correlation: string
          p_request_id: string
        }
        Returns: boolean
      }
      b1_e2e_88_execution_is_live: {
        Args: { p_execution_id: string }
        Returns: boolean
      }
      b1_e2e_88_is_five_service: { Args: { p_code: string }; Returns: boolean }
      b1_e2e_88_marker: { Args: never; Returns: string }
      b1_e2e_88_parse_correlation: { Args: { p_raw: string }; Returns: string }
      b1_e2e_88_request_correlation: {
        Args: { p_request_id: string }
        Returns: string
      }
      b1_e2e_88_request_is_marked: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      b1_e2e_88_step_matches_applied_snapshot: {
        Args: { p_applied: Json; p_step_id: string }
        Returns: boolean
      }
      b1_e2e_88_write_audit: {
        Args: {
          p_actor_user_id: string
          p_correlation_id: string
          p_detail?: Json
          p_event_type: string
          p_execution_id: string
          p_request_id: string
          p_runtime_step_id: string
        }
        Returns: undefined
      }
      b1_expected_secure_attachment_field: {
        Args: { p_request_type: string }
        Returns: string
      }
      b1_is_five_service_type: { Args: { p_stored: string }; Returns: boolean }
      b1_legacy_fallback_enabled: {
        Args: { p_service_code: string }
        Returns: boolean
      }
      b1_list_attachment_metas_for_request: {
        Args: { p_request_id: string }
        Returns: Json
      }
      b1_lock_assignment_identity_boundary: { Args: never; Returns: undefined }
      b1_map_request_status: { Args: { p_status: string }; Returns: string }
      b1_map_ui_staff_action: {
        Args: { p_action_type: string }
        Returns: string
      }
      b1_require_active_student_profile: {
        Args: never
        Returns: {
          academic_number: string
          consecutive_suspension_years_count: number
          created_at: string
          department_id: string | null
          email: string | null
          full_name_ar: string
          full_name_en: string | null
          id: string
          must_change_password: boolean
          national_id: string | null
          phone: string | null
          previous_suspension_semesters_count: number
          program_id: string | null
          status: string
          student_study_status: string | null
          study_system: string | null
          transferred_current_year: boolean
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "student_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      b1_require_auth_uid: { Args: never; Returns: string }
      b1_runtime_step_contract_ok: {
        Args: {
          p_action_type: string
          p_role_code: string
          p_service_code: string
          p_step_key: string
          p_unit_code: string
          p_workflow_id: string
        }
        Returns: boolean
      }
      b1_stored_to_canonical: { Args: { p_stored: string }; Returns: string }
      bind_b1_e2e_88_actor_to_runtime_step: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_correlation_id: string
          p_department_id?: string
          p_department_side?: string
          p_request_id: string
          p_runtime_step_id: string
        }
        Returns: string
      }
      build_enrollment_certificate_issuance_snapshot: {
        Args: { p_student_profile_id: string }
        Returns: Json
      }
      calculate_agenda_item_result: {
        Args: { p_agenda_item_id: string }
        Returns: Json
      }
      can_access_student_service_request: {
        Args: { _request_id: string; _user_id: string }
        Returns: boolean
      }
      can_act_on_student_service_request: {
        Args: { _request_id: string; _user_id: string }
        Returns: boolean
      }
      can_add_council_topic_attachment: {
        Args: { _topic_id: string }
        Returns: boolean
      }
      can_current_user_access_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      can_current_user_act_on_step: {
        Args: { p_action: string; p_step_id: string }
        Returns: boolean
      }
      can_manage_council: {
        Args: { _council: string; _user: string }
        Returns: boolean
      }
      can_manage_study_plan: {
        Args: { _study_plan_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_council_topic_attachment: {
        Args: { _council_id: string; _topic_id: string; _user: string }
        Returns: boolean
      }
      can_review_council_topic_final: {
        Args: { _topic: string; _user: string }
        Returns: boolean
      }
      can_review_council_topic_prepare: {
        Args: { _topic: string; _user: string }
        Returns: boolean
      }
      can_schedule_council_meeting: {
        Args: { _council: string; _user: string }
        Returns: boolean
      }
      can_send_internal_message: {
        Args: { _recipient: string; _sender: string }
        Returns: boolean
      }
      can_submit_council_topic: {
        Args: { _council: string; _user: string }
        Returns: boolean
      }
      can_submit_to_council_meeting_intake: {
        Args: { _meeting: string; _user: string }
        Returns: boolean
      }
      can_upload_council_topic_attachment: {
        Args: { _council_id: string; _topic_id: string; _user: string }
        Returns: boolean
      }
      can_upload_graduation_project_object: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      can_write_council_agenda: {
        Args: { _council: string; _user: string }
        Returns: boolean
      }
      cancel_official_document: {
        Args: { _document_id: string; _reason?: string }
        Returns: undefined
      }
      cast_council_vote: {
        Args: { p_agenda_item_id: string; p_vote_value: string }
        Returns: Json
      }
      cdp_admin_delivery_overview: { Args: never; Returns: Json }
      cdp_can_manage_section: {
        Args: { _course_section_id: string; _user_id: string }
        Returns: boolean
      }
      cdp_can_view_section: {
        Args: { _course_section_id: string; _user_id: string }
        Returns: boolean
      }
      cdp_clear_session_execution: {
        Args: { p_plan_session_id: string }
        Returns: undefined
      }
      cdp_delivery_monitoring: { Args: { p_period?: string }; Returns: Json }
      cdp_get_section_plan: {
        Args: { p_course_section_id: string }
        Returns: Json
      }
      cdp_instantiate_from_syllabus: {
        Args: { p_course_section_id: string }
        Returns: string
      }
      cdp_is_section_faculty: {
        Args: { _course_section_id: string; _user_id: string }
        Returns: boolean
      }
      cdp_list_my_faculty_sections: { Args: never; Returns: Json }
      cdp_list_plan_sessions_for_materials: {
        Args: { p_course_section_id: string }
        Returns: Json
      }
      cdp_list_student_sections: { Args: never; Returns: Json }
      cdp_publish_plan: { Args: { p_plan_id: string }; Returns: undefined }
      cdp_record_session_execution: {
        Args: {
          p_compensation_date: string
          p_execution_date: string
          p_notes: string
          p_plan_session_id: string
          p_reason: string
          p_status: string
        }
        Returns: string
      }
      cdp_regenerate_section_plan: {
        Args: { p_course_section_id: string }
        Returns: Json
      }
      cdp_save_plan: {
        Args: {
          p_course_section_id: string
          p_planned_session_count: number
          p_sessions: Json
        }
        Returns: string
      }
      check_and_record_rate_limit: {
        Args: {
          p_action: string
          p_block_minutes?: number
          p_key: string
          p_max_attempts: number
          p_window_minutes: number
        }
        Returns: Json
      }
      check_student_request_basic_eligibility:
        | {
            Args: { p_request_type_code: string; p_student_profile_id: string }
            Returns: Json
          }
        | {
            Args: { p_request_type_code: string; p_student_profile_id: string }
            Returns: Json
          }
      cleanup_b1_e2e_88_package: {
        Args: { p_correlation_id?: string; p_restore_assignees?: boolean }
        Returns: Json
      }
      cleanup_graduation_project_orphan_storage_contract: {
        Args: { p_correlation_id: string; p_project_id: string }
        Returns: Json
      }
      cleanup_rate_limit_attempts: { Args: never; Returns: number }
      close_agenda_item_vote: {
        Args: { p_agenda_item_id: string }
        Returns: Json
      }
      close_b1_e2e_88_execution: {
        Args: { p_correlation_id: string; p_reason?: string }
        Returns: boolean
      }
      close_council_session: { Args: { p_meeting_id: string }; Returns: Json }
      complete_council_decision: {
        Args: {
          p_decision_id: string
          p_evidence_metadata?: Json
          p_execution_note?: string
        }
        Returns: Json
      }
      complete_faculty_password_change: { Args: never; Returns: undefined }
      complete_staff_password_change: { Args: never; Returns: undefined }
      complete_student_password_change: { Args: never; Returns: undefined }
      complete_student_request_attachment_upload: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      conclude_graduation_project_result: {
        Args: {
          p_correlation_id: string
          p_decision: string
          p_expected_version: number
          p_notes?: string
          p_project_id: string
        }
        Returns: string
      }
      confirm_student_request_fee_payment: {
        Args: {
          p_notes?: string
          p_payment_reference: string
          p_request_id: string
        }
        Returns: Json
      }
      consume_step_up_proof: {
        Args: {
          p_action_code: string
          p_payload_hash: string
          p_proof_token: string
          p_request_id: string
        }
        Returns: undefined
      }
      council_add_manual_agenda_item: {
        Args: {
          p_meeting_id: string
          p_notes?: string
          p_order_index?: number
          p_title: string
        }
        Returns: Json
      }
      council_add_topic_to_agenda: {
        Args: {
          p_meeting_id: string
          p_notes?: string
          p_order_index?: number
          p_topic_id: string
        }
        Returns: Json
      }
      council_approve_quorum_policy: {
        Args: {
          p_absolute_count?: number
          p_council_id: string
          p_ratio_denominator?: number
          p_ratio_numerator?: number
          p_threshold_kind: Database["public"]["Enums"]["academic_council_quorum_threshold_kind"]
        }
        Returns: Json
      }
      council_assert_c1_contract_present: { Args: never; Returns: boolean }
      council_attendance_deny: { Args: { p_code?: string }; Returns: undefined }
      council_attendance_emit_audit: {
        Args: {
          p_action_type: string
          p_actor: string
          p_council_id: string
          p_entity_id: string
          p_entity_type: string
          p_meeting_id: string
          p_payload?: Json
        }
        Returns: undefined
      }
      council_attendance_require_auth_uid: { Args: never; Returns: string }
      council_attendance_state_counts_present: {
        Args: {
          p_state: Database["public"]["Enums"]["academic_council_attendance_state"]
        }
        Returns: boolean
      }
      council_compute_required_member_count: {
        Args: {
          p_eligible: number
          p_policy: Database["public"]["Tables"]["academic_council_quorum_policies"]["Row"]
        }
        Returns: number
      }
      council_current_approved_quorum_policy: {
        Args: { p_council_id: string }
        Returns: {
          absolute_count: number | null
          approved_at: string | null
          approved_by: string | null
          council_id: string
          created_at: string
          created_by: string
          id: string
          policy_version: number
          ratio_denominator: number | null
          ratio_numerator: number | null
          status: Database["public"]["Enums"]["academic_council_quorum_policy_status"]
          superseded_at: string | null
          threshold_kind: Database["public"]["Enums"]["academic_council_quorum_threshold_kind"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "academic_council_quorum_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      council_deactivate_membership: {
        Args: { p_membership_id: string }
        Returns: Json
      }
      council_decision_transition_is_legal: {
        Args: {
          p_from: Database["public"]["Enums"]["academic_council_decision_status"]
          p_to: Database["public"]["Enums"]["academic_council_decision_status"]
        }
        Returns: boolean
      }
      council_deny: { Args: { p_code?: string }; Returns: undefined }
      council_ensure_attendance_roll: {
        Args: { p_actor: string; p_meeting_id: string }
        Returns: {
          council_id: string
          created_at: string
          eligible_member_count: number
          finalized_at: string | null
          finalized_by: string | null
          id: string
          meeting_id: string
          opened_by: string
          snapshot_taken_at: string
          status: Database["public"]["Enums"]["academic_council_attendance_roll_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "academic_council_meeting_attendance_rolls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      council_evaluate_quorum_internal: {
        Args: { p_actor: string; p_final: boolean; p_meeting_id: string }
        Returns: {
          created_at: string
          eligible_member_count: number
          evaluated_at: string
          evaluated_by: string
          id: string
          is_final: boolean
          meeting_id: string
          policy_id: string
          policy_version: number
          present_member_count: number
          quorum_met: boolean
          required_member_count: number
          roll_id: string
        }
        SetofOptions: {
          from: "*"
          to: "academic_council_meeting_quorum_evaluations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      council_finalize_meeting_agenda: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      council_link_membership: {
        Args: {
          p_council_id: string
          p_member_role: Database["public"]["Enums"]["academic_council_member_role"]
          p_user_id: string
        }
        Returns: Json
      }
      council_meeting_attendance_is_locked: {
        Args: { p_meeting_id: string }
        Returns: boolean
      }
      council_meeting_transition_is_legal: {
        Args: {
          p_from_status: Database["public"]["Enums"]["academic_council_meeting_status"]
          p_to_status: Database["public"]["Enums"]["academic_council_meeting_status"]
        }
        Returns: boolean
      }
      council_member_had_tenure: {
        Args: { p_at_date?: string; p_council_id: string; p_user_id: string }
        Returns: boolean
      }
      council_member_is_quorum_eligible: {
        Args: {
          p_role: Database["public"]["Enums"]["academic_council_member_role"]
        }
        Returns: boolean
      }
      council_reorder_agenda_items: {
        Args: { p_items: Json; p_meeting_id: string }
        Returns: Json
      }
      council_require_auth_uid: { Args: never; Returns: string }
      council_resubmit_topic: { Args: { p_topic_id: string }; Returns: Json }
      council_review_topic: {
        Args: {
          p_expected_status?: Database["public"]["Enums"]["academic_council_topic_status"]
          p_review_note?: string
          p_status: Database["public"]["Enums"]["academic_council_topic_status"]
          p_topic_id: string
        }
        Returns: Json
      }
      council_schedule_meeting: {
        Args: {
          p_council_id: string
          p_intake_closes_at?: string
          p_intake_opens_at?: string
          p_location?: string
          p_notes?: string
          p_scheduled_at: string
          p_title: string
        }
        Returns: Json
      }
      council_submit_topic: {
        Args: {
          p_body?: string
          p_category?: string
          p_council_id: string
          p_meeting_id: string
          p_title: string
        }
        Returns: Json
      }
      council_topic_attachment_count: {
        Args: { _topic_id: string }
        Returns: number
      }
      council_topic_transition_is_legal: {
        Args: {
          p_from: Database["public"]["Enums"]["academic_council_topic_status"]
          p_to: Database["public"]["Enums"]["academic_council_topic_status"]
        }
        Returns: boolean
      }
      council_transition_meeting: {
        Args: {
          p_evidence?: Json
          p_expected_status: Database["public"]["Enums"]["academic_council_meeting_status"]
          p_meeting_id: string
          p_to_status: Database["public"]["Enums"]["academic_council_meeting_status"]
        }
        Returns: Json
      }
      council_update_agenda_item: {
        Args: {
          p_agenda_item_id: string
          p_is_approved?: boolean
          p_notes?: string
          p_order_index?: number
          p_title?: string
        }
        Returns: Json
      }
      council_update_meeting_metadata: {
        Args: {
          p_intake_closes_at?: string
          p_intake_opens_at?: string
          p_location?: string
          p_meeting_id: string
          p_notes?: string
          p_scheduled_at?: string
          p_status?: Database["public"]["Enums"]["academic_council_meeting_status"]
          p_title?: string
        }
        Returns: Json
      }
      council_update_own_topic_draft: {
        Args: {
          p_body?: string
          p_category?: string
          p_title?: string
          p_topic_id: string
        }
        Returns: Json
      }
      count_admins: { Args: never; Returns: number }
      create_b1_request_draft_for_student: {
        Args: { p_canonical_code: string; p_idempotency_key?: string }
        Returns: Json
      }
      create_council_notification: {
        Args: {
          p_body?: string
          p_council_id: string
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_meeting_id?: string
          p_payload?: Json
          p_title?: string
          p_user_id: string
        }
        Returns: string
      }
      create_graduate_record_from_official_decision: {
        Args: { p_decision_id: string }
        Returns: string
      }
      create_graduation_project_file_upload_intent: {
        Args: {
          p_byte_size: number
          p_category: string
          p_correlation_id: string
          p_original_name: string
          p_project_id: string
          p_sha256?: string
        }
        Returns: Json
      }
      create_graduation_project_signed_download: {
        Args: { p_correlation_id: string; p_file_id: string }
        Returns: Json
      }
      create_graduation_project_team: {
        Args: {
          p_academic_year_id: string
          p_correlation_id: string
          p_department_id: string
          p_leader_student_profile_id: string
          p_leader_user_id: string
          p_program_id: string
          p_semester_id: string
        }
        Returns: string
      }
      create_notification: {
        Args: {
          _message: string
          _reference_id?: string
          _reference_type?: string
          _target_user_id: string
          _title: string
          _type: string
        }
        Returns: string
      }
      create_student_request: {
        Args: {
          p_form_data?: Json
          p_request_type: string
          p_student_notes?: string
          p_title: string
        }
        Returns: string
      }
      create_student_request_attachment_upload_intent: {
        Args: {
          p_checksum_sha256?: string
          p_field_key: string
          p_mime_type: string
          p_original_file_name: string
          p_size_bytes: number
          p_student_request_id: string
        }
        Returns: Json
      }
      current_student_profile_for_auth: {
        Args: never
        Returns: {
          academic_number: string
          full_name_ar: string
          profile_id: string
          profile_status: string
        }[]
      }
      current_user_app_roles: { Args: never; Returns: string[] }
      current_user_has_b1_e2e_88_actor_binding: {
        Args: {
          p_action: string
          p_request_id: string
          p_runtime_step_id: string
        }
        Returns: boolean
      }
      current_user_has_b1_e2e_88_department_binding: {
        Args: { p_step_id: string; p_step_key: string }
        Returns: boolean
      }
      current_user_has_exact_processing_binding: {
        Args: { p_role_id: string; p_unit_id: string }
        Returns: boolean
      }
      current_user_matches_transfer_department_scope: {
        Args: { p_step_id: string; p_step_key: string }
        Returns: boolean
      }
      current_user_processing_assignments: {
        Args: never
        Returns: {
          assignment_id: string
          assignment_type: string
          department_id: string
          is_academic_unit: boolean
          is_managerial: boolean
          portal_scope: string
          role_code: string
          role_id: string
          role_name_ar: string
          unit_code: string
          unit_id: string
          unit_name_ar: string
        }[]
      }
      dispatch_council_notification: {
        Args: {
          p_council_id: string
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_meeting_id?: string
          p_payload?: Json
        }
        Returns: undefined
      }
      draft_council_minutes: {
        Args: { p_body: string; p_meeting_id: string }
        Returns: Json
      }
      evaluate_council_meeting_quorum: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      evaluate_graduate_account_continuity: {
        Args: { p_at: string; p_capability: string; p_policy_code: string }
        Returns: boolean
      }
      evaluate_request_eligibility_rules: {
        Args: { p_context: Json; p_request_type_code: string }
        Returns: string[]
      }
      evaluate_workflow_transition_condition: {
        Args: { p_condition: Json; p_request_id: string }
        Returns: boolean
      }
      fail_enrollment_certificate_document_generation: {
        Args: {
          p_attempt_id: string
          p_error_code: string
          p_error_message: string
        }
        Returns: Json
      }
      finalize_council_meeting_attendance: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      finalize_enrollment_certificate_document_generation: {
        Args: {
          p_attempt_id: string
          p_comment?: string
          p_verification_token?: string
        }
        Returns: Json
      }
      finalize_graduation_project_file: {
        Args: { p_correlation_id: string; p_file_id: string; p_sha256?: string }
        Returns: Json
      }
      find_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      ga_admin_list_followup_types: {
        Args: never
        Returns: {
          code: string
          created_at: string
          current_workflow_id: string
          current_workflow_status: string
          current_workflow_version: number
          description_ar: string
          id: string
          is_active: boolean
          label_ar: string
          updated_at: string
        }[]
      }
      ga_admin_list_followup_workflows: {
        Args: { p_followup_type_id?: string }
        Returns: {
          created_at: string
          followup_type_id: string
          id: string
          initial_state: string
          is_current: boolean
          max_active_per_graduate: number
          notes: string
          published_at: string
          require_outcome_on_complete: boolean
          states: Json
          status: string
          superseded_at: string
          terminal_states: Json
          transitions: Json
          type_code: string
          type_label_ar: string
          version: number
        }[]
      }
      ga_admin_open_followups_count: { Args: never; Returns: number }
      ga_admin_publish_workflow: {
        Args: { p_workflow_id: string }
        Returns: undefined
      }
      ga_admin_save_followup_type: {
        Args: {
          p_code?: string
          p_description_ar?: string
          p_id?: string
          p_is_active?: boolean
          p_label_ar?: string
        }
        Returns: string
      }
      ga_admin_save_workflow_draft: {
        Args: { p_payload: Json }
        Returns: string
      }
      ga_can_read_operational_catalog: { Args: never; Returns: boolean }
      ga_is_admin_fallback: { Args: never; Returns: boolean }
      ga_is_specialist_only: { Args: never; Returns: boolean }
      ga_lock_operational_actor_mode: {
        Args: { p_department_id?: string }
        Returns: string
      }
      ga_lock_scope_actor_mode: { Args: { p_scope: Json }; Returns: string }
      ga_op_close_survey: { Args: { p_survey_id: string }; Returns: undefined }
      ga_op_list_communications: {
        Args: { p_graduate_record_id: string }
        Returns: {
          channel: string
          id: string
          notice_version: string
          purpose_code: string
          sent_at: string
          sent_by: string
          template_code: string
        }[]
      }
      ga_op_list_employers: {
        Args: never
        Returns: {
          id: string
          legal_name: string
          sector_code: string
          verification_state: string
          verified_at: string
        }[]
      }
      ga_op_list_events: {
        Args: never
        Returns: {
          audience_scope: Json
          ends_at: string
          event_type: string
          id: string
          notice_version: string
          purpose_code: string
          registrations_count: number
          starts_at: string
          state: string
          title: string
        }[]
      }
      ga_op_list_opportunities: {
        Args: never
        Returns: {
          audience_scope: Json
          closes_at: string
          created_at: string
          description: string
          employer_id: string
          id: string
          opportunity_type: string
          published_at: string
          state: string
          title: string
        }[]
      }
      ga_op_list_surveys: {
        Args: never
        Returns: {
          audience_scope: Json
          minimum_report_cell_size: number
          notice_version: string
          published_at: string
          purpose_code: string
          questions: Json
          response_count: number
          state: string
          survey_id: string
          title: string
          version: number
          version_id: string
        }[]
      }
      ga_op_log_communication: {
        Args: {
          p_channel: string
          p_contact_point_id: string
          p_graduate_record_id: string
          p_payload_meta?: Json
          p_purpose_code: string
          p_template_code: string
        }
        Returns: string
      }
      ga_op_publish_survey_version: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      ga_op_save_event: {
        Args: {
          p_audience_scope?: Json
          p_ends_at: string
          p_event_type: string
          p_id: string
          p_notice_version: string
          p_purpose_code: string
          p_starts_at: string
          p_title: string
        }
        Returns: string
      }
      ga_op_save_opportunity: {
        Args: {
          p_audience_scope?: Json
          p_closes_at?: string
          p_description: string
          p_employer_id?: string
          p_id: string
          p_opportunity_type: string
          p_title: string
        }
        Returns: string
      }
      ga_op_save_survey: {
        Args: {
          p_audience_scope?: Json
          p_id: string
          p_minimum_report_cell_size?: number
          p_purpose_code: string
          p_title: string
        }
        Returns: string
      }
      ga_op_save_survey_version_draft: {
        Args: {
          p_notice_version: string
          p_questions: Json
          p_survey_id: string
          p_version_id: string
        }
        Returns: string
      }
      ga_op_transition_event: {
        Args: { p_event_id: string; p_target_state: string }
        Returns: undefined
      }
      ga_operational_actor_mode: {
        Args: { p_department_id?: string }
        Returns: string
      }
      ga_resolve_current_workflow_snapshot: {
        Args: { p_followup_type_id: string }
        Returns: Json
      }
      ga_scope_department_ids: { Args: { p_scope: Json }; Returns: string[] }
      ga_scope_visible_to_caller: { Args: { p_scope: Json }; Returns: boolean }
      generate_document_number: { Args: never; Returns: string }
      generate_verification_code: { Args: never; Returns: string }
      get_active_workflow_for_request_type: {
        Args: { p_request_type_id: string }
        Returns: {
          change_note: string | null
          code: string
          created_at: string
          created_by: string | null
          description_ar: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          published_at: string | null
          request_type_id: string
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "request_type_workflows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_admin_dashboard_kpis: { Args: never; Returns: Json }
      get_admin_progress_kpis: { Args: { _limit?: number }; Returns: Json }
      get_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_available_request_types_for_current_student: {
        Args: never
        Returns: {
          code: string
          description_ar: string
          disabled_reason: string
          id: string
          ineligible_display_mode: string
          is_disabled: boolean
          is_eligible: boolean
          name_ar: string
          request_audience: string
          requires_attachment: boolean
          sort_order: number
        }[]
      }
      get_b1_assigned_inbox_for_actor: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_b1_assigned_request_details_for_actor: {
        Args: { p_request_id: string }
        Returns: Json
      }
      get_b1_request_details_for_student: {
        Args: { p_request_id: string }
        Returns: Json
      }
      get_b1_request_draft_for_student: {
        Args: { p_request_id: string }
        Returns: Json
      }
      get_b1_request_form_options: {
        Args: { p_canonical_code: string }
        Returns: Json
      }
      get_b1_secure_read_runtime_capability: { Args: never; Returns: Json }
      get_b1_step_allowed_actions: {
        Args: { p_step_id: string }
        Returns: Json
      }
      get_backup_infrastructure_stats: { Args: never; Returns: Json }
      get_council_archive_summary: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_attendance_quorum_summary: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      get_council_chair_dashboard: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_decision_followup_dashboard: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_historical_minutes: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      get_council_meeting_metrics: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_member_workspace: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_notification_recipients: {
        Args: { p_context?: Json; p_council_id: string; p_event_type: string }
        Returns: {
          user_id: string
        }[]
      }
      get_council_overdue_decisions: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_agenda_completion: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_archive_status: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_attendance_rate: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_council_activity: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_decision_execution_status: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_meeting_duration: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_meetings_by_period: {
        Args: { p_council_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      get_council_report_overdue_decisions: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_quorum_history: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_topic_disposition: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_report_vote_result_summary: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_responsible_decisions: {
        Args: { p_user_id?: string }
        Returns: Json
      }
      get_council_secretary_dashboard: {
        Args: { p_council_id: string }
        Returns: Json
      }
      get_council_vote_result: {
        Args: { p_agenda_item_id: string }
        Returns: Json
      }
      get_graduation_project_detail: {
        Args: { p_project_id: string }
        Returns: Json
      }
      get_hardening_status: { Args: never; Returns: Json }
      get_my_council_notifications: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_my_request_actor_inbox: {
        Args: { p_filters?: Json; p_limit?: number; p_offset?: number }
        Returns: {
          department_id: string
          department_name_ar: string
          is_actionable: boolean
          processing_role_id: string
          processing_role_name_ar: string
          processing_unit_id: string
          processing_unit_name_ar: string
          request_type_code: string
          request_type_name_ar: string
          step_key: string
          step_name_ar: string
          step_status: string
          student_id: string
          student_name: string
          student_request_id: string
          submitted_at: string
          workflow_step_runtime_id: string
        }[]
      }
      get_my_student_requests: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          created_at: string
          current_role_key: string
          id: string
          request_number: string
          request_type: string
          request_type_name_ar: string
          status: string
          submitted_at: string
          title: string
          updated_at: string
        }[]
      }
      get_owned_student_request_attachment_upload: {
        Args: { p_attachment_id: string }
        Returns: {
          attached_at: string | null
          checksum_sha256: string | null
          created_at: string
          created_by: string
          field_key: string
          id: string
          mime_type: string
          original_file_name: string
          rejected_at: string | null
          rejection_code: string | null
          size_bytes: number
          storage_bucket: string
          storage_object_path: string
          student_profile_id: string
          student_request_id: string
          upload_status: string
          uploaded_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "student_request_attachment_uploads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_faculty_count: { Args: never; Returns: number }
      get_public_faculty_directory: {
        Args: never
        Returns: {
          admin_position: string
          admin_position_order: number
          bio_ar: string
          bio_en: string
          category: string
          degree: string
          employee_id: string
          full_name_ar: string
          full_name_en: string
          id: string
          is_active: boolean
          photo: string
          program_id: string
          programs: Json
          rank: string
          sort_order: number
          specialization: string
          start_year: number
        }[]
      }
      get_student_request_detail_for_actor: {
        Args: { p_request_id: string }
        Returns: Json
      }
      get_student_request_eligibility_context: {
        Args: { p_student_profile_id: string }
        Returns: Json
      }
      get_student_request_fee_processing_context: {
        Args: { p_request_id: string }
        Returns: Json
      }
      gp_academic_date: { Args: { p_at?: string }; Returns: string }
      gp_admin_list_policies: {
        Args: never
        Returns: {
          academic_year_id: string | null
          allow_co_supervisor: boolean
          created_at: string
          created_by: string | null
          defense_window_end: string | null
          defense_window_start: string | null
          department_id: string | null
          enforce_defense_window: boolean | null
          enforce_proposal_window: boolean | null
          id: string
          max_committee_members: number | null
          max_revision_rounds: number | null
          max_supervisors: number
          max_team_size: number | null
          min_committee_members: number | null
          min_team_size: number | null
          notes: string | null
          passing_score: number | null
          proposal_window_end: string | null
          proposal_window_start: string | null
          published_at: string | null
          published_by: string | null
          required_progress_reports: number | null
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "graduation_project_policies"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      gp_admin_publish_policy: {
        Args: { p_policy_id: string }
        Returns: string
      }
      gp_admin_save_policy_draft: { Args: { p_payload: Json }; Returns: string }
      gp_admin_validate_policy: {
        Args: { p_policy_id: string }
        Returns: string[]
      }
      gp_assert_version: {
        Args: {
          p: Database["public"]["Tables"]["graduation_projects"]["Row"]
          p_expected: number
        }
        Returns: undefined
      }
      gp_can_manage_policies: { Args: never; Returns: boolean }
      gp_current_revision_final_ready: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      gp_effective_policy: {
        Args: { p_academic_year_id: string; p_department_id: string }
        Returns: {
          academic_year_id: string | null
          allow_co_supervisor: boolean
          created_at: string
          created_by: string | null
          defense_window_end: string | null
          defense_window_start: string | null
          department_id: string | null
          enforce_defense_window: boolean | null
          enforce_proposal_window: boolean | null
          id: string
          max_committee_members: number | null
          max_revision_rounds: number | null
          max_supervisors: number
          max_team_size: number | null
          min_committee_members: number | null
          min_team_size: number | null
          notes: string | null
          passing_score: number | null
          proposal_window_end: string | null
          proposal_window_start: string | null
          published_at: string | null
          published_by: string | null
          required_progress_reports: number | null
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "graduation_project_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gp_effective_policy_for_project: {
        Args: { p_project_id: string }
        Returns: {
          academic_year_id: string | null
          allow_co_supervisor: boolean
          created_at: string
          created_by: string | null
          defense_window_end: string | null
          defense_window_start: string | null
          department_id: string | null
          enforce_defense_window: boolean | null
          enforce_proposal_window: boolean | null
          id: string
          max_committee_members: number | null
          max_revision_rounds: number | null
          max_supervisors: number
          max_team_size: number | null
          min_committee_members: number | null
          min_team_size: number | null
          notes: string | null
          passing_score: number | null
          proposal_window_end: string | null
          proposal_window_start: string | null
          published_at: string | null
          published_by: string | null
          required_progress_reports: number | null
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "graduation_project_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gp_has_current_clean_file: {
        Args: {
          p_category: Database["public"]["Enums"]["graduation_project_file_category"]
          p_project_id: string
        }
        Returns: boolean
      }
      gp_project_policy: {
        Args: { p_project_id: string }
        Returns: {
          academic_year_id: string | null
          allow_co_supervisor: boolean
          created_at: string
          created_by: string | null
          defense_window_end: string | null
          defense_window_start: string | null
          department_id: string | null
          enforce_defense_window: boolean | null
          enforce_proposal_window: boolean | null
          id: string
          max_committee_members: number | null
          max_revision_rounds: number | null
          max_supervisors: number
          max_team_size: number | null
          min_committee_members: number | null
          min_team_size: number | null
          notes: string | null
          passing_score: number | null
          proposal_window_end: string | null
          proposal_window_start: string | null
          published_at: string | null
          published_by: string | null
          required_progress_reports: number | null
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "graduation_project_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gp_proposal_complete: {
        Args: { p: Database["public"]["Tables"]["graduation_projects"]["Row"] }
        Returns: boolean
      }
      gp_replay_entity: {
        Args: {
          p_correlation_id: string
          p_event_type: string
          p_project_id: string
        }
        Returns: string
      }
      gp_take_replay: {
        Args: {
          p_correlation_id: string
          p_event_type: string
          p_project_id: string
          p_request: Json
        }
        Returns: string
      }
      gp_team_mutator: {
        Args: { p_project_id: string }
        Returns: {
          active: boolean
          assigned_at: string
          assigned_by: string
          department_id: string
          ended_at: string | null
          faculty_profile_id: string | null
          id: string
          is_leader: boolean
          processing_role:
            | Database["public"]["Enums"]["graduation_project_assignment_role"]
            | null
          processing_unit_id: string | null
          project_id: string
          role: Database["public"]["Enums"]["graduation_project_assignment_role"]
          student_profile_id: string | null
          supervision_status:
            | Database["public"]["Enums"]["graduation_project_supervision_status"]
            | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "graduation_project_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gp_validate_policy: { Args: { p_policy_id: string }; Returns: string[] }
      graduate_add_contact_point: {
        Args: {
          p_channel_type: string
          p_graduate_record_id: string
          p_purpose_code: string
          p_value: string
        }
        Returns: string
      }
      graduate_affairs_audit: {
        Args: {
          p_aggregate_id: string
          p_aggregate_type: string
          p_event_type: string
          p_payload?: Json
          p_purpose_code: string
        }
        Returns: undefined
      }
      graduate_affairs_can_access_record: {
        Args: { p_graduate_record_id: string }
        Returns: boolean
      }
      graduate_affairs_cohort_employment_report: {
        Args: {
          p_graduation_year: number
          p_minimum_cell_size?: number
          p_program_id: string
        }
        Returns: {
          employed: number
          population: number
          specialization_related: number
          suppressed: boolean
          verified: number
        }[]
      }
      graduate_affairs_create_followup: {
        Args: {
          p_assignee_user_id: string
          p_followup_type_id: string
          p_graduate_record_id: string
          p_next_action_at?: string
        }
        Returns: string
      }
      graduate_affairs_get_graduate_file: {
        Args: { p_graduate_record_id: string }
        Returns: Json
      }
      graduate_affairs_is_manager: { Args: never; Returns: boolean }
      graduate_affairs_is_specialist: { Args: never; Returns: boolean }
      graduate_affairs_list_assignable_staff: {
        Args: never
        Returns: {
          full_name: string
          role_code: string
          user_id: string
        }[]
      }
      graduate_affairs_lock_authorized_staff_profile_id: {
        Args: { p_role_code: string; p_user_id: string }
        Returns: string
      }
      graduate_affairs_lock_caller_authorized_staff_profile: {
        Args: { p_role_code: string }
        Returns: string
      }
      graduate_affairs_moderate_opportunity:
        | {
            Args: {
              p_opportunity_id: string
              p_target_state: Database["public"]["Enums"]["graduate_opportunity_state"]
            }
            Returns: undefined
          }
        | {
            Args: { p_opportunity_id: string; p_target_state: string }
            Returns: undefined
          }
      graduate_affairs_resolve_authorized_staff_profile_id: {
        Args: { p_role_code: string; p_user_id: string }
        Returns: string
      }
      graduate_affairs_resolve_caller_authorized_staff_profile_id: {
        Args: { p_role_code: string }
        Returns: string
      }
      graduate_affairs_resolve_self_context: {
        Args: { p_capability: string }
        Returns: Json
      }
      graduate_affairs_resolve_staff_record_access: {
        Args: { p_graduate_record_id: string }
        Returns: Json
      }
      graduate_affairs_search_records: {
        Args: {
          p_department_id?: string
          p_graduation_year?: number
          p_limit?: number
          p_program_id?: string
        }
        Returns: {
          department_id: string
          graduation_year: number
          id: string
          program_id: string
          record_state: Database["public"]["Enums"]["graduate_decision_state"]
        }[]
      }
      graduate_affairs_set_employer_verification: {
        Args: { p_employer_id: string; p_target_state: string }
        Returns: undefined
      }
      graduate_affairs_specialist_department_ids: {
        Args: never
        Returns: string[]
      }
      graduate_affairs_transition_followup: {
        Args: {
          p_followup_id: string
          p_next_action_at?: string
          p_outcome?: string
          p_target_state: string
        }
        Returns: undefined
      }
      graduate_affairs_user_is_active_staff: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      graduate_affairs_user_specialist_department_ids: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      graduate_aggregate_employment_report: {
        Args: {
          p_graduation_year: number
          p_minimum_cell_size?: number
          p_program_id: string
        }
        Returns: {
          employed: number
          population: number
          specialization_related: number
          suppressed: boolean
          verified: number
        }[]
      }
      graduate_audience_matches: {
        Args: { p_department_id: string; p_program_id: string; p_scope: Json }
        Returns: boolean
      }
      graduate_cancel_event_registration: {
        Args: { p_registration_id: string }
        Returns: undefined
      }
      graduate_grant_consent: {
        Args: {
          p_graduate_record_id: string
          p_notice_version: string
          p_purpose_code: string
        }
        Returns: string
      }
      graduate_is_current_self: {
        Args: { p_graduate_record_id: string }
        Returns: boolean
      }
      graduate_is_self: {
        Args: { p_graduate_record_id: string }
        Returns: boolean
      }
      graduate_list_self_surveys: {
        Args: { p_graduate_record_id: string }
        Returns: {
          already_responded: boolean
          consent_id: string
          notice_version: string
          purpose_code: string
          questions: Json
          survey_id: string
          survey_version_id: string
          title: string
        }[]
      }
      graduate_list_visible_events: {
        Args: { p_graduate_record_id: string }
        Returns: {
          ends_at: string
          event_type: string
          id: string
          notice_version: string
          purpose_code: string
          starts_at: string
          title: string
        }[]
      }
      graduate_list_visible_opportunities: {
        Args: { p_graduate_record_id: string }
        Returns: {
          closes_at: string
          description: string
          employer_name: string
          id: string
          opportunity_type: string
          published_at: string
          title: string
        }[]
      }
      graduate_my_consents: {
        Args: { p_graduate_record_id: string }
        Returns: {
          affirmative_action_at: string
          consent_state: string
          id: string
          notice_version: string
          purpose_code: string
          withdrawn_at: string
        }[]
      }
      graduate_my_contact_points: {
        Args: { p_graduate_record_id: string }
        Returns: {
          channel_type: string
          created_at: string
          id: string
          is_revoked: boolean
          is_verified: boolean
          purpose_code: string
        }[]
      }
      graduate_register_for_event: {
        Args: {
          p_consent_id: string
          p_event_id: string
          p_graduate_record_id: string
        }
        Returns: string
      }
      graduate_report_employment: {
        Args: {
          p_employer_name_reported: string
          p_employment_status: Database["public"]["Enums"]["graduate_employment_status"]
          p_ended_on: string
          p_graduate_record_id: string
          p_occupation_title: string
          p_specialization_relationship: Database["public"]["Enums"]["graduate_specialization_relationship"]
          p_started_on: string
        }
        Returns: string
      }
      graduate_require_approved_record_locked: {
        Args: { p_graduate_record_id: string }
        Returns: undefined
      }
      graduate_revoke_contact_point: {
        Args: { p_contact_point_id: string }
        Returns: undefined
      }
      graduate_self_matches_audience: {
        Args: { p_scope: Json }
        Returns: boolean
      }
      graduate_submit_survey_response: {
        Args: {
          p_answers: Json
          p_consent_id: string
          p_graduate_record_id: string
          p_survey_version_id: string
        }
        Returns: string
      }
      graduate_supersede_account_continuity_policy: {
        Args: {
          p_allow_portal_sign_in: boolean
          p_allow_university_email_reuse: boolean
          p_allowed_capabilities: Json
          p_decided_at?: string
          p_decided_by?: string
          p_expires_at?: string
          p_policy_code: string
          p_policy_state: Database["public"]["Enums"]["graduate_account_policy_state"]
          p_valid_from?: string
        }
        Returns: string
      }
      graduate_update_own_profile: {
        Args: {
          p_career_summary: string
          p_expected_row_version: number
          p_graduate_record_id: string
          p_preferred_contact_channel: string
          p_profile_visibility: string
          p_public_display_name: string
        }
        Returns: number
      }
      graduate_validate_survey_answers: {
        Args: { p_answers: Json; p_questions: Json }
        Returns: undefined
      }
      graduate_withdraw_consent: {
        Args: { p_consent_id: string }
        Returns: undefined
      }
      graduate_withdraw_survey_response: {
        Args: { p_response_id: string }
        Returns: undefined
      }
      has_any_role: {
        Args: { _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_council_role: {
        Args: {
          _council: string
          _role: Database["public"]["Enums"]["academic_council_member_role"]
          _user: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_b1_request_workflow_strict: {
        Args: { p_canonical_code: string; p_request_id: string }
        Returns: Json
      }
      initialize_student_request_workflow: {
        Args: { p_request_id: string }
        Returns: Json
      }
      is_b1_runtime_step_contract_configured: {
        Args: {
          p_action_type: string
          p_role_code: string
          p_step_key: string
          p_unit_code: string
          p_workflow_id: string
        }
        Returns: boolean
      }
      is_b1_stored_request_type: {
        Args: { p_request_type: string }
        Returns: boolean
      }
      is_council_admin: { Args: { _user: string }; Returns: boolean }
      is_council_member: {
        Args: { _council: string; _user: string }
        Returns: boolean
      }
      is_current_user_admin_actor: { Args: never; Returns: boolean }
      is_current_user_dean_for_student: {
        Args: { p_student_profile_id: string }
        Returns: boolean
      }
      is_current_user_department_head_for_student: {
        Args: { p_student_profile_id: string }
        Returns: boolean
      }
      is_current_user_registrar: { Args: never; Returns: boolean }
      is_department_head_of: {
        Args: { _dept_id: string; _user_id: string }
        Returns: boolean
      }
      is_dept_head_of_program: {
        Args: { _program_id: string; _user_id: string }
        Returns: boolean
      }
      is_dept_head_of_request: {
        Args: { _request_id: string; _user_id: string }
        Returns: boolean
      }
      is_dept_head_of_section: {
        Args: { _section_id: string; _user_id: string }
        Returns: boolean
      }
      is_faculty_of_grade: {
        Args: { _enrollment_id: string; _user_id: string }
        Returns: boolean
      }
      is_faculty_of_request: {
        Args: { _request_id: string; _user_id: string }
        Returns: boolean
      }
      is_faculty_of_section: {
        Args: { _section_id: string; _user_id: string }
        Returns: boolean
      }
      is_owner_of_request: {
        Args: { _request_id: string; _user_id: string }
        Returns: boolean
      }
      is_safe_graduation_project_object_key: {
        Args: { p_key: string; p_project_id: string }
        Returns: boolean
      }
      is_student_of_enrollment: {
        Args: { _enrollment_id: string; _user_id: string }
        Returns: boolean
      }
      is_valid_actor_request_action: {
        Args: { p_action: string }
        Returns: boolean
      }
      is_valid_b1_direct_assignment: {
        Args: {
          p_assignment_id: string
          p_department_id?: string
          p_require_faculty?: boolean
        }
        Returns: boolean
      }
      is_valid_b1_runtime_step_contract: {
        Args: {
          p_action_type: string
          p_request_type: string
          p_role_code: string
          p_step_key: string
          p_unit_code: string
        }
        Returns: boolean
      }
      issue_council_decision: {
        Args: {
          p_agenda_item_id: string
          p_body: string
          p_due_date?: string
          p_meeting_id: string
          p_responsible_unit?: string
          p_responsible_user_id?: string
          p_title: string
        }
        Returns: Json
      }
      issue_enrollment_certificate_from_workflow_step: {
        Args: { p_comment?: string; p_payload?: Json; p_step_id: string }
        Returns: Json
      }
      issue_official_document: {
        Args: {
          _document_type: string
          _metadata?: Json
          _student_profile_id: string
        }
        Returns: Json
      }
      issue_step_up_challenge: {
        Args: {
          p_action_code: string
          p_device_id: string
          p_payload_hash: string
          p_request_id: string
        }
        Returns: {
          challenge_id: string
          device_id: string
          expires_at: string
          nonce: string
        }[]
      }
      link_faculty_profile_account: {
        Args: { p_auth_user_id: string; p_profile_id: string }
        Returns: undefined
      }
      link_staff_profile_account: {
        Args: { p_auth_user_id: string; p_profile_id: string }
        Returns: undefined
      }
      link_student_user_account: {
        Args: { _profile_id: string; _target_user_id: string }
        Returns: Json
      }
      list_administration_graduation_projects_overview: {
        Args: never
        Returns: Json
      }
      list_b1_request_attachments_for_viewer: {
        Args: { p_request_id: string }
        Returns: Json
      }
      list_b1_requests_for_student: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      list_my_graduation_projects: { Args: never; Returns: Json }
      list_my_student_request_attachments: {
        Args: { p_student_request_id: string }
        Returns: {
          attached_at: string | null
          checksum_sha256: string | null
          created_at: string
          created_by: string
          field_key: string
          id: string
          mime_type: string
          original_file_name: string
          rejected_at: string | null
          rejection_code: string | null
          size_bytes: number
          storage_bucket: string
          storage_object_path: string
          student_profile_id: string
          student_request_id: string
          upload_status: string
          uploaded_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "student_request_attachment_uploads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_audit: {
        Args: {
          _action_type: string
          _actor_user_id?: string
          _entity_id: string
          _entity_type: string
          _new?: Json
          _notes?: string
          _old?: Json
        }
        Returns: undefined
      }
      mark_enrollment_certificate_document_generating: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      mark_enrollment_certificate_document_uploaded: {
        Args: { p_attempt_id: string; p_byte_length: number; p_sha256: string }
        Returns: Json
      }
      mark_graduation_project_defense_held: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_project_id: string
        }
        Returns: string
      }
      mark_graduation_project_file_scan_state: {
        Args: {
          p_correlation_id: string
          p_file_id: string
          p_scan_state: string
        }
        Returns: string
      }
      meeting_has_valid_quorum: {
        Args: { p_meeting_id: string }
        Returns: boolean
      }
      mint_step_up_proof: {
        Args: { p_challenge_id: string }
        Returns: {
          expires_at: string
          proof_token: string
        }[]
      }
      open_agenda_item_vote: {
        Args: { p_agenda_item_id: string }
        Returns: Json
      }
      open_b1_e2e_88_execution: {
        Args: {
          p_audit_metadata?: Json
          p_correlation_id: string
          p_expires_at: string
          p_service_code: string
          p_student_user_id: string
        }
        Returns: string
      }
      open_council_session: { Args: { p_meeting_id: string }; Returns: Json }
      p1_active_student_profile: { Args: { p_user: string }; Returns: string }
      p1_actor_is_test_only: { Args: { p_user: string }; Returns: boolean }
      p1_apply_final_result_decision: {
        Args: { p_final_result: number; p_note?: string; p_request: string }
        Returns: Json
      }
      p1_assert_department_transfer_level: {
        Args: { p_student: string }
        Returns: boolean
      }
      p1_assert_final_result_appeal_eligibility: {
        Args: { p_enrollment: string; p_now?: string; p_student: string }
        Returns: Json
      }
      p1_assert_october_eligibility: {
        Args: { p_selected?: string[]; p_student: string }
        Returns: Json
      }
      p1_assert_payment_confirmed: {
        Args: { p_request: string }
        Returns: boolean
      }
      p1_assert_replacement_card_eligibility: {
        Args: { p_student: string }
        Returns: boolean
      }
      p1_assert_step_actor: {
        Args: { p_actor?: string; p_request: string; p_step_key: string }
        Returns: boolean
      }
      p1_current_level_number: { Args: { p_student: string }; Returns: number }
      p1_e2e_07_allows_hidden_submit: {
        Args: { p_run_id: string; p_service_code: string }
        Returns: string
      }
      p1_e2e_07_marker: { Args: never; Returns: string }
      p1_enrollment_result: {
        Args: { p_enrollment: string }
        Returns: {
          max_total: number
          published_at: string
          total: number
        }[]
      }
      p1_final_result_published_at: {
        Args: { p_enrollment: string }
        Returns: string
      }
      p1_is_atomic_submit_service: {
        Args: { p_code: string }
        Returns: boolean
      }
      p1_october_remaining_requirements: {
        Args: { p_student: string }
        Returns: {
          course_code: string
          course_id: string
          course_name_ar: string
          requirement_id: string
        }[]
      }
      p1_passed_course_ids: { Args: { p_student: string }; Returns: string[] }
      p1_request_has_canonical_detail: {
        Args: { p_code: string; p_request_id: string }
        Returns: boolean
      }
      persist_b1_draft_form_and_details: {
        Args: {
          p_canonical: string
          p_form: Json
          p_profile: Database["public"]["Tables"]["student_profiles"]["Row"]
          p_request_id: string
        }
        Returns: undefined
      }
      persist_validated_b1_request_details: {
        Args: {
          p_attachment_ids: string[]
          p_canonical_code: string
          p_form_data: Json
          p_request_id: string
        }
        Returns: undefined
      }
      prepare_enrollment_certificate_document_generation: {
        Args: { p_idempotency_key: string; p_step_id: string }
        Returns: Json
      }
      recalc_student_fee_status: {
        Args: { _fee_id: string }
        Returns: undefined
      }
      reconcile_department_head_council_memberships: {
        Args: { p_user_id?: string }
        Returns: Json
      }
      record_council_meeting_attendance: {
        Args: { p_entries: Json; p_meeting_id: string }
        Returns: Json
      }
      record_external_university_payment_confirmation: {
        Args: { p_note?: string; p_step_id: string }
        Returns: Json
      }
      register_graduation_project_file: {
        Args: {
          p_byte_size: number
          p_category: string
          p_correlation_id: string
          p_original_name: string
          p_project_id: string
          p_sha256?: string
        }
        Returns: string
      }
      register_student_device: {
        Args: {
          p_algorithm: string
          p_device_id: string
          p_platform: string
          p_public_key: string
        }
        Returns: undefined
      }
      reject_student_request_attachment: {
        Args: { p_attachment_id: string; p_rejection_code: string }
        Returns: boolean
      }
      remove_graduation_project_team_member: {
        Args: {
          p_assignment_id: string
          p_correlation_id: string
          p_project_id: string
        }
        Returns: string
      }
      replace_class_schedule_for_context: {
        Args: { _rows: Json; _section_ids: string[] }
        Returns: Json
      }
      require_caller_student_gp_fourth_level_when_student_only: {
        Args: never
        Returns: undefined
      }
      require_graduation_project_accepted_supervisor: {
        Args: { p_project_id: string }
        Returns: {
          active: boolean
          assigned_at: string
          assigned_by: string
          department_id: string
          ended_at: string | null
          faculty_profile_id: string | null
          id: string
          is_leader: boolean
          processing_role:
            | Database["public"]["Enums"]["graduation_project_assignment_role"]
            | null
          processing_unit_id: string | null
          project_id: string
          role: Database["public"]["Enums"]["graduation_project_assignment_role"]
          student_profile_id: string | null
          supervision_status:
            | Database["public"]["Enums"]["graduation_project_supervision_status"]
            | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "graduation_project_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      require_graduation_project_assignment: {
        Args: {
          p_project_id: string
          p_roles: Database["public"]["Enums"]["graduation_project_assignment_role"][]
        }
        Returns: {
          active: boolean
          assigned_at: string
          assigned_by: string
          department_id: string
          ended_at: string | null
          faculty_profile_id: string | null
          id: string
          is_leader: boolean
          processing_role:
            | Database["public"]["Enums"]["graduation_project_assignment_role"]
            | null
          processing_unit_id: string | null
          project_id: string
          role: Database["public"]["Enums"]["graduation_project_assignment_role"]
          student_profile_id: string | null
          supervision_status:
            | Database["public"]["Enums"]["graduation_project_supervision_status"]
            | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "graduation_project_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      require_graduation_project_department_coordinator: {
        Args: { p_department_id: string }
        Returns: {
          active: boolean
          assigned_at: string
          assigned_by: string
          department_id: string
          ended_at: string | null
          faculty_profile_id: string
          id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "graduation_project_department_coordinators"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      require_graduation_project_leader: {
        Args: { p_project_id: string }
        Returns: {
          active: boolean
          assigned_at: string
          assigned_by: string
          department_id: string
          ended_at: string | null
          faculty_profile_id: string | null
          id: string
          is_leader: boolean
          processing_role:
            | Database["public"]["Enums"]["graduation_project_assignment_role"]
            | null
          processing_unit_id: string | null
          project_id: string
          role: Database["public"]["Enums"]["graduation_project_assignment_role"]
          student_profile_id: string | null
          supervision_status:
            | Database["public"]["Enums"]["graduation_project_supervision_status"]
            | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "graduation_project_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      require_student_actor_gp_fourth_level: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      require_student_gp_fourth_level_eligibility: {
        Args: { p_student_profile_id: string }
        Returns: undefined
      }
      resolve_agenda_item: {
        Args: { p_agenda_item_id: string; p_resolution?: string }
        Returns: Json
      }
      resolve_b1_workflow_transition: {
        Args: {
          p_action_result: string
          p_from_step_id: string
          p_request_id: string
          p_workflow_id: string
        }
        Returns: string
      }
      resolve_b1_workflow_transition_safe: {
        Args: {
          p_action_result: string
          p_from_step_id: string
          p_request_id: string
          p_workflow_id: string
        }
        Returns: string
      }
      respond_graduation_project_supervision: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_project_id: string
          p_response: string
        }
        Returns: string
      }
      resubmit_graduation_project_proposal: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_project_id: string
        }
        Returns: string
      }
      revert_student_discount: {
        Args: { _discount_id: string }
        Returns: undefined
      }
      review_graduation_project_final: {
        Args: {
          p_action: string
          p_comments: string
          p_correlation_id: string
          p_expected_version: number
          p_project_id: string
        }
        Returns: string
      }
      review_graduation_project_progress: {
        Args: {
          p_action: string
          p_comments: string
          p_correlation_id: string
          p_entry_id: string
        }
        Returns: string
      }
      review_graduation_project_proposal: {
        Args: {
          p_action: string
          p_correlation_id: string
          p_expected_version: number
          p_project_id: string
          p_reason: string
        }
        Returns: string
      }
      revoke_all_student_devices: { Args: never; Returns: undefined }
      revoke_student_device: {
        Args: { p_device_id: string }
        Returns: undefined
      }
      save_b1_request_draft_for_student: {
        Args: {
          p_expected_updated_at: string
          p_form_data: Json
          p_idempotency_key?: string
          p_request_id: string
        }
        Returns: Json
      }
      schedule_graduation_project_defense: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_project_id: string
          p_starts_at: string
          p_venue: string
        }
        Returns: string
      }
      start_agenda_item_discussion: {
        Args: { p_agenda_item_id: string }
        Returns: Json
      }
      student_has_approved_grades_for_transcript: {
        Args: { _student_profile_id: string }
        Returns: boolean
      }
      student_is_current_fourth_academic_level: {
        Args: { p_student_profile_id: string }
        Returns: boolean
      }
      student_request_ineligible_status_message: {
        Args: never
        Returns: string
      }
      student_request_pinned_workflow_id: {
        Args: { p_request_id: string }
        Returns: string
      }
      student_request_type_is_eligible: {
        Args: { _profile_status: string; _request_audience: string }
        Returns: boolean
      }
      submit_b1_student_request_atomic:
        | {
            Args: {
              p_attachment_ids: string[]
              p_canonical_code: string
              p_expected_updated_at: string
              p_form_data: Json
              p_request_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_attachment_ids: string[]
              p_canonical_code: string
              p_expected_updated_at: string
              p_form_data: Json
              p_request_id: string
              p_step_up_payload_hash: string
              p_step_up_proof: string
            }
            Returns: Json
          }
      submit_b1_student_request_atomic_core: {
        Args: {
          p_attachment_ids?: string[]
          p_canonical_code: string
          p_expected_updated_at: string
          p_form_data: Json
          p_request_id: string
        }
        Returns: Json
      }
      submit_council_minutes_for_review: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      submit_graduation_project_evaluation: {
        Args: {
          p_correlation_id: string
          p_notes: string
          p_project_id: string
          p_score: number
        }
        Returns: string
      }
      submit_graduation_project_final: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_file_id: string
          p_project_id: string
        }
        Returns: string
      }
      submit_graduation_project_progress: {
        Args: {
          p_correlation_id: string
          p_file_id: string
          p_project_id: string
          p_summary: string
        }
        Returns: string
      }
      submit_graduation_project_proposal: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_project_id: string
        }
        Returns: string
      }
      submit_student_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      submit_student_request_with_details: {
        Args: {
          p_form_data?: Json
          p_request_type: string
          p_student_notes?: string
          p_test_run_id?: string
          p_title: string
        }
        Returns: string
      }
      submit_student_request_with_secure_attachments: {
        Args: { p_attachment_ids: string[]; p_request_id: string }
        Returns: undefined
      }
      syllabus_approve_version: {
        Args: { p_syllabus_id: string }
        Returns: Json
      }
      syllabus_can_view: {
        Args: { _course_id: string; _user_id: string }
        Returns: boolean
      }
      syllabus_import_version: {
        Args: {
          p_course_code: string
          p_fingerprint?: string
          p_meta: Json
          p_sessions: Json
        }
        Returns: Json
      }
      syllabus_is_admin: { Args: { _user_id: string }; Returns: boolean }
      update_council_decision_followup: {
        Args: {
          p_decision_id: string
          p_evidence_metadata?: Json
          p_execution_note?: string
          p_status: string
        }
        Returns: Json
      }
      upsert_graduation_project_proposal: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_objectives: string
          p_problem_statement: string
          p_project_id: string
          p_summary: string
          p_title: string
        }
        Returns: string
      }
      user_can_see_announcement: {
        Args: { _ann_id: string; _uid: string }
        Returns: boolean
      }
      user_matches_workflow_runtime_step: {
        Args: { p_step_id: string }
        Returns: boolean
      }
      validate_financial_transaction: {
        Args: {
          _amount: number
          _exclude_payment_id?: string
          _kind: string
          _student_fee_id?: string
        }
        Returns: Json
      }
      validate_request_workflow_publish: {
        Args: { p_workflow_id: string }
        Returns: Json
      }
      verify_document: { Args: { _query: string }; Returns: Json }
      was_council_member_on: {
        Args: { _council: string; _date: string; _user: string }
        Returns: boolean
      }
      workflow_action_result_matches: {
        Args: { p_action_type: string; p_result: string }
        Returns: boolean
      }
      workflow_runtime_predecessors_satisfied: {
        Args: { p_step_id: string }
        Returns: boolean
      }
      workflow_runtime_step_configured_action: {
        Args: { p_step_id: string }
        Returns: string
      }
    }
    Enums: {
      academic_council_agenda_item_session_status:
        | "pending"
        | "in_discussion"
        | "voting_open"
        | "voting_closed"
        | "resolved"
      academic_council_attendance_roll_status: "open" | "finalized"
      academic_council_attendance_state:
        | "present"
        | "present_remote"
        | "excused"
        | "absent"
      academic_council_decision_status:
        | "issued"
        | "assigned"
        | "in_progress"
        | "partially_completed"
        | "completed"
        | "delayed"
        | "cancelled"
        | "blocked"
      academic_council_meeting_status:
        | "scheduled"
        | "intake_open"
        | "intake_closed"
        | "agenda_ready"
        | "in_session"
        | "minutes_draft"
        | "minutes_review"
        | "minutes_locked"
        | "archived"
        | "cancelled"
      academic_council_member_role:
        | "chair"
        | "vice_chair"
        | "secretary"
        | "member"
        | "viewer"
      academic_council_minutes_status:
        | "minutes_draft"
        | "minutes_review"
        | "minutes_locked"
      academic_council_quorum_policy_status: "draft" | "approved" | "superseded"
      academic_council_quorum_threshold_kind: "absolute" | "ratio"
      academic_council_topic_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "needs_completion"
        | "accepted_for_agenda"
        | "deferred"
        | "rejected"
        | "decided"
        | "closed"
      academic_council_type: "college" | "department"
      academic_council_vote_value: "yes" | "no" | "abstain"
      app_role:
        | "admin"
        | "editor"
        | "viewer"
        | "system_admin"
        | "dean"
        | "department_head"
        | "registrar"
        | "student_affairs"
        | "finance_officer"
        | "faculty_member"
        | "student"
        | "graduate"
        | "hr_officer"
      council_membership_source:
        | "official_assignment"
        | "administrative_position"
      day_of_week:
        | "saturday"
        | "sunday"
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
      graduate_account_policy_state: "undecided" | "approved" | "rejected"
      graduate_decision_state: "pending" | "approved" | "corrected" | "revoked"
      graduate_employment_status:
        | "employed"
        | "self_employed"
        | "seeking_work"
        | "continuing_education"
        | "not_seeking"
        | "not_disclosed"
      graduate_followup_state:
        | "open"
        | "in_progress"
        | "completed"
        | "cancelled"
      graduate_followup_workflow_status: "draft" | "published" | "superseded"
      graduate_opportunity_state:
        | "draft"
        | "in_review"
        | "published"
        | "closed"
        | "archived"
      graduate_source_kind:
        | "registrar_approved_decision"
        | "university_system_of_record_import"
      graduate_specialization_relationship:
        | "directly_related"
        | "partially_related"
        | "not_related"
        | "not_assessed"
      graduation_project_assignment_role:
        | "student"
        | "supervisor"
        | "coordinator"
        | "panel_member"
      graduation_project_file_category: "proposal" | "progress" | "final"
      graduation_project_file_upload_status:
        | "pending"
        | "uploaded"
        | "active"
        | "superseded"
        | "rejected"
      graduation_project_final_decision:
        | "passed"
        | "revisions_required"
        | "failed"
      graduation_project_scan_state:
        | "pending"
        | "clean"
        | "quarantined"
        | "rejected"
      graduation_project_state:
        | "draft"
        | "submitted"
        | "revision_required"
        | "rejected"
        | "approved"
        | "active"
        | "defense_scheduled"
        | "evaluating"
        | "archived"
        | "under_review"
        | "discussion_requested"
        | "discussion_scheduled"
        | "corrections_required"
        | "completed"
        | "cancelled"
      graduation_project_supervision_status: "pending" | "accepted" | "declined"
      room_type: "lecture" | "lab" | "office" | "hall"
      schedule_status: "draft" | "published" | "cancelled"
      schedule_type: "lecture" | "lab" | "tutorial" | "exam"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      academic_council_agenda_item_session_status: [
        "pending",
        "in_discussion",
        "voting_open",
        "voting_closed",
        "resolved",
      ],
      academic_council_attendance_roll_status: ["open", "finalized"],
      academic_council_attendance_state: [
        "present",
        "present_remote",
        "excused",
        "absent",
      ],
      academic_council_decision_status: [
        "issued",
        "assigned",
        "in_progress",
        "partially_completed",
        "completed",
        "delayed",
        "cancelled",
        "blocked",
      ],
      academic_council_meeting_status: [
        "scheduled",
        "intake_open",
        "intake_closed",
        "agenda_ready",
        "in_session",
        "minutes_draft",
        "minutes_review",
        "minutes_locked",
        "archived",
        "cancelled",
      ],
      academic_council_member_role: [
        "chair",
        "vice_chair",
        "secretary",
        "member",
        "viewer",
      ],
      academic_council_minutes_status: [
        "minutes_draft",
        "minutes_review",
        "minutes_locked",
      ],
      academic_council_quorum_policy_status: [
        "draft",
        "approved",
        "superseded",
      ],
      academic_council_quorum_threshold_kind: ["absolute", "ratio"],
      academic_council_topic_status: [
        "draft",
        "submitted",
        "under_review",
        "needs_completion",
        "accepted_for_agenda",
        "deferred",
        "rejected",
        "decided",
        "closed",
      ],
      academic_council_type: ["college", "department"],
      academic_council_vote_value: ["yes", "no", "abstain"],
      app_role: [
        "admin",
        "editor",
        "viewer",
        "system_admin",
        "dean",
        "department_head",
        "registrar",
        "student_affairs",
        "finance_officer",
        "faculty_member",
        "student",
        "graduate",
        "hr_officer",
      ],
      council_membership_source: [
        "official_assignment",
        "administrative_position",
      ],
      day_of_week: [
        "saturday",
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
      ],
      graduate_account_policy_state: ["undecided", "approved", "rejected"],
      graduate_decision_state: ["pending", "approved", "corrected", "revoked"],
      graduate_employment_status: [
        "employed",
        "self_employed",
        "seeking_work",
        "continuing_education",
        "not_seeking",
        "not_disclosed",
      ],
      graduate_followup_state: [
        "open",
        "in_progress",
        "completed",
        "cancelled",
      ],
      graduate_followup_workflow_status: ["draft", "published", "superseded"],
      graduate_opportunity_state: [
        "draft",
        "in_review",
        "published",
        "closed",
        "archived",
      ],
      graduate_source_kind: [
        "registrar_approved_decision",
        "university_system_of_record_import",
      ],
      graduate_specialization_relationship: [
        "directly_related",
        "partially_related",
        "not_related",
        "not_assessed",
      ],
      graduation_project_assignment_role: [
        "student",
        "supervisor",
        "coordinator",
        "panel_member",
      ],
      graduation_project_file_category: ["proposal", "progress", "final"],
      graduation_project_file_upload_status: [
        "pending",
        "uploaded",
        "active",
        "superseded",
        "rejected",
      ],
      graduation_project_final_decision: [
        "passed",
        "revisions_required",
        "failed",
      ],
      graduation_project_scan_state: [
        "pending",
        "clean",
        "quarantined",
        "rejected",
      ],
      graduation_project_state: [
        "draft",
        "submitted",
        "revision_required",
        "rejected",
        "approved",
        "active",
        "defense_scheduled",
        "evaluating",
        "archived",
        "under_review",
        "discussion_requested",
        "discussion_scheduled",
        "corrections_required",
        "completed",
        "cancelled",
      ],
      graduation_project_supervision_status: [
        "pending",
        "accepted",
        "declined",
      ],
      room_type: ["lecture", "lab", "office", "hall"],
      schedule_status: ["draft", "published", "cancelled"],
      schedule_type: ["lecture", "lab", "tutorial", "exam"],
    },
  },
} as const
