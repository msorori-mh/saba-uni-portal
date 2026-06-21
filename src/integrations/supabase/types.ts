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
          course_section_id: string
          created_at: string
          id: string
          reason_type: string
          request_id: string
          updated_at: string
        }
        Insert: {
          absence_date: string
          course_section_id: string
          created_at?: string
          id?: string
          reason_type?: string
          request_id: string
          updated_at?: string
        }
        Update: {
          absence_date?: string
          course_section_id?: string
          created_at?: string
          id?: string
          reason_type?: string
          request_id?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
          {
            foreignKeyName: "courses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["department_id"]
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
            foreignKeyName: "enrollment_reinstatement_deta_requested_from_academic_year_fkey"
            columns: ["requested_from_academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "enrollment_reinstatement_deta_requested_from_academic_year_fkey"
            columns: ["requested_from_academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "enrollment_reinstatement_detail_requested_from_semester_id_fkey"
            columns: ["requested_from_semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_reinstatement_detail_requested_from_semester_id_fkey"
            columns: ["requested_from_semester_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["semester_id"]
          },
          {
            foreignKeyName: "enrollment_reinstatement_detail_requested_from_semester_id_fkey"
            columns: ["requested_from_semester_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["semester_id"]
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
            foreignKeyName: "enrollment_suspension_details_requested_from_academic_year_fkey"
            columns: ["requested_from_academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "enrollment_suspension_details_requested_from_academic_year_fkey"
            columns: ["requested_from_academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "enrollment_suspension_details_requested_from_semester_id_fkey"
            columns: ["requested_from_semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_suspension_details_requested_from_semester_id_fkey"
            columns: ["requested_from_semester_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["semester_id"]
          },
          {
            foreignKeyName: "enrollment_suspension_details_requested_from_semester_id_fkey"
            columns: ["requested_from_semester_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["semester_id"]
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
          {
            foreignKeyName: "equivalency_courses_target_course_id_fkey"
            columns: ["target_course_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["course_id"]
          },
        ]
      }
      equivalency_request_details: {
        Row: {
          created_at: string
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
            foreignKeyName: "extra_chance_details_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "extra_chance_details_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["academic_year_id"]
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
          {
            foreignKeyName: "extra_chance_details_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["semester_id"]
          },
          {
            foreignKeyName: "extra_chance_details_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["semester_id"]
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
          {
            foreignKeyName: "faculty_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["program_id"]
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
            foreignKeyName: "faculty_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["department_id"]
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
          {
            foreignKeyName: "faculty_profiles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["program_id"]
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
            foreignKeyName: "grade_appeal_details_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "grade_appeal_details_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["academic_year_id"]
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
            foreignKeyName: "grade_appeal_details_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["semester_id"]
          },
          {
            foreignKeyName: "grade_appeal_details_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["semester_id"]
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
          {
            foreignKeyName: "grade_appeal_details_student_enrollment_id_fkey"
            columns: ["student_enrollment_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["enrollment_id"]
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
          pdf_url: string | null
          status: string
          student_profile_id: string
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
          pdf_url?: string | null
          status?: string
          student_profile_id: string
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
          pdf_url?: string | null
          status?: string
          student_profile_id?: string
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
            foreignKeyName: "official_documents_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "official_documents_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["student_profile_id"]
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
          {
            foreignKeyName: "payment_receipts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "payment_receipts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["student_profile_id"]
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
          {
            foreignKeyName: "programs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["department_id"]
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
      request_types: {
        Row: {
          code: string
          created_at: string
          description_ar: string | null
          id: string
          is_active: boolean
          name_ar: string
          requires_attachment: boolean
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
          requires_attachment?: boolean
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
          requires_attachment?: boolean
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
          {
            foreignKeyName: "research_papers_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["program_id"]
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
          {
            foreignKeyName: "semesters_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "semesters_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["academic_year_id"]
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
      staff_profiles: {
        Row: {
          created_at: string
          department_id: string | null
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
          {
            foreignKeyName: "staff_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["department_id"]
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
            foreignKeyName: "student_academic_status_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "student_academic_status_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "student_academic_status_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "academic_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_academic_status_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "student_academic_status_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "student_academic_status_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_academic_status_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["semester_id"]
          },
          {
            foreignKeyName: "student_academic_status_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["semester_id"]
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
          {
            foreignKeyName: "student_academic_status_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "student_academic_status_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["student_profile_id"]
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
            foreignKeyName: "student_discounts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "student_discounts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["academic_year_id"]
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
            foreignKeyName: "student_discounts_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["semester_id"]
          },
          {
            foreignKeyName: "student_discounts_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["semester_id"]
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
          {
            foreignKeyName: "student_discounts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "student_discounts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["student_profile_id"]
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
        Relationships: []
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
            foreignKeyName: "student_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "student_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["academic_year_id"]
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
            foreignKeyName: "student_fees_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["semester_id"]
          },
          {
            foreignKeyName: "student_fees_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["semester_id"]
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
          {
            foreignKeyName: "student_fees_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "student_fees_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["student_profile_id"]
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
          created_at: string
          department_id: string | null
          email: string | null
          full_name_ar: string
          full_name_en: string | null
          id: string
          must_change_password: boolean
          national_id: string | null
          phone: string | null
          program_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          academic_number: string
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name_ar: string
          full_name_en?: string | null
          id?: string
          must_change_password?: boolean
          national_id?: string | null
          phone?: string | null
          program_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          academic_number?: string
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name_ar?: string
          full_name_en?: string | null
          id?: string
          must_change_password?: boolean
          national_id?: string | null
          phone?: string | null
          program_id?: string | null
          status?: string
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
            foreignKeyName: "student_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "student_profiles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["program_id"]
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
      student_requests: {
        Row: {
          created_at: string
          description: string | null
          id: string
          rejection_reason: string | null
          request_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          student_profile_id: string
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          rejection_reason?: string | null
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_profile_id: string
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          rejection_reason?: string | null
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_profile_id?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
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
            foreignKeyName: "study_plan_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
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
            foreignKeyName: "study_plan_courses_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_transcript_summary"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "study_plan_courses_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["level_id"]
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
            foreignKeyName: "study_plan_courses_prerequisite_course_id_fkey"
            columns: ["prerequisite_course_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
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
          {
            foreignKeyName: "study_plans_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["program_id"]
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
          id: string
          notes: string | null
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
          id?: string
          notes?: string | null
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
          id?: string
          notes?: string | null
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
            foreignKeyName: "transfer_request_details_current_department_id_fkey"
            columns: ["current_department_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "transfer_request_details_current_program_id_fkey"
            columns: ["current_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_request_details_current_program_id_fkey"
            columns: ["current_program_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["program_id"]
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
            foreignKeyName: "transfer_request_details_requested_department_id_fkey"
            columns: ["requested_department_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "transfer_request_details_requested_program_id_fkey"
            columns: ["requested_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_request_details_requested_program_id_fkey"
            columns: ["requested_program_id"]
            isOneToOne: false
            referencedRelation: "student_unofficial_transcript"
            referencedColumns: ["program_id"]
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
      apply_student_discount: {
        Args: { _discount_id: string }
        Returns: undefined
      }
      audit_resolve_role: { Args: { _user_id: string }; Returns: string }
      can_manage_study_plan: {
        Args: { _study_plan_id: string; _user_id: string }
        Returns: boolean
      }
      can_send_internal_message: {
        Args: { _recipient: string; _sender: string }
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
      cleanup_rate_limit_attempts: { Args: never; Returns: number }
      complete_faculty_password_change: { Args: never; Returns: undefined }
      complete_staff_password_change: { Args: never; Returns: undefined }
      complete_student_password_change: { Args: never; Returns: undefined }
      count_admins: { Args: never; Returns: number }
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
      find_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      generate_document_number: { Args: never; Returns: string }
      generate_verification_code: { Args: never; Returns: string }
      get_admin_dashboard_kpis: { Args: never; Returns: Json }
      get_admin_progress_kpis: { Args: { _limit?: number }; Returns: Json }
      get_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_hardening_status: { Args: never; Returns: Json }
      has_any_role: {
        Args: { _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
      link_student_user_account: {
        Args: { _profile_id: string; _target_user_id: string }
        Returns: Json
      }
      log_audit:
        | {
            Args: {
              _action_type: string
              _entity_id: string
              _entity_type: string
              _new?: Json
              _notes?: string
              _old?: Json
            }
            Returns: undefined
          }
        | {
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
      recalc_student_fee_status: {
        Args: { _fee_id: string }
        Returns: undefined
      }
      replace_class_schedule_for_context: {
        Args: { _rows: Json; _section_ids: string[] }
        Returns: Json
      }
      revert_student_discount: {
        Args: { _discount_id: string }
        Returns: undefined
      }
      user_can_see_announcement: {
        Args: { _ann_id: string; _uid: string }
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
    }
    Enums: {
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
