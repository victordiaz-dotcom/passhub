export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
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
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
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
          company_id: string
          created_at: string
          created_by: string | null
          host_employee_id: string | null
          id: string
          reason: string | null
          status: Database["public"]["Enums"]["prereg_status"]
          used_at: string | null
          visit_date: string
          visit_time: string | null
          visitor_company: string | null
          visitor_name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          host_employee_id?: string | null
          id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["prereg_status"]
          used_at?: string | null
          visit_date: string
          visit_time?: string | null
          visitor_company?: string | null
          visitor_name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          host_employee_id?: string | null
          id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["prereg_status"]
          used_at?: string | null
          visit_date?: string
          visit_time?: string | null
          visitor_company?: string | null
          visitor_name?: string
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
      visits: {
        Row: {
          check_in_at: string
          check_out_at: string | null
          company_id: string
          created_at: string
          created_by: string
          folio: string | null
          host_employee_id: string | null
          id: string
          id_photo_path: string
          preregistration_id: string | null
          reason: string | null
          status: Database["public"]["Enums"]["visit_status"]
          visit_date: string
          visitor_company: string | null
          visitor_name: string
          visitor_photo_path: string
        }
        Insert: {
          check_in_at?: string
          check_out_at?: string | null
          company_id: string
          created_at?: string
          created_by: string
          folio?: string | null
          host_employee_id?: string | null
          id?: string
          id_photo_path: string
          preregistration_id?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          visit_date?: string
          visitor_company?: string | null
          visitor_name: string
          visitor_photo_path: string
        }
        Update: {
          check_in_at?: string
          check_out_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          folio?: string | null
          host_employee_id?: string | null
          id?: string
          id_photo_path?: string
          preregistration_id?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          visit_date?: string
          visitor_company?: string | null
          visitor_name?: string
          visitor_photo_path?: string
        }
        Relationships: [
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
      current_company_id: { Args: never; Returns: string }
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
      app_role: "admin" | "recepcion"
      prereg_status: "pendiente" | "usada" | "vencida" | "cancelada"
      visit_status: "dentro" | "fuera"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database["public"]

export type Tables<
  T extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][T]["Row"]

export type TablesInsert<
  T extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][T]["Insert"]

export type TablesUpdate<
  T extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][T]["Update"]

export type Enums<T extends keyof DefaultSchema["Enums"]> = DefaultSchema["Enums"][T]
