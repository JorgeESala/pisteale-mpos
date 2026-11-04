export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'admin' | 'operador' | 'consulta'

export type Profile = {
  id: string
  full_name: string
  role: UserRole
  can_view_financials: boolean
  can_adjust_inventory: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export type AppSetting = {
  key: string
  value: Json
  updated_at: string
  updated_by: string | null
}

export type AuditLog = {
  id: number
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Json | null
  new_data: Json | null
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id: string
          full_name?: string
          role?: UserRole
          can_view_financials?: boolean
          can_adjust_inventory?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          role?: UserRole
          can_view_financials?: boolean
          can_adjust_inventory?: boolean
          active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: AppSetting
        Insert: {
          key: string
          value: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: AuditLog
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      ping: {
        Args: Record<string, never>
        Returns: Json
      }
    }
    Enums: {
      user_role: UserRole
    }
    CompositeTypes: Record<string, never>
  }
}
