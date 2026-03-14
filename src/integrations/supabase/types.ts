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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_permissions: {
        Row: {
          action: string
          company_id: string
          created_at: string
          granted: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          granted?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          granted?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          user_id: string
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reactions: {
        Row: {
          announcement_id: string
          created_at: string
          emoji: string
          employee_id: string
          id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          emoji?: string
          employee_id: string
          id?: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          emoji?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reactions_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          company_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          link_label: string | null
          link_url: string | null
          media_urls: Json | null
          pinned: boolean
          priority: string
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          company_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          link_label?: string | null
          link_url?: string | null
          media_urls?: Json | null
          pinned?: boolean
          priority?: string
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          link_label?: string | null
          link_url?: string | null
          media_urls?: Json | null
          pinned?: boolean
          priority?: string
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_rate_limits: {
        Row: {
          created_at: string
          failed_attempts: number
          id: string
          last_attempt_at: string | null
          locked_until: string | null
          phone_number: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          id?: string
          last_attempt_at?: string | null
          locked_until?: string | null
          phone_number: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          id?: string
          last_attempt_at?: string | null
          locked_until?: string | null
          phone_number?: string
        }
        Relationships: []
      }
      automation_log: {
        Row: {
          company_id: string
          details: Json | null
          id: string
          rule_key: string
          status: string
          triggered_at: string
        }
        Insert: {
          company_id: string
          details?: Json | null
          id?: string
          rule_key: string
          status?: string
          triggered_at?: string
        }
        Update: {
          company_id?: string
          details?: Json | null
          id?: string
          rule_key?: string
          status?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          company_id: string
          config: Json
          enabled: boolean
          id: string
          rule_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          config?: Json
          enabled?: boolean
          id?: string
          rule_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          config?: Json
          enabled?: boolean
          id?: string
          rule_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          company_id: string
          created_at: string
          id: string
          payload_json: Json
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          payload_json?: Json
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          payload_json?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          company_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_alerts: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          employee_id: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          shift_id: string | null
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          employee_id: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          shift_id?: string | null
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          employee_id?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          shift_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_alerts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_events: {
        Row: {
          accuracy: number | null
          address: string | null
          company_id: string
          created_at: string
          device: string | null
          employee_id: string
          id: string
          latitude: number | null
          longitude: number | null
          shift_id: string | null
          time_entry_id: string | null
          type: string
        }
        Insert: {
          accuracy?: number | null
          address?: string | null
          company_id: string
          created_at?: string
          device?: string | null
          employee_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          shift_id?: string | null
          time_entry_id?: string | null
          type: string
        }
        Update: {
          accuracy?: number | null
          address?: string | null
          company_id?: string
          created_at?: string
          device?: string | null
          employee_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          shift_id?: string | null
          time_entry_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          company_code: number | null
          created_at: string
          id: string
          invite_code: string
          is_active: boolean
          is_sandbox: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          company_code?: number | null
          created_at?: string
          id?: string
          invite_code: string
          is_active?: boolean
          is_sandbox?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          company_code?: number | null
          created_at?: string
          id?: string
          invite_code?: string
          is_active?: boolean
          is_sandbox?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_modules: {
        Row: {
          activated_at: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          module: string
        }
        Insert: {
          activated_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          module: string
        }
        Update: {
          activated_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          module?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_id: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          company_id: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          company_id?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_employee_rates: {
        Row: {
          concept_id: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          employee_id: string
          id: string
          rate: number
        }
        Insert: {
          concept_id: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          employee_id: string
          id?: string
          rate: number
        }
        Update: {
          concept_id?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          employee_id?: string
          id?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "concept_employee_rates_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_employee_rates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_employee_rates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          calc_mode: Database["public"]["Enums"]["calc_mode"]
          category: Database["public"]["Enums"]["concept_category"]
          company_id: string
          created_at: string
          default_rate: number | null
          id: string
          is_active: boolean
          name: string
          rate_source: Database["public"]["Enums"]["rate_source"]
          unit_label: string | null
        }
        Insert: {
          calc_mode?: Database["public"]["Enums"]["calc_mode"]
          category: Database["public"]["Enums"]["concept_category"]
          company_id?: string
          created_at?: string
          default_rate?: number | null
          id?: string
          is_active?: boolean
          name: string
          rate_source?: Database["public"]["Enums"]["rate_source"]
          unit_label?: string | null
        }
        Update: {
          calc_mode?: Database["public"]["Enums"]["calc_mode"]
          category?: Database["public"]["Enums"]["concept_category"]
          company_id?: string
          created_at?: string
          default_rate?: number | null
          id?: string
          is_active?: boolean
          name?: string
          rate_source?: Database["public"]["Enums"]["rate_source"]
          unit_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concepts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_w9: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          business_name: string | null
          city: string | null
          company_id: string
          created_at: string
          employee_id: string
          id: string
          legal_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          signed_at: string | null
          signed_by: string | null
          state: string | null
          status: string
          submitted_at: string | null
          tax_classification: string
          tin_encrypted: string | null
          tin_last4: string | null
          updated_at: string
          w9_file_url: string | null
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          business_name?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          legal_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          signed_at?: string | null
          signed_by?: string | null
          state?: string | null
          status?: string
          submitted_at?: string | null
          tax_classification?: string
          tin_encrypted?: string | null
          tin_last4?: string | null
          updated_at?: string
          w9_file_url?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          business_name?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          legal_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          signed_at?: string | null
          signed_by?: string | null
          state?: string | null
          status?: string
          submitted_at?: string | null
          tax_classification?: string
          tin_encrypted?: string | null
          tin_last4?: string | null
          updated_at?: string
          w9_file_url?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_w9_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_w9_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_w9_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_requests: {
        Row: {
          completed_at: string | null
          created_at: string | null
          download_url: string | null
          expires_at: string | null
          id: string
          notes: string | null
          request_type: string
          requested_at: string | null
          status: string
          user_id: string
          worker_profile_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          download_url?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          request_type?: string
          requested_at?: string | null
          status?: string
          user_id: string
          worker_profile_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          download_url?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          request_type?: string
          requested_at?: string | null
          status?: string
          user_id?: string
          worker_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_export_requests_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          company: string
          created_at: string
          email: string | null
          employee_count: string | null
          id: string
          name: string
          phone: string | null
          source: string | null
        }
        Insert: {
          company: string
          created_at?: string
          email?: string | null
          employee_count?: string | null
          id?: string
          name: string
          phone?: string | null
          source?: string | null
        }
        Update: {
          company?: string
          created_at?: string
          email?: string | null
          employee_count?: string | null
          id?: string
          name?: string
          phone?: string | null
          source?: string | null
        }
        Relationships: []
      }
      employee_availability_config: {
        Row: {
          blocked_weekdays: number[]
          company_id: string
          created_at: string
          default_available: boolean
          employee_id: string
          id: string
          updated_at: string
        }
        Insert: {
          blocked_weekdays?: number[]
          company_id: string
          created_at?: string
          default_available?: boolean
          employee_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          blocked_weekdays?: number[]
          company_id?: string
          created_at?: string
          default_available?: boolean
          employee_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_availability_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_availability_config_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_availability_config_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_availability_overrides: {
        Row: {
          company_id: string
          created_at: string
          date: string
          employee_id: string
          id: string
          is_available: boolean
          reason: string | null
          set_by: string | null
          source: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          employee_id: string
          id?: string
          is_available?: boolean
          reason?: string | null
          set_by?: string | null
          source?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          is_available?: boolean
          reason?: string | null
          set_by?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_availability_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_availability_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_availability_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_badges: {
        Row: {
          badge_emoji: string
          badge_key: string
          badge_label: string
          company_id: string
          earned_at: string
          employee_id: string
          id: string
        }
        Insert: {
          badge_emoji?: string
          badge_key: string
          badge_label: string
          company_id: string
          earned_at?: string
          employee_id: string
          id?: string
        }
        Update: {
          badge_emoji?: string
          badge_key?: string
          badge_label?: string
          company_id?: string
          earned_at?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_badges_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_badges_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          category: string
          company_id: string
          created_at: string
          employee_id: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          employee_id: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          employee_id?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_location_history: {
        Row: {
          accuracy: number | null
          company_id: string
          employee_id: string
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          shift_id: string | null
        }
        Insert: {
          accuracy?: number | null
          company_id: string
          employee_id: string
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          shift_id?: string | null
        }
        Update: {
          accuracy?: number | null
          company_id?: string
          employee_id?: string
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          shift_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_location_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_location_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_location_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_location_history_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_portal_modules: {
        Row: {
          company_id: string
          employee_id: string
          enabled: boolean
          id: string
          module: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          employee_id: string
          enabled?: boolean
          id?: string
          module: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          employee_id?: string
          enabled?: boolean
          id?: string
          module?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_portal_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_portal_modules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_portal_modules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_tickets: {
        Row: {
          assigned_to: string | null
          company_id: string
          created_at: string
          description: string | null
          employee_id: string
          id: string
          priority: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
          source_entity_id: string | null
          source_entity_type: string | null
          status: string
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          employee_id: string
          id?: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          subject: string
          type?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          employee_id?: string
          id?: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tickets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tickets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          access_pin: string | null
          added_by: string | null
          added_via: string | null
          address: string | null
          approx_latitude: number | null
          approx_longitude: number | null
          available_for_work: boolean
          avatar_url: string | null
          birthday: string | null
          certifications: string[] | null
          company_id: string
          connecteam_employee_id: string | null
          country_code: string | null
          county: string | null
          created_at: string
          date_added: string | null
          direct_manager: string | null
          driver_licence: string | null
          email: string | null
          employee_role: string | null
          end_date: string | null
          english_level: string | null
          first_name: string
          gender: string | null
          groups: string | null
          has_car: string | null
          id: string
          is_active: boolean
          last_login: string | null
          last_name: string
          passport_public: boolean
          phone_number: string | null
          professional_summary: string | null
          qualify: string | null
          recommended_by: string | null
          service_category_ids: string[] | null
          skills: string[] | null
          start_date: string | null
          tags: string | null
          updated_at: string
          user_id: string | null
          years_experience: number | null
        }
        Insert: {
          access_pin?: string | null
          added_by?: string | null
          added_via?: string | null
          address?: string | null
          approx_latitude?: number | null
          approx_longitude?: number | null
          available_for_work?: boolean
          avatar_url?: string | null
          birthday?: string | null
          certifications?: string[] | null
          company_id?: string
          connecteam_employee_id?: string | null
          country_code?: string | null
          county?: string | null
          created_at?: string
          date_added?: string | null
          direct_manager?: string | null
          driver_licence?: string | null
          email?: string | null
          employee_role?: string | null
          end_date?: string | null
          english_level?: string | null
          first_name: string
          gender?: string | null
          groups?: string | null
          has_car?: string | null
          id?: string
          is_active?: boolean
          last_login?: string | null
          last_name: string
          passport_public?: boolean
          phone_number?: string | null
          professional_summary?: string | null
          qualify?: string | null
          recommended_by?: string | null
          service_category_ids?: string[] | null
          skills?: string[] | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string
          user_id?: string | null
          years_experience?: number | null
        }
        Update: {
          access_pin?: string | null
          added_by?: string | null
          added_via?: string | null
          address?: string | null
          approx_latitude?: number | null
          approx_longitude?: number | null
          available_for_work?: boolean
          avatar_url?: string | null
          birthday?: string | null
          certifications?: string[] | null
          company_id?: string
          connecteam_employee_id?: string | null
          country_code?: string | null
          county?: string | null
          created_at?: string
          date_added?: string | null
          direct_manager?: string | null
          driver_licence?: string | null
          email?: string | null
          employee_role?: string | null
          end_date?: string | null
          english_level?: string | null
          first_name?: string
          gender?: string | null
          groups?: string | null
          has_car?: string | null
          id?: string
          is_active?: boolean
          last_login?: string | null
          last_name?: string
          passport_public?: boolean
          phone_number?: string | null
          professional_summary?: string | null
          qualify?: string | null
          recommended_by?: string | null
          service_category_ids?: string[] | null
          skills?: string[] | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string
          user_id?: string | null
          years_experience?: number | null
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
      implementation_log: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          notes: string | null
          priority: string | null
          prompt_ref: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          prompt_ref?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          prompt_ref?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          batch_type: string
          company_id: string
          created_at: string
          created_by: string
          date_range_from: string | null
          date_range_to: string | null
          errors: Json | null
          id: string
          payroll_duplicates_skipped: number | null
          payroll_file_name: string | null
          payroll_movements_created: number | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          schedule_assignments_created: number | null
          schedule_clients_created: number | null
          schedule_duplicates_skipped: number | null
          schedule_employees_created: number | null
          schedule_file_name: string | null
          schedule_payrides: number | null
          schedule_shifts_created: number | null
          schedule_unavailable: number | null
          schedule_weekend_jobs: number | null
          source: string
          status: string
          timeclock_entries_created: number | null
          timeclock_file_name: string | null
          timeclock_linked_shifts: number | null
          timeclock_overlaps_skipped: number | null
          timeclock_unpaid_skipped: number | null
          unmatched_employees: Json | null
          warnings: Json | null
        }
        Insert: {
          batch_type?: string
          company_id: string
          created_at?: string
          created_by: string
          date_range_from?: string | null
          date_range_to?: string | null
          errors?: Json | null
          id?: string
          payroll_duplicates_skipped?: number | null
          payroll_file_name?: string | null
          payroll_movements_created?: number | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          schedule_assignments_created?: number | null
          schedule_clients_created?: number | null
          schedule_duplicates_skipped?: number | null
          schedule_employees_created?: number | null
          schedule_file_name?: string | null
          schedule_payrides?: number | null
          schedule_shifts_created?: number | null
          schedule_unavailable?: number | null
          schedule_weekend_jobs?: number | null
          source?: string
          status?: string
          timeclock_entries_created?: number | null
          timeclock_file_name?: string | null
          timeclock_linked_shifts?: number | null
          timeclock_overlaps_skipped?: number | null
          timeclock_unpaid_skipped?: number | null
          unmatched_employees?: Json | null
          warnings?: Json | null
        }
        Update: {
          batch_type?: string
          company_id?: string
          created_at?: string
          created_by?: string
          date_range_from?: string | null
          date_range_to?: string | null
          errors?: Json | null
          id?: string
          payroll_duplicates_skipped?: number | null
          payroll_file_name?: string | null
          payroll_movements_created?: number | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          schedule_assignments_created?: number | null
          schedule_clients_created?: number | null
          schedule_duplicates_skipped?: number | null
          schedule_employees_created?: number | null
          schedule_file_name?: string | null
          schedule_payrides?: number | null
          schedule_shifts_created?: number | null
          schedule_unavailable?: number | null
          schedule_weekend_jobs?: number | null
          source?: string
          status?: string
          timeclock_entries_created?: number | null
          timeclock_file_name?: string | null
          timeclock_linked_shifts?: number | null
          timeclock_overlaps_skipped?: number | null
          timeclock_unpaid_skipped?: number | null
          unmatched_employees?: Json | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          import_id: string
          matched: boolean | null
          raw_data: Json
          row_number: number
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          import_id: string
          matched?: boolean | null
          raw_data: Json
          row_number: number
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          import_id?: string
          matched?: boolean | null
          raw_data?: Json
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          column_mapping: Json | null
          company_id: string
          created_at: string
          error_message: string | null
          file_name: string
          id: string
          imported_by: string | null
          period_id: string
          row_count: number | null
          status: string
        }
        Insert: {
          column_mapping?: Json | null
          company_id?: string
          created_at?: string
          error_message?: string | null
          file_name: string
          id?: string
          imported_by?: string | null
          period_id: string
          row_count?: number | null
          status?: string
        }
        Update: {
          column_mapping?: Json | null
          company_id?: string
          created_at?: string
          error_message?: string | null
          file_name?: string
          id?: string
          imported_by?: string | null
          period_id?: string
          row_count?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_messages: {
        Row: {
          company_id: string
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          company_id: string
          content: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          company_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          category_id: string | null
          company_id: string
          created_at: string
          description: string
          employee_id: string | null
          id: string
          invoice_id: string
          quantity: number
          shift_id: string | null
          sort_order: number
          total: number
          unit_price: number
        }
        Insert: {
          category_id?: string | null
          company_id: string
          created_at?: string
          description: string
          employee_id?: string | null
          id?: string
          invoice_id: string
          quantity?: number
          shift_id?: string | null
          sort_order?: number
          total?: number
          unit_price?: number
        }
        Update: {
          category_id?: string | null
          company_id?: string
          created_at?: string
          description?: string
          employee_id?: string | null
          id?: string
          invoice_id?: string
          quantity?: number
          shift_id?: string | null
          sort_order?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          billing_address: string | null
          client_id: string
          company_id: string
          created_at: string
          created_by: string | null
          discount_amount: number | null
          due_date: string | null
          external_notes: string | null
          grand_total: number
          id: string
          internal_notes: string | null
          invoice_number: string
          issue_date: string
          paid_at: string | null
          request_id: string | null
          sent_at: string | null
          service_period_end: string | null
          service_period_start: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number | null
          tax_rate: number | null
          updated_at: string
          viewed_at: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          billing_address?: string | null
          client_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          due_date?: string | null
          external_notes?: string | null
          grand_total?: number
          id?: string
          internal_notes?: string | null
          invoice_number: string
          issue_date?: string
          paid_at?: string | null
          request_id?: string | null
          sent_at?: string | null
          service_period_end?: string | null
          service_period_start?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          billing_address?: string | null
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          due_date?: string | null
          external_notes?: string | null
          grand_total?: number
          id?: string
          internal_notes?: string | null
          invoice_number?: string
          issue_date?: string
          paid_at?: string | null
          request_id?: string | null
          sent_at?: string | null
          service_period_end?: string | null
          service_period_start?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "staffing_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          client_id: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          geofence_lat: number | null
          geofence_lng: number | null
          geofence_radius: number | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "internal_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      module_permissions: {
        Row: {
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      movements: {
        Row: {
          approval_note: string | null
          approval_status: string
          approved_by: string | null
          company_id: string
          concept_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          note: string | null
          period_id: string
          quantity: number | null
          rate: number | null
          total_value: number
          updated_at: string
        }
        Insert: {
          approval_note?: string | null
          approval_status?: string
          approved_by?: string | null
          company_id?: string
          concept_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          note?: string | null
          period_id: string
          quantity?: number | null
          rate?: number | null
          total_value?: number
          updated_at?: string
        }
        Update: {
          approval_note?: string | null
          approval_status?: string
          approved_by?: string | null
          company_id?: string
          concept_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          note?: string | null
          period_id?: string
          quantity?: number | null
          rate?: number | null
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          created_at: string
          enabled: boolean
          id: string
          notification_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          subject: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          body?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          subject?: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          subject?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json | null
          read_at: string | null
          recipient_id: string
          recipient_type: string
          title: string
          type: string
        }
        Insert: {
          body?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          read_at?: string | null
          recipient_id: string
          recipient_type?: string
          title: string
          type?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          read_at?: string | null
          recipient_id?: string
          recipient_type?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      passport_metrics: {
        Row: {
          created_at: string | null
          id: string
          metric_code: string
          metric_display_order: number | null
          metric_label: string
          metric_value: string
          passport_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metric_code: string
          metric_display_order?: number | null
          metric_label: string
          metric_value: string
          passport_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metric_code?: string
          metric_display_order?: number | null
          metric_label?: string
          metric_value?: string
          passport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passport_metrics_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: false
            referencedRelation: "passport_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passport_profiles: {
        Row: {
          display_name: string
          english_level:
            | Database["public"]["Enums"]["english_level_enum"]
            | null
          generated_at: string | null
          id: string
          overall_reputation_score: number | null
          passport_slug: string
          passport_visibility:
            | Database["public"]["Enums"]["profile_visibility"]
            | null
          primary_role: string | null
          summary_text: string | null
          total_companies_worked: number | null
          total_marketplace_jobs: number | null
          total_verified_hours: number | null
          total_verified_jobs: number | null
          updated_at: string | null
          worker_profile_id: string
        }
        Insert: {
          display_name: string
          english_level?:
            | Database["public"]["Enums"]["english_level_enum"]
            | null
          generated_at?: string | null
          id?: string
          overall_reputation_score?: number | null
          passport_slug: string
          passport_visibility?:
            | Database["public"]["Enums"]["profile_visibility"]
            | null
          primary_role?: string | null
          summary_text?: string | null
          total_companies_worked?: number | null
          total_marketplace_jobs?: number | null
          total_verified_hours?: number | null
          total_verified_jobs?: number | null
          updated_at?: string | null
          worker_profile_id: string
        }
        Update: {
          display_name?: string
          english_level?:
            | Database["public"]["Enums"]["english_level_enum"]
            | null
          generated_at?: string | null
          id?: string
          overall_reputation_score?: number | null
          passport_slug?: string
          passport_visibility?:
            | Database["public"]["Enums"]["profile_visibility"]
            | null
          primary_role?: string | null
          summary_text?: string | null
          total_companies_worked?: number | null
          total_marketplace_jobs?: number | null
          total_verified_hours?: number | null
          total_verified_jobs?: number | null
          updated_at?: string | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passport_profiles_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: true
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passport_publications: {
        Row: {
          created_at: string | null
          id: string
          passport_id: string
          publish_city: boolean | null
          publish_companies_count: boolean | null
          publish_hours: boolean | null
          publish_languages: boolean | null
          publish_photo: boolean | null
          publish_reputation: boolean | null
          publish_skills: boolean | null
          publish_work_history: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          passport_id: string
          publish_city?: boolean | null
          publish_companies_count?: boolean | null
          publish_hours?: boolean | null
          publish_languages?: boolean | null
          publish_photo?: boolean | null
          publish_reputation?: boolean | null
          publish_skills?: boolean | null
          publish_work_history?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          passport_id?: string
          publish_city?: boolean | null
          publish_companies_count?: boolean | null
          publish_hours?: boolean | null
          publish_languages?: boolean | null
          publish_photo?: boolean | null
          publish_reputation?: boolean | null
          publish_skills?: boolean | null
          publish_work_history?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passport_publications_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: true
            referencedRelation: "passport_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passport_work_history: {
        Row: {
          company_name: string
          created_at: string | null
          date_end: string | null
          date_start: string | null
          id: string
          is_verified: boolean | null
          passport_id: string
          role_name: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["passport_source"]
          total_hours: number | null
        }
        Insert: {
          company_name: string
          created_at?: string | null
          date_end?: string | null
          date_start?: string | null
          id?: string
          is_verified?: boolean | null
          passport_id: string
          role_name?: string | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["passport_source"]
          total_hours?: number | null
        }
        Update: {
          company_name?: string
          created_at?: string | null
          date_end?: string | null
          date_start?: string | null
          id?: string
          is_verified?: boolean | null
          passport_id?: string
          role_name?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["passport_source"]
          total_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "passport_work_history_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: false
            referencedRelation: "passport_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_periods: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          end_date: string
          id: string
          paid_at: string | null
          paid_by: string | null
          published_at: string | null
          start_date: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          end_date: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          published_at?: string | null
          start_date: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          published_at?: string | null
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_adjustments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          notes: string | null
          period_id: string | null
          shift_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          period_id?: string | null
          shift_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          period_id?: string | null
          shift_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      period_base_pay: {
        Row: {
          base_total_pay: number
          company_id: string
          created_at: string
          employee_id: string
          id: string
          import_id: string | null
          period_id: string
          total_overtime: number | null
          total_paid_hours: number | null
          total_regular: number | null
          total_work_hours: number | null
          weekly_total_hours: number | null
        }
        Insert: {
          base_total_pay?: number
          company_id?: string
          created_at?: string
          employee_id: string
          id?: string
          import_id?: string | null
          period_id: string
          total_overtime?: number | null
          total_paid_hours?: number | null
          total_regular?: number | null
          total_work_hours?: number | null
          weekly_total_hours?: number | null
        }
        Update: {
          base_total_pay?: number
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          import_id?: string | null
          period_id?: string
          total_overtime?: number | null
          total_paid_hours?: number | null
          total_regular?: number | null
          total_work_hours?: number | null
          weekly_total_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "period_base_pay_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_base_pay_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_base_pay_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_base_pay_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_base_pay_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profile_access_log: {
        Row: {
          access_type: string
          accessed_by: string | null
          company_id: string | null
          created_at: string | null
          id: string
          ip_address: string | null
          worker_profile_id: string
        }
        Insert: {
          access_type?: string
          accessed_by?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          worker_profile_id: string
        }
        Update: {
          access_type?: string
          accessed_by?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_access_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_access_log_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_verification_log: {
        Row: {
          created_at: string | null
          evidence_url: string | null
          expires_at: string | null
          field_name: string
          id: string
          notes: string | null
          verification_method: Database["public"]["Enums"]["verification_method"]
          verified_at: string | null
          verified_by: string | null
          worker_profile_id: string
        }
        Insert: {
          created_at?: string | null
          evidence_url?: string | null
          expires_at?: string | null
          field_name: string
          id?: string
          notes?: string | null
          verification_method?: Database["public"]["Enums"]["verification_method"]
          verified_at?: string | null
          verified_by?: string | null
          worker_profile_id: string
        }
        Update: {
          created_at?: string | null
          evidence_url?: string | null
          expires_at?: string | null
          field_name?: string
          id?: string
          notes?: string | null
          verification_method?: Database["public"]["Enums"]["verification_method"]
          verified_at?: string | null
          verified_by?: string | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_verification_log_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone_login_enabled: boolean | null
          phone_number: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone_login_enabled?: boolean | null
          phone_number?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone_login_enabled?: boolean | null
          phone_number?: string | null
          user_id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          modules: string[]
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          modules?: string[]
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          modules?: string[]
          uses_count?: number
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          company_id: string
          id: string
          promo_code_id: string
          redeemed_at: string
          redeemed_by: string | null
        }
        Insert: {
          company_id: string
          id?: string
          promo_code_id: string
          redeemed_at?: string
          redeemed_by?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          promo_code_id?: string
          redeemed_at?: string
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      read_receipts: {
        Row: {
          conversation_id: string
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "read_receipts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_badges: {
        Row: {
          badge_code: string
          badge_name: string
          created_at: string | null
          description: string | null
          emoji: string | null
          id: string
          is_active: boolean | null
        }
        Insert: {
          badge_code: string
          badge_name: string
          created_at?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean | null
        }
        Update: {
          badge_code?: string
          badge_name?: string
          created_at?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      rep_events: {
        Row: {
          created_at: string | null
          event_score: number | null
          event_weight: number | null
          id: string
          notes: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["reputation_source"]
          worker_profile_id: string
        }
        Insert: {
          created_at?: string | null
          event_score?: number | null
          event_weight?: number | null
          id?: string
          notes?: string | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["reputation_source"]
          worker_profile_id: string
        }
        Update: {
          created_at?: string | null
          event_score?: number | null
          event_weight?: number | null
          id?: string
          notes?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["reputation_source"]
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_events_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_scores: {
        Row: {
          attendance_score: number | null
          cancellation_count: number | null
          communication_score: number | null
          created_at: string | null
          id: string
          last_calculated_at: string | null
          no_show_count: number | null
          overall_score: number | null
          presentation_score: number | null
          punctuality_score: number | null
          quality_score: number | null
          reliability_score: number | null
          score_version: number | null
          service_score: number | null
          total_completed_jobs: number | null
          total_completed_shifts: number | null
          total_hours_worked: number | null
          total_reviews_count: number | null
          updated_at: string | null
          worker_profile_id: string
        }
        Insert: {
          attendance_score?: number | null
          cancellation_count?: number | null
          communication_score?: number | null
          created_at?: string | null
          id?: string
          last_calculated_at?: string | null
          no_show_count?: number | null
          overall_score?: number | null
          presentation_score?: number | null
          punctuality_score?: number | null
          quality_score?: number | null
          reliability_score?: number | null
          score_version?: number | null
          service_score?: number | null
          total_completed_jobs?: number | null
          total_completed_shifts?: number | null
          total_hours_worked?: number | null
          total_reviews_count?: number | null
          updated_at?: string | null
          worker_profile_id: string
        }
        Update: {
          attendance_score?: number | null
          cancellation_count?: number | null
          communication_score?: number | null
          created_at?: string | null
          id?: string
          last_calculated_at?: string | null
          no_show_count?: number | null
          overall_score?: number | null
          presentation_score?: number | null
          punctuality_score?: number | null
          quality_score?: number | null
          reliability_score?: number | null
          score_version?: number | null
          service_score?: number | null
          total_completed_jobs?: number | null
          total_completed_shifts?: number | null
          total_hours_worked?: number | null
          total_reviews_count?: number | null
          updated_at?: string | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_scores_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: true
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_worker_badges: {
        Row: {
          created_at: string | null
          expires_at: string | null
          granted_at: string | null
          id: string
          reputation_badge_id: string
          worker_profile_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          granted_at?: string | null
          id?: string
          reputation_badge_id: string
          worker_profile_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          granted_at?: string | null
          id?: string
          reputation_badge_id?: string
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_worker_badges_reputation_badge_id_fkey"
            columns: ["reputation_badge_id"]
            isOneToOne: false
            referencedRelation: "rep_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_worker_badges_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_candidates: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          proposed_by: string | null
          rejected_at: string | null
          rejection_reason: string | null
          request_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          proposed_by?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          request_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          proposed_by?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          request_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_candidates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_candidates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_candidates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "staffing_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      role_templates: {
        Row: {
          actions: string[]
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          actions?: string[]
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          actions?: string[]
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          company_id: string
          created_at: string
          filters: Json | null
          id: string
          report_data: Json | null
          report_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          filters?: Json | null
          id?: string
          report_data?: Json | null
          report_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          filters?: Json | null
          id?: string
          report_data?: Json | null
          report_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_shifts: {
        Row: {
          car_capacity: number
          category_id: string | null
          claimable: boolean
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          date: string
          day_type: string
          deleted_at: string | null
          driver_employee_id: string | null
          end_time: string
          id: string
          location_id: string | null
          meeting_point: string | null
          notes: string | null
          pay_type: string
          reconciliation_hash: string | null
          shift_admin_id: string | null
          shift_code: string | null
          slots: number | null
          special_instructions: string | null
          start_time: string
          status: string
          title: string
          transportation_notes: string | null
          transportation_required: boolean
          updated_at: string
        }
        Insert: {
          car_capacity?: number
          category_id?: string | null
          claimable?: boolean
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          date: string
          day_type?: string
          deleted_at?: string | null
          driver_employee_id?: string | null
          end_time: string
          id?: string
          location_id?: string | null
          meeting_point?: string | null
          notes?: string | null
          pay_type?: string
          reconciliation_hash?: string | null
          shift_admin_id?: string | null
          shift_code?: string | null
          slots?: number | null
          special_instructions?: string | null
          start_time: string
          status?: string
          title: string
          transportation_notes?: string | null
          transportation_required?: boolean
          updated_at?: string
        }
        Update: {
          car_capacity?: number
          category_id?: string | null
          claimable?: boolean
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          day_type?: string
          deleted_at?: string | null
          driver_employee_id?: string | null
          end_time?: string
          id?: string
          location_id?: string | null
          meeting_point?: string | null
          notes?: string | null
          pay_type?: string
          reconciliation_hash?: string | null
          shift_admin_id?: string | null
          shift_code?: string | null
          slots?: number | null
          special_instructions?: string | null
          start_time?: string
          status?: string
          title?: string
          transportation_notes?: string | null
          transportation_required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_shifts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_driver_employee_id_fkey"
            columns: ["driver_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_driver_employee_id_fkey"
            columns: ["driver_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_shift_admin_id_fkey"
            columns: ["shift_admin_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_shift_admin_id_fkey"
            columns: ["shift_admin_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      sensitive_data_audit_log: {
        Row: {
          action: string
          created_at: string
          fields_accessed: string[]
          id: string
          record_id: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          fields_accessed: string[]
          id?: string
          record_id?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          fields_accessed?: string[]
          id?: string
          record_id?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          id: string
          rejection_reason: string | null
          responded_at: string | null
          shift_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          rejection_reason?: string | null
          responded_at?: string | null
          shift_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          rejection_reason?: string | null
          responded_at?: string | null
          shift_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_attendance_confirmations: {
        Row: {
          assignment_id: string
          company_id: string
          confirmed_at: string
          confirmed_by: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          shift_id: string
          status: string
        }
        Insert: {
          assignment_id: string
          company_id: string
          confirmed_at?: string
          confirmed_by: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          shift_id: string
          status?: string
        }
        Update: {
          assignment_id?: string
          company_id?: string
          confirmed_at?: string
          confirmed_by?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          shift_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_attendance_confirmations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_attendance_confirmations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_attendance_confirmations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_attendance_confirmations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_attendance_confirmations_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_chat_config: {
        Row: {
          auto_close_at: string | null
          auto_open_at: string | null
          company_id: string
          created_at: string
          id: string
          is_open: boolean
          reopened_at: string | null
          reopened_by: string | null
          shift_id: string
          updated_at: string
        }
        Insert: {
          auto_close_at?: string | null
          auto_open_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_open?: boolean
          reopened_at?: string | null
          reopened_by?: string | null
          shift_id: string
          updated_at?: string
        }
        Update: {
          auto_close_at?: string | null
          auto_open_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_open?: boolean
          reopened_at?: string | null
          reopened_by?: string | null
          shift_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_chat_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_chat_config_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_chat_messages: {
        Row: {
          company_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_employee_id: string | null
          sender_type: string
          sender_user_id: string | null
          shift_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_employee_id?: string | null
          sender_type?: string
          sender_user_id?: string | null
          shift_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_employee_id?: string | null
          sender_type?: string
          sender_user_id?: string | null
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_chat_messages_sender_employee_id_fkey"
            columns: ["sender_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_chat_messages_sender_employee_id_fkey"
            columns: ["sender_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_chat_messages_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_comments: {
        Row: {
          attachments: Json | null
          author_id: string
          author_type: string
          company_id: string
          content: string
          created_at: string
          employee_id: string | null
          id: string
          shift_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          author_id: string
          author_type?: string
          company_id: string
          content?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          shift_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string
          author_type?: string
          company_id?: string
          content?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          shift_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_comments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_comments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_comments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_comments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_requests: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          id: string
          message: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift_id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          message?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          message?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_reviews: {
        Row: {
          comment: string | null
          company_id: string
          created_at: string
          id: string
          overall_rating: number
          rating_clarity: number | null
          rating_compensation: number | null
          rating_conditions: number | null
          rating_instructions: number | null
          rating_organization: number | null
          rating_presentation: number | null
          rating_productivity: number | null
          rating_professionalism: number | null
          rating_punctuality: number | null
          rating_quality: number | null
          rating_service: number | null
          rating_supervisor_treatment: number | null
          rating_teamwork: number | null
          reviewed_client_id: string | null
          reviewed_employee_id: string | null
          reviewer_id: string
          reviewer_type: string
          shift_id: string
          would_work_again: boolean | null
        }
        Insert: {
          comment?: string | null
          company_id: string
          created_at?: string
          id?: string
          overall_rating: number
          rating_clarity?: number | null
          rating_compensation?: number | null
          rating_conditions?: number | null
          rating_instructions?: number | null
          rating_organization?: number | null
          rating_presentation?: number | null
          rating_productivity?: number | null
          rating_professionalism?: number | null
          rating_punctuality?: number | null
          rating_quality?: number | null
          rating_service?: number | null
          rating_supervisor_treatment?: number | null
          rating_teamwork?: number | null
          reviewed_client_id?: string | null
          reviewed_employee_id?: string | null
          reviewer_id: string
          reviewer_type: string
          shift_id: string
          would_work_again?: boolean | null
        }
        Update: {
          comment?: string | null
          company_id?: string
          created_at?: string
          id?: string
          overall_rating?: number
          rating_clarity?: number | null
          rating_compensation?: number | null
          rating_conditions?: number | null
          rating_instructions?: number | null
          rating_organization?: number | null
          rating_presentation?: number | null
          rating_productivity?: number | null
          rating_professionalism?: number | null
          rating_punctuality?: number | null
          rating_quality?: number | null
          rating_service?: number | null
          rating_supervisor_treatment?: number | null
          rating_teamwork?: number | null
          reviewed_client_id?: string | null
          reviewed_employee_id?: string | null
          reviewer_id?: string
          reviewer_type?: string
          shift_id?: string
          would_work_again?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reviews_reviewed_client_id_fkey"
            columns: ["reviewed_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reviews_reviewed_employee_id_fkey"
            columns: ["reviewed_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reviews_reviewed_employee_id_fkey"
            columns: ["reviewed_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reviews_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_rides: {
        Row: {
          company_id: string
          created_at: string
          driver_id: string
          id: string
          movement_id: string | null
          notes: string | null
          passenger_count: number
          ride_type: string
          shift_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          driver_id: string
          id?: string
          movement_id?: string | null
          notes?: string | null
          passenger_count?: number
          ride_type?: string
          shift_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          driver_id?: string
          id?: string
          movement_id?: string | null
          notes?: string | null
          passenger_count?: number
          ride_type?: string
          shift_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_rides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_rides_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_rides_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          clock_in_device: string | null
          clock_in_location: string | null
          clock_in_time: string | null
          clock_out_device: string | null
          clock_out_location: string | null
          clock_out_time: string | null
          company_id: string
          created_at: string
          customer: string | null
          daily_total_hours: number | null
          daily_total_pay_usd: number | null
          employee_id: string
          employee_notes: string | null
          hourly_rate_usd: number | null
          id: string
          import_id: string | null
          job_code: string | null
          manager_notes: string | null
          period_id: string
          ride: string | null
          scheduled_shift_title: string | null
          shift_end_date: string | null
          shift_hash: string | null
          shift_hours: number | null
          shift_number: string | null
          shift_start_date: string | null
          sub_job: string | null
          sub_job_code: string | null
          type: string | null
        }
        Insert: {
          clock_in_device?: string | null
          clock_in_location?: string | null
          clock_in_time?: string | null
          clock_out_device?: string | null
          clock_out_location?: string | null
          clock_out_time?: string | null
          company_id?: string
          created_at?: string
          customer?: string | null
          daily_total_hours?: number | null
          daily_total_pay_usd?: number | null
          employee_id: string
          employee_notes?: string | null
          hourly_rate_usd?: number | null
          id?: string
          import_id?: string | null
          job_code?: string | null
          manager_notes?: string | null
          period_id: string
          ride?: string | null
          scheduled_shift_title?: string | null
          shift_end_date?: string | null
          shift_hash?: string | null
          shift_hours?: number | null
          shift_number?: string | null
          shift_start_date?: string | null
          sub_job?: string | null
          sub_job_code?: string | null
          type?: string | null
        }
        Update: {
          clock_in_device?: string | null
          clock_in_location?: string | null
          clock_in_time?: string | null
          clock_out_device?: string | null
          clock_out_location?: string | null
          clock_out_time?: string | null
          company_id?: string
          created_at?: string
          customer?: string | null
          daily_total_hours?: number | null
          daily_total_pay_usd?: number | null
          employee_id?: string
          employee_notes?: string | null
          hourly_rate_usd?: number | null
          id?: string
          import_id?: string | null
          job_code?: string | null
          manager_notes?: string | null
          period_id?: string
          ride?: string | null
          scheduled_shift_title?: string | null
          shift_end_date?: string | null
          shift_hash?: string | null
          shift_hours?: number | null
          shift_number?: string | null
          shift_start_date?: string | null
          sub_job?: string | null
          sub_job_code?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      sidebar_customizations: {
        Row: {
          created_at: string
          id: string
          link_key: string
          note: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_key: string
          note?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link_key?: string
          note?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staffing_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_manager_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_id: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          creation_source: string
          end_time: string
          estimated_bill_rate: number | null
          estimated_duration_hours: number | null
          estimated_pay_rate: number | null
          gender_preference: string | null
          id: string
          internal_notes: string | null
          location_id: string | null
          notes: string | null
          priority: string
          requested_date: string
          requested_role: string | null
          required_experience: string | null
          required_language: string | null
          required_tags: string[] | null
          start_time: string
          status: Database["public"]["Enums"]["staffing_request_status"]
          title: string
          updated_at: string
          workers_needed: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_manager_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          creation_source?: string
          end_time?: string
          estimated_bill_rate?: number | null
          estimated_duration_hours?: number | null
          estimated_pay_rate?: number | null
          gender_preference?: string | null
          id?: string
          internal_notes?: string | null
          location_id?: string | null
          notes?: string | null
          priority?: string
          requested_date: string
          requested_role?: string | null
          required_experience?: string | null
          required_language?: string | null
          required_tags?: string[] | null
          start_time?: string
          status?: Database["public"]["Enums"]["staffing_request_status"]
          title: string
          updated_at?: string
          workers_needed?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_manager_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          creation_source?: string
          end_time?: string
          estimated_bill_rate?: number | null
          estimated_duration_hours?: number | null
          estimated_pay_rate?: number | null
          gender_preference?: string | null
          id?: string
          internal_notes?: string | null
          location_id?: string | null
          notes?: string | null
          priority?: string
          requested_date?: string
          requested_role?: string | null
          required_experience?: string | null
          required_language?: string | null
          required_tags?: string[] | null
          start_time?: string
          status?: Database["public"]["Enums"]["staffing_request_status"]
          title?: string
          updated_at?: string
          workers_needed?: number
        }
        Relationships: [
          {
            foreignKeyName: "staffing_requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          company_id: string
          created_at: string
          current_period_end: string | null
          id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          company_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_forms_1099: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          generated_at: string | null
          generated_by: string | null
          id: string
          nonemployee_compensation: number
          pdf_url: string | null
          status: string
          tax_year: number
          total_compensation: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          nonemployee_compensation?: number
          pdf_url?: string | null
          status?: string
          tax_year: number
          total_compensation?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          nonemployee_compensation?: number
          pdf_url?: string | null
          status?: string
          tax_year?: number
          total_compensation?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_forms_1099_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_forms_1099_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_forms_1099_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_notes: {
        Row: {
          author_id: string
          author_type: string
          company_id: string
          content: string
          created_at: string
          id: string
          metadata: Json | null
          note_type: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          author_type?: string
          company_id: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          note_type?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          author_type?: string
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          note_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "employee_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          break_minutes: number | null
          clock_in: string
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_in_within_geofence: boolean | null
          clock_out: string | null
          clock_out_lat: number | null
          clock_out_lng: number | null
          clock_out_within_geofence: boolean | null
          company_id: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          shift_id: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number | null
          clock_in: string
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_in_within_geofence?: boolean | null
          clock_out?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          clock_out_within_geofence?: boolean | null
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          shift_id?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number | null
          clock_in?: string
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_in_within_geofence?: boolean | null
          clock_out?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          clock_out_within_geofence?: boolean | null
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          shift_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      worker_consent_records: {
        Row: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at: string | null
          document_version: string | null
          granted: boolean
          granted_at: string | null
          id: string
          ip_address: string | null
          revoked_at: string | null
          updated_at: string | null
          user_agent: string | null
          worker_profile_id: string
        }
        Insert: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at?: string | null
          document_version?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: string | null
          revoked_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          worker_profile_id: string
        }
        Update: {
          consent_type?: Database["public"]["Enums"]["consent_type"]
          created_at?: string | null
          document_version?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: string | null
          revoked_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_consent_records_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_documents: {
        Row: {
          created_at: string | null
          document_type: Database["public"]["Enums"]["document_type_enum"]
          expires_at: string | null
          file_name: string | null
          file_url: string
          id: string
          is_private: boolean | null
          notes: string | null
          updated_at: string | null
          verification_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          worker_profile_id: string
        }
        Insert: {
          created_at?: string | null
          document_type: Database["public"]["Enums"]["document_type_enum"]
          expires_at?: string | null
          file_name?: string | null
          file_url: string
          id?: string
          is_private?: boolean | null
          notes?: string | null
          updated_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          worker_profile_id: string
        }
        Update: {
          created_at?: string | null
          document_type?: Database["public"]["Enums"]["document_type_enum"]
          expires_at?: string | null
          file_name?: string | null
          file_url?: string
          id?: string
          is_private?: boolean | null
          notes?: string | null
          updated_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_documents_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_experience_records: {
        Row: {
          company_name: string
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          is_current: boolean | null
          source_type: Database["public"]["Enums"]["experience_source"] | null
          start_date: string | null
          title: string
          worker_profile_id: string
        }
        Insert: {
          company_name: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          source_type?: Database["public"]["Enums"]["experience_source"] | null
          start_date?: string | null
          title: string
          worker_profile_id: string
        }
        Update: {
          company_name?: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          source_type?: Database["public"]["Enums"]["experience_source"] | null
          start_date?: string | null
          title?: string
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_experience_records_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_languages: {
        Row: {
          created_at: string | null
          id: string
          language_code: string
          proficiency_level: Database["public"]["Enums"]["proficiency_level"]
          worker_profile_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          language_code: string
          proficiency_level: Database["public"]["Enums"]["proficiency_level"]
          worker_profile_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          language_code?: string
          proficiency_level?: Database["public"]["Enums"]["proficiency_level"]
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_languages_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_profile_skills: {
        Row: {
          created_at: string | null
          id: string
          is_primary: boolean | null
          proficiency_level:
            | Database["public"]["Enums"]["proficiency_level"]
            | null
          skill_id: string
          worker_profile_id: string
          years_experience: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          proficiency_level?:
            | Database["public"]["Enums"]["proficiency_level"]
            | null
          skill_id: string
          worker_profile_id: string
          years_experience?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          proficiency_level?:
            | Database["public"]["Enums"]["proficiency_level"]
            | null
          skill_id?: string
          worker_profile_id?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_profile_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "worker_skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_profile_skills_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_profiles: {
        Row: {
          bio: string | null
          city: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          deleted_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_id: string | null
          english_level:
            | Database["public"]["Enums"]["english_level_enum"]
            | null
          gender: string | null
          headline: string | null
          id: string
          is_available_for_marketplace: boolean | null
          is_profile_public: boolean | null
          primary_phone: string | null
          profile_completion_percent: number | null
          public_slug: string | null
          referred_by: string | null
          state: string | null
          updated_at: string | null
          user_id: string | null
          verification_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          years_of_experience: number | null
          zip_code: string | null
        }
        Insert: {
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_id?: string | null
          english_level?:
            | Database["public"]["Enums"]["english_level_enum"]
            | null
          gender?: string | null
          headline?: string | null
          id?: string
          is_available_for_marketplace?: boolean | null
          is_profile_public?: boolean | null
          primary_phone?: string | null
          profile_completion_percent?: number | null
          public_slug?: string | null
          referred_by?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          years_of_experience?: number | null
          zip_code?: string | null
        }
        Update: {
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_id?: string | null
          english_level?:
            | Database["public"]["Enums"]["english_level_enum"]
            | null
          gender?: string | null
          headline?: string | null
          id?: string
          is_available_for_marketplace?: boolean | null
          is_profile_public?: boolean | null
          primary_phone?: string | null
          profile_completion_percent?: number | null
          public_slug?: string | null
          referred_by?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          years_of_experience?: number | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_schedule_preferences: {
        Row: {
          blocked_weekdays: number[] | null
          created_at: string | null
          holiday_ok: boolean | null
          id: string
          max_hours_per_week: number | null
          min_hours_per_week: number | null
          notes: string | null
          overnight_ok: boolean | null
          preferred_shift_end: string | null
          preferred_shift_start: string | null
          preferred_weekdays: number[] | null
          updated_at: string | null
          weekend_ok: boolean | null
          worker_profile_id: string
        }
        Insert: {
          blocked_weekdays?: number[] | null
          created_at?: string | null
          holiday_ok?: boolean | null
          id?: string
          max_hours_per_week?: number | null
          min_hours_per_week?: number | null
          notes?: string | null
          overnight_ok?: boolean | null
          preferred_shift_end?: string | null
          preferred_shift_start?: string | null
          preferred_weekdays?: number[] | null
          updated_at?: string | null
          weekend_ok?: boolean | null
          worker_profile_id: string
        }
        Update: {
          blocked_weekdays?: number[] | null
          created_at?: string | null
          holiday_ok?: boolean | null
          id?: string
          max_hours_per_week?: number | null
          min_hours_per_week?: number | null
          notes?: string | null
          overnight_ok?: boolean | null
          preferred_shift_end?: string | null
          preferred_shift_start?: string | null
          preferred_weekdays?: number[] | null
          updated_at?: string | null
          weekend_ok?: boolean | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_schedule_preferences_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: true
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_service_zones: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          city: string | null
          county: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          label: string | null
          polygon_geojson: Json | null
          radius_km: number | null
          state: string | null
          updated_at: string | null
          worker_profile_id: string
          zone_type: Database["public"]["Enums"]["service_zone_type"]
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          city?: string | null
          county?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          label?: string | null
          polygon_geojson?: Json | null
          radius_km?: number | null
          state?: string | null
          updated_at?: string | null
          worker_profile_id: string
          zone_type?: Database["public"]["Enums"]["service_zone_type"]
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          city?: string | null
          county?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          label?: string | null
          polygon_geojson?: Json | null
          radius_km?: number | null
          state?: string | null
          updated_at?: string | null
          worker_profile_id?: string
          zone_type?: Database["public"]["Enums"]["service_zone_type"]
        }
        Relationships: [
          {
            foreignKeyName: "worker_service_zones_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_skills: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      worker_travel_preferences: {
        Row: {
          created_at: string | null
          has_own_transport: boolean | null
          id: string
          max_commute_km: number | null
          max_commute_minutes: number | null
          transport_type: string | null
          updated_at: string | null
          willing_to_relocate: boolean | null
          worker_profile_id: string
        }
        Insert: {
          created_at?: string | null
          has_own_transport?: boolean | null
          id?: string
          max_commute_km?: number | null
          max_commute_minutes?: number | null
          transport_type?: string | null
          updated_at?: string | null
          willing_to_relocate?: boolean | null
          worker_profile_id: string
        }
        Update: {
          created_at?: string | null
          has_own_transport?: boolean | null
          id?: string
          max_commute_km?: number | null
          max_commute_minutes?: number | null
          transport_type?: string | null
          updated_at?: string | null
          willing_to_relocate?: boolean | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_travel_preferences_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: true
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_visibility_settings: {
        Row: {
          created_at: string | null
          id: string
          profile_visibility:
            | Database["public"]["Enums"]["profile_visibility"]
            | null
          show_approximate_location: boolean | null
          show_city: boolean | null
          show_exact_location: boolean | null
          show_experience: boolean | null
          show_first_name: boolean | null
          show_last_name: boolean | null
          show_photo: boolean | null
          show_reputation: boolean | null
          show_skills: boolean | null
          show_work_history: boolean | null
          updated_at: string | null
          worker_profile_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_visibility?:
            | Database["public"]["Enums"]["profile_visibility"]
            | null
          show_approximate_location?: boolean | null
          show_city?: boolean | null
          show_exact_location?: boolean | null
          show_experience?: boolean | null
          show_first_name?: boolean | null
          show_last_name?: boolean | null
          show_photo?: boolean | null
          show_reputation?: boolean | null
          show_skills?: boolean | null
          show_work_history?: boolean | null
          updated_at?: string | null
          worker_profile_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_visibility?:
            | Database["public"]["Enums"]["profile_visibility"]
            | null
          show_approximate_location?: boolean | null
          show_city?: boolean | null
          show_exact_location?: boolean | null
          show_experience?: boolean | null
          show_first_name?: boolean | null
          show_last_name?: boolean | null
          show_photo?: boolean | null
          show_reputation?: boolean | null
          show_skills?: boolean | null
          show_work_history?: boolean | null
          updated_at?: string | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_visibility_settings_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: true
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employees_safe: {
        Row: {
          company_id: string | null
          connecteam_employee_id: string | null
          created_at: string | null
          direct_manager: string | null
          employee_role: string | null
          end_date: string | null
          first_name: string | null
          gender: string | null
          groups: string | null
          id: string | null
          is_active: boolean | null
          last_name: string | null
          start_date: string | null
          tags: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          connecteam_employee_id?: string | null
          created_at?: string | null
          direct_manager?: string | null
          employee_role?: string | null
          end_date?: string | null
          first_name?: string | null
          gender?: string | null
          groups?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          connecteam_employee_id?: string | null
          created_at?: string | null
          direct_manager?: string | null
          employee_role?: string | null
          end_date?: string | null
          first_name?: string | null
          gender?: string | null
          groups?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string | null
          user_id?: string | null
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
      profiles_safe: {
        Row: {
          full_name: string | null
          user_id: string | null
        }
        Insert: {
          full_name?: string | null
          user_id?: string | null
        }
        Update: {
          full_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      shifts_safe: {
        Row: {
          clock_in_device: string | null
          clock_in_location: string | null
          clock_in_time: string | null
          clock_out_device: string | null
          clock_out_location: string | null
          clock_out_time: string | null
          created_at: string | null
          customer: string | null
          daily_total_hours: number | null
          employee_id: string | null
          employee_notes: string | null
          id: string | null
          import_id: string | null
          job_code: string | null
          manager_notes: string | null
          period_id: string | null
          ride: string | null
          scheduled_shift_title: string | null
          shift_end_date: string | null
          shift_hash: string | null
          shift_hours: number | null
          shift_number: string | null
          shift_start_date: string | null
          sub_job: string | null
          sub_job_code: string | null
          type: string | null
        }
        Insert: {
          clock_in_device?: string | null
          clock_in_location?: string | null
          clock_in_time?: string | null
          clock_out_device?: string | null
          clock_out_location?: string | null
          clock_out_time?: string | null
          created_at?: string | null
          customer?: string | null
          daily_total_hours?: number | null
          employee_id?: string | null
          employee_notes?: string | null
          id?: string | null
          import_id?: string | null
          job_code?: string | null
          manager_notes?: string | null
          period_id?: string | null
          ride?: string | null
          scheduled_shift_title?: string | null
          shift_end_date?: string | null
          shift_hash?: string | null
          shift_hours?: number | null
          shift_number?: string | null
          shift_start_date?: string | null
          sub_job?: string | null
          sub_job_code?: string | null
          type?: string | null
        }
        Update: {
          clock_in_device?: string | null
          clock_in_location?: string | null
          clock_in_time?: string | null
          clock_out_device?: string | null
          clock_out_location?: string | null
          clock_out_time?: string | null
          created_at?: string | null
          customer?: string | null
          daily_total_hours?: number | null
          employee_id?: string | null
          employee_notes?: string | null
          id?: string | null
          import_id?: string | null
          job_code?: string | null
          manager_notes?: string | null
          period_id?: string | null
          ride?: string | null
          scheduled_shift_title?: string | null
          shift_end_date?: string | null
          shift_hash?: string | null
          shift_hours?: number | null
          shift_number?: string | null
          shift_start_date?: string | null
          sub_job?: string | null
          sub_job_code?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_role_template: {
        Args: {
          _company_id: string
          _replace?: boolean
          _template_id: string
          _user_id: string
        }
        Returns: undefined
      }
      cleanup_expired_rate_limits: { Args: never; Returns: undefined }
      consolidate_all_passports: { Args: never; Returns: Json }
      consolidate_passport: {
        Args: { _worker_profile_id: string }
        Returns: undefined
      }
      consolidate_period_base_pay: {
        Args: { _company_id: string; _period_id: string }
        Returns: Json
      }
      has_action_permission: {
        Args: { _action: string; _company_id: string; _user_id: string }
        Returns: boolean
      }
      has_company_role: {
        Args: { _company_id: string; _role: string; _user_id: string }
        Returns: boolean
      }
      has_module_permission: {
        Args: { _module: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_global_owner: { Args: { _user_id: string }; Returns: boolean }
      log_activity: {
        Args: {
          _action: string
          _company_id?: string
          _details?: Json
          _entity_id?: string
          _entity_type: string
        }
        Returns: undefined
      }
      log_activity_detailed: {
        Args: {
          _action: string
          _company_id?: string
          _details?: Json
          _entity_id?: string
          _entity_type: string
          _new_data?: Json
          _old_data?: Json
        }
        Returns: undefined
      }
      log_sensitive_access: {
        Args: { _fields: string[]; _record_id: string; _table_name: string }
        Returns: undefined
      }
      recalculate_rep_score: {
        Args: { _worker_profile_id: string }
        Returns: undefined
      }
      user_company_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role:
        | "admin"
        | "employee"
        | "developer"
        | "owner"
        | "manager"
        | "supervisor"
      calc_mode: "quantity_x_rate" | "manual_value" | "hybrid"
      concept_category: "extra" | "deduction"
      consent_type:
        | "terms_of_service"
        | "privacy_policy"
        | "background_check"
        | "drug_test"
        | "gps_tracking"
        | "data_sharing"
        | "photo_release"
      document_type_enum:
        | "id_card"
        | "passport"
        | "driver_license"
        | "w9"
        | "certification"
        | "background_check"
        | "other"
      english_level_enum:
        | "none"
        | "basic"
        | "intermediate"
        | "advanced"
        | "native"
      experience_source:
        | "manual"
        | "stafly_import"
        | "marketplace_import"
        | "linkedin"
      invoice_status:
        | "draft"
        | "approved"
        | "issued"
        | "sent"
        | "viewed"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "voided"
      passport_source:
        | "stafly_shift"
        | "marketplace_booking"
        | "imported_experience"
      proficiency_level: "beginner" | "intermediate" | "advanced" | "expert"
      profile_visibility: "private" | "limited" | "public"
      rate_source: "concept_default" | "per_employee"
      reputation_source:
        | "shift_review"
        | "marketplace_review"
        | "attendance"
        | "no_show"
        | "cancellation"
        | "completion_bonus"
        | "manual_adjustment"
      service_zone_type: "radius" | "polygon" | "city" | "county" | "state"
      staffing_request_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "sourcing"
        | "partially_assigned"
        | "fully_assigned"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      verification_method:
        | "manual"
        | "ai"
        | "third_party"
        | "document_scan"
        | "reference_check"
      verification_status: "unverified" | "pending" | "verified" | "rejected"
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
        "employee",
        "developer",
        "owner",
        "manager",
        "supervisor",
      ],
      calc_mode: ["quantity_x_rate", "manual_value", "hybrid"],
      concept_category: ["extra", "deduction"],
      consent_type: [
        "terms_of_service",
        "privacy_policy",
        "background_check",
        "drug_test",
        "gps_tracking",
        "data_sharing",
        "photo_release",
      ],
      document_type_enum: [
        "id_card",
        "passport",
        "driver_license",
        "w9",
        "certification",
        "background_check",
        "other",
      ],
      english_level_enum: [
        "none",
        "basic",
        "intermediate",
        "advanced",
        "native",
      ],
      experience_source: [
        "manual",
        "stafly_import",
        "marketplace_import",
        "linkedin",
      ],
      invoice_status: [
        "draft",
        "approved",
        "issued",
        "sent",
        "viewed",
        "partially_paid",
        "paid",
        "overdue",
        "voided",
      ],
      passport_source: [
        "stafly_shift",
        "marketplace_booking",
        "imported_experience",
      ],
      proficiency_level: ["beginner", "intermediate", "advanced", "expert"],
      profile_visibility: ["private", "limited", "public"],
      rate_source: ["concept_default", "per_employee"],
      reputation_source: [
        "shift_review",
        "marketplace_review",
        "attendance",
        "no_show",
        "cancellation",
        "completion_bonus",
        "manual_adjustment",
      ],
      service_zone_type: ["radius", "polygon", "city", "county", "state"],
      staffing_request_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "sourcing",
        "partially_assigned",
        "fully_assigned",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      verification_method: [
        "manual",
        "ai",
        "third_party",
        "document_scan",
        "reference_check",
      ],
      verification_status: ["unverified", "pending", "verified", "rejected"],
    },
  },
} as const
