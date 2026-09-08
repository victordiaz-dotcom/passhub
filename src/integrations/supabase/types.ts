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
      analytics_chart_colors: {
        Row: {
          colors: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          colors?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          colors?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_chart_colors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      divisions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_rate_limits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          identifier: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          identifier?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          slack_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          slack_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          slack_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          must_change_password: boolean
          username: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          must_change_password?: boolean
          username: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          must_change_password?: boolean
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_preregistrations: {
        Row: {
          access_token: string
          company_id: string
          created_at: string
          created_by: string | null
          division: string | null
          extended_until: string | null
          has_vehicle: boolean | null
          host_employee_id: string | null
          id: string
          reason: string | null
          status: Database["public"]["Enums"]["prereg_status"]
          used_at: string | null
          vehicle_color: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
          visit_date: string
          visit_time: string | null
          visit_type: string | null
          visitor_company: string | null
          visitor_email: string | null
          visitor_name: string
          visitor_phone: string | null
        }
        Insert: {
          access_token?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          division?: string | null
          extended_until?: string | null
          has_vehicle?: boolean | null
          host_employee_id?: string | null
          id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["prereg_status"]
          used_at?: string | null
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          visit_date: string
          visit_time?: string | null
          visit_type?: string | null
          visitor_company?: string | null
          visitor_email?: string | null
          visitor_name: string
          visitor_phone?: string | null
        }
        Update: {
          access_token?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          division?: string | null
          extended_until?: string | null
          has_vehicle?: boolean | null
          host_employee_id?: string | null
          id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["prereg_status"]
          used_at?: string | null
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          visit_date?: string
          visit_time?: string | null
          visit_type?: string | null
          visitor_company?: string | null
          visitor_email?: string | null
          visitor_name?: string
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_preregistrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_preregistrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_preregistrations_host_employee_id_fkey"
            columns: ["host_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          check_in_at: string
          check_out_at: string | null
          checked_out_by: string | null
          checked_out_by_name: string | null
          company_id: string
          created_at: string
          created_by: string
          created_by_name: string | null
          division: string | null
          folio: string | null
          has_vehicle: boolean | null
          host_employee_id: string | null
          id: string
          id_photo_path: string
          preregistration_id: string | null
          reason: string | null
          status: Database["public"]["Enums"]["visit_status"]
          vehicle_color: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
          visit_date: string
          visit_type: string | null
          visitor_company: string | null
          visitor_email: string | null
          visitor_name: string
          visitor_phone: string | null
          visitor_photo_path: string
        }
        Insert: {
          check_in_at?: string
          check_out_at?: string | null
          checked_out_by?: string | null
          checked_out_by_name?: string | null
          company_id: string
          created_at?: string
          created_by: string
          created_by_name?: string | null
          division?: string | null
          folio?: string | null
          has_vehicle?: boolean | null
          host_employee_id?: string | null
          id?: string
          id_photo_path: string
          preregistration_id?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          visit_date?: string
          visit_type?: string | null
          visitor_company?: string | null
          visitor_email?: string | null
          visitor_name: string
          visitor_phone?: string | null
          visitor_photo_path: string
        }
        Update: {
          check_in_at?: string
          check_out_at?: string | null
          checked_out_by?: string | null
          checked_out_by_name?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          division?: string | null
          folio?: string | null
          has_vehicle?: boolean | null
          host_employee_id?: string | null
          id?: string
          id_photo_path?: string
          preregistration_id?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          visit_date?: string
          visit_type?: string | null
          visitor_company?: string | null
          visitor_email?: string | null
          visitor_name?: string
          visitor_phone?: string | null
          visitor_photo_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_host_employee_id_fkey"
            columns: ["host_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_preregistration_id_fkey"
            columns: ["preregistration_id"]
            isOneToOne: false
            referencedRelation: "visit_preregistrations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      analytics_prereg_status_breakdown: {
        Args: { p_end: string; p_start: string }
        Returns: {
          status: string
          status_count: number
        }[]
      }
      analytics_top_hosts: {
        Args: { p_end: string; p_limit?: number; p_start: string }
        Returns: {
          employee_id: string
          full_name: string
          visits_count: number
        }[]
      }
      analytics_top_visitor_companies: {
        Args: { p_end: string; p_limit?: number; p_start: string }
        Returns: {
          visitor_company: string
          visits_count: number
        }[]
      }
      analytics_visits_by_hour: {
        Args: { p_end: string; p_start: string }
        Returns: {
          hour_of_day: number
          visits_count: number
        }[]
      }
      analytics_visits_by_month: {
        Args: { p_end: string; p_start: string }
        Returns: {
          month_start: string
          visits_count: number
        }[]
      }
      analytics_visits_by_weekday: {
        Args: { p_end: string; p_start: string }
        Returns: {
          visits_count: number
          weekday: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: {
          _action: string
          _detail: Json
          _entity: string
          _entity_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "recepcion" | "superadmin" | "guardia"
      prereg_status: "pendiente" | "usada" | "vencida" | "cancelada"
      visit_status: "dentro" | "fuera"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "recepcion", "superadmin", "guardia"],
      prereg_status: ["pendiente", "usada", "vencida", "cancelada"],
      visit_status: ["dentro", "fuera"],
    },
  },
} as const
