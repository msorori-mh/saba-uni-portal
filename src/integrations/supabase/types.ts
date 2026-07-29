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
      academic_council_decisions: {
        Row: {
          body: string
          created_at: string
          created_by: string
          decision_number: number
          due_date: string | null
          execution_note: string | null
          id: string
          meeting_id: string
          responsible_user_id: string | null
          status: Database["public"]["Enums"]["academic_council_decision_status"]
          title: string
          topic_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          decision_number: number
          due_date?: string | null
          execution_note?: string | null
          id?: string
          meeting_id: string
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["academic_council_decision_status"]
          title: string
          topic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          decision_number?: number
          due_date?: string | null
          execution_note?: string | null
          id?: string
          meeting_id?: string
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["academic_council_decision_status"]
          title?: string
          topic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_council_decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "academic_council_meetings"
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
      academic_council_meetings: {
        Row: {
          academic_year_id: string | null
          council_id: string
          created_at: string
          created_by: string
          id: string
          intake_closes_at: string | null
          intake_opens_at: string | null
          location: string | null
          meeting_number: number
          notes: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["academic_council_meeting_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          academic_year_id?: string | null
          council_id: string
          created_at?: string
          created_by: string
          id?: string
          intake_closes_at?: string | null
          intake_opens_at?: string | null
          location?: string | null
          meeting_number: number
          notes?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["academic_council_meeting_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          academic_year_id?: string | null
          council_id?: string
          created_at?: string
          created_by?: string
          id?: string
          intake_closes_at?: string | null
          intake_opens_at?: string | null
          location?: string | null
          meeting_number?: number
          notes?: string | null
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
          notes: string | null
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
          notes?: string | null
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
          notes?: string | null
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
        ]
      }
      academic_council_minutes: {
        Row: {
          approved_by: string | null
          body: string
          created_at: string
          drafted_by: string
          id: string
          is_locked: boolean
          locked_at: string | null
          meeting_id: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          body?: string
          created_at?: string
          drafted_by: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          meeting_id: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          body?: string
          created_at?: string
          drafted_by?: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          meeting_id?: string
          updated_at?: string
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
      grade_appeal_details: {
        Row: {
          academic_year_id: string
          approved_total_score: number | null
          course_section_id: string
          created_at: string
          current_grade_status: string | null
          current_grade_total: number | null
          grades_applied_at: string | null
          id: string
          notes: string | null
          reason: string
          request_id: string
          semester_id: string
          student_enrollment_id: string | null
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          approved_total_score?: number | null
          course_section_id: string
          created_at?: string
          current_grade_status?: string | null
          current_grade_total?: number | null
          grades_applied_at?: string | null
          id?: string
          notes?: string | null
          reason: string
          request_id: string
          semester_id: string
          student_enrollment_id?: string | null
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          approved_total_score?: number | null
          course_section_id?: string
          created_at?: string
          current_grade_status?: string | null
          current_grade_total?: number | null
          grades_applied_at?: string | null
          id?: string
          notes?: string | null
          reason?: string
          request_id?: string
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
          id: string
          is_active: boolean
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
          id?: string
          is_active?: boolean
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
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          notes?: string | null
          parent_code?: string | null
          sort_order?: number
          unit_type?: string
          updated_at?: string
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
      request_type_workflow_steps: {
        Row: {
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
          code: string
          created_at: string
          created_by: string | null
          description_ar: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          request_type_id: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          request_type_id: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          request_type_id?: string
          status?: string
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
        }
        Relationships: [
          {
            foreignKeyName: "student_requests_type_request_types_code_fk"
            columns: ["request_type"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["code"]
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
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          role_code: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          role_code?: string
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
          level_id: string | null
          level_name: string | null
          level_number: number | null
          max_score: number | null
          notes: string | null
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
      archive_enrollment_certificate_from_workflow_step: {
        Args: { p_comment?: string; p_payload?: Json; p_step_id: string }
        Returns: Json
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
      assess_student_request_fee: {
        Args: { p_amount: number; p_notes?: string; p_request_id: string }
        Returns: Json
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
      b1_expected_secure_attachment_field: {
        Args: { p_request_type: string }
        Returns: string
      }
      b1_is_five_service_type: { Args: { p_stored: string }; Returns: boolean }
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
      b1_stored_to_canonical: { Args: { p_stored: string }; Returns: string }
      build_enrollment_certificate_issuance_snapshot: {
        Args: { p_student_profile_id: string }
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
      can_upload_council_topic_attachment: {
        Args: { _council_id: string; _topic_id: string; _user: string }
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
      check_student_request_basic_eligibility: {
        Args: { p_request_type_code: string; p_student_profile_id: string }
        Returns: Json
      }
      cleanup_rate_limit_attempts: { Args: never; Returns: number }
      complete_faculty_password_change: { Args: never; Returns: undefined }
      complete_staff_password_change: { Args: never; Returns: undefined }
      complete_student_password_change: { Args: never; Returns: undefined }
      complete_student_request_attachment_upload: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      confirm_student_request_fee_payment: {
        Args: {
          p_notes?: string
          p_payment_reference: string
          p_request_id: string
        }
        Returns: Json
      }
      council_topic_attachment_count: {
        Args: { _topic_id: string }
        Returns: number
      }
      count_admins: { Args: never; Returns: number }
      create_b1_request_draft_for_student: {
        Args: { p_canonical_code: string; p_idempotency_key?: string }
        Returns: Json
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
      fail_enrollment_certificate_document_generation: {
        Args: {
          p_attempt_id: string
          p_error_code: string
          p_error_message: string
        }
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
      find_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      generate_document_number: { Args: never; Returns: string }
      generate_verification_code: { Args: never; Returns: string }
      get_active_workflow_for_request_type: {
        Args: { p_request_type_id: string }
        Returns: {
          code: string
          created_at: string
          created_by: string | null
          description_ar: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          request_type_id: string
          status: string
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
      get_hardening_status: { Args: never; Returns: Json }
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
      list_b1_request_attachments_for_viewer: {
        Args: { p_request_id: string }
        Returns: Json
      }
      list_b1_requests_for_student: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
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
      record_external_university_payment_confirmation: {
        Args: { p_note?: string; p_step_id: string }
        Returns: Json
      }
      reject_student_request_attachment: {
        Args: { p_attachment_id: string; p_rejection_code: string }
        Returns: boolean
      }
      replace_class_schedule_for_context: {
        Args: { _rows: Json; _section_ids: string[] }
        Returns: Json
      }
      revert_student_discount: {
        Args: { _discount_id: string }
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
      student_has_approved_grades_for_transcript: {
        Args: { _student_profile_id: string }
        Returns: boolean
      }
      student_request_ineligible_status_message: {
        Args: never
        Returns: string
      }
      student_request_type_is_eligible: {
        Args: { _profile_status: string; _request_audience: string }
        Returns: boolean
      }
      submit_b1_student_request_atomic: {
        Args: {
          p_attachment_ids?: string[]
          p_canonical_code: string
          p_expected_updated_at: string
          p_form_data: Json
          p_request_id: string
        }
        Returns: Json
      }
      submit_student_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      submit_student_request_with_secure_attachments: {
        Args: { p_attachment_ids: string[]; p_request_id: string }
        Returns: undefined
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
    }
    Enums: {
      academic_council_decision_status:
        | "issued"
        | "assigned"
        | "in_progress"
        | "partially_completed"
        | "completed"
        | "delayed"
        | "cancelled"
      academic_council_meeting_status:
        | "scheduled"
        | "intake_open"
        | "intake_closed"
        | "agenda_ready"
        | "in_session"
        | "minutes_draft"
        | "minutes_locked"
        | "archived"
        | "cancelled"
      academic_council_member_role:
        | "chair"
        | "vice_chair"
        | "secretary"
        | "member"
        | "viewer"
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
      day_of_week:
        | "saturday"
        | "sunday"
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
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
      academic_council_decision_status: [
        "issued",
        "assigned",
        "in_progress",
        "partially_completed",
        "completed",
        "delayed",
        "cancelled",
      ],
      academic_council_meeting_status: [
        "scheduled",
        "intake_open",
        "intake_closed",
        "agenda_ready",
        "in_session",
        "minutes_draft",
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
      day_of_week: [
        "saturday",
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
      ],
      room_type: ["lecture", "lab", "office", "hall"],
      schedule_status: ["draft", "published", "cancelled"],
      schedule_type: ["lecture", "lab", "tutorial", "exam"],
    },
  },
} as const
