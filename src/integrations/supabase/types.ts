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
      companies: {
        Row: {
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
          avatar_url: string | null
          company_id: string
          connecteam_employee_id: string | null
          country_code: string | null
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
          phone_number: string | null
          qualify: string | null
          recommended_by: string | null
          start_date: string | null
          tags: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_pin?: string | null
          added_by?: string | null
          added_via?: string | null
          avatar_url?: string | null
          company_id?: string
          connecteam_employee_id?: string | null
          country_code?: string | null
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
          phone_number?: string | null
          qualify?: string | null
          recommended_by?: string | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_pin?: string | null
          added_by?: string | null
          added_via?: string | null
          avatar_url?: string | null
          company_id?: string
          connecteam_employee_id?: string | null
          country_code?: string | null
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
          phone_number?: string | null
          qualify?: string | null
          recommended_by?: string | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string
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
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
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
          claimable: boolean
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          end_time: string
          id: string
          location_id: string | null
          meeting_point: string | null
          notes: string | null
          shift_code: string | null
          slots: number | null
          special_instructions: string | null
          start_time: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          claimable?: boolean
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          date: string
          deleted_at?: string | null
          end_time: string
          id?: string
          location_id?: string | null
          meeting_point?: string | null
          notes?: string | null
          shift_code?: string | null
          slots?: number | null
          special_instructions?: string | null
          start_time: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          claimable?: boolean
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          end_time?: string
          id?: string
          location_id?: string | null
          meeting_point?: string | null
          notes?: string | null
          shift_code?: string | null
          slots?: number | null
          special_instructions?: string | null
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
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
            foreignKeyName: "scheduled_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
    }
    Views: {
      employees_safe: {
        Row: {
          company_id: string | null
          connecteam_employee_id: string | null
          created_at: string | null
          direct_manager: string | null
          email: string | null
          employee_role: string | null
          end_date: string | null
          first_name: string | null
          gender: string | null
          groups: string | null
          id: string | null
          is_active: boolean | null
          last_name: string | null
          phone_number: string | null
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
          email?: string | null
          employee_role?: string | null
          end_date?: string | null
          first_name?: string | null
          gender?: string | null
          groups?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
          phone_number?: string | null
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
          email?: string | null
          employee_role?: string | null
          end_date?: string | null
          first_name?: string | null
          gender?: string | null
          groups?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
          phone_number?: string | null
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
      user_company_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "employee" | "owner" | "manager"
      calc_mode: "quantity_x_rate" | "manual_value" | "hybrid"
      concept_category: "extra" | "deduction"
      rate_source: "concept_default" | "per_employee"
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
      app_role: ["admin", "employee", "owner", "manager"],
      calc_mode: ["quantity_x_rate", "manual_value", "hybrid"],
      concept_category: ["extra", "deduction"],
      rate_source: ["concept_default", "per_employee"],
    },
  },
} as const
