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
        ]
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
            foreignKeyName: "student_profiles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
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
      [_ in never]: never
    }
    Functions: {
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
