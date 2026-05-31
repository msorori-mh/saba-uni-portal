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
      class_schedule: {
        Row: {
          course_section_id: string
          created_at: string
          day_of_week: string
          end_time: string
          id: string
          room: string | null
          schedule_type: string
          start_time: string
          updated_at: string
        }
        Insert: {
          course_section_id: string
          created_at?: string
          day_of_week: string
          end_time: string
          id?: string
          room?: string | null
          schedule_type?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          course_section_id?: string
          created_at?: string
          day_of_week?: string
          end_time?: string
          id?: string
          room?: string | null
          schedule_type?: string
          start_time?: string
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
      faculty: {
        Row: {
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
          user_id: string
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
          user_id: string
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
          user_id?: string
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
      can_manage_study_plan: {
        Args: { _study_plan_id: string; _user_id: string }
        Returns: boolean
      }
      complete_faculty_password_change: { Args: never; Returns: undefined }
      complete_staff_password_change: { Args: never; Returns: undefined }
      complete_student_password_change: { Args: never; Returns: undefined }
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
      ],
    },
  },
} as const
