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
          {
            foreignKeyName: "action_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          {
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      application_configs: {
        Row: {
          allow_file_uploads: boolean
          application_enabled: boolean
          auto_send_invite_on_approval: boolean
          company_id: string
          cover_image_url: string | null
          created_at: string
          default_role_mapping: Json | null
          id: string
          intro_text: string | null
          optional_fields: Json
          require_document: boolean
          require_email: boolean
          require_emergency_contact: boolean
          require_work_auth: boolean
          required_fields: Json
          updated_at: string
          visible_worker_types: Json
        }
        Insert: {
          allow_file_uploads?: boolean
          application_enabled?: boolean
          auto_send_invite_on_approval?: boolean
          company_id: string
          cover_image_url?: string | null
          created_at?: string
          default_role_mapping?: Json | null
          id?: string
          intro_text?: string | null
          optional_fields?: Json
          require_document?: boolean
          require_email?: boolean
          require_emergency_contact?: boolean
          require_work_auth?: boolean
          required_fields?: Json
          updated_at?: string
          visible_worker_types?: Json
        }
        Update: {
          allow_file_uploads?: boolean
          application_enabled?: boolean
          auto_send_invite_on_approval?: boolean
          company_id?: string
          cover_image_url?: string | null
          created_at?: string
          default_role_mapping?: Json | null
          id?: string
          intro_text?: string | null
          optional_fields?: Json
          require_document?: boolean
          require_email?: boolean
          require_emergency_contact?: boolean
          require_work_auth?: boolean
          required_fields?: Json
          updated_at?: string
          visible_worker_types?: Json
        }
        Relationships: [
          {
            foreignKeyName: "application_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      application_documents: {
        Row: {
          application_id: string
          file_name: string | null
          file_type: string
          file_url: string
          id: string
          uploaded_at: string
        }
        Insert: {
          application_id: string
          file_name?: string | null
          file_type?: string
          file_url: string
          id?: string
          uploaded_at?: string
        }
        Update: {
          application_id?: string
          file_name?: string | null
          file_type?: string
          file_url?: string
          id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_events: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          event_data: Json | null
          event_type: string
          id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
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
          {
            foreignKeyName: "automation_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          {
            foreignKeyName: "automation_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      billable_service_block_entries: {
        Row: {
          created_at: string
          end_time: string | null
          hours: number | null
          id: string
          notes: string | null
          service_block_id: string
          start_time: string | null
          workers: number
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          hours?: number | null
          id?: string
          notes?: string | null
          service_block_id: string
          start_time?: string | null
          workers?: number
        }
        Update: {
          created_at?: string
          end_time?: string | null
          hours?: number | null
          id?: string
          notes?: string | null
          service_block_id?: string
          start_time?: string | null
          workers?: number
        }
        Relationships: [
          {
            foreignKeyName: "billable_service_block_entries_service_block_id_fkey"
            columns: ["service_block_id"]
            isOneToOne: false
            referencedRelation: "billable_service_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      billable_service_blocks: {
        Row: {
          amount: number
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          billable_unit: Database["public"]["Enums"]["billable_unit"]
          client_id: string
          client_location_id: string | null
          company_id: string
          created_at: string
          currency: string
          description_rendered: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          qty: number
          rate: number
          service_date: string
          service_type: string | null
          shift_group_id: string | null
          source_status: Database["public"]["Enums"]["service_block_source_status"]
          source_type: Database["public"]["Enums"]["service_block_source_type"]
          updated_at: string
          workers_count: number
        }
        Insert: {
          amount?: number
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          billable_unit?: Database["public"]["Enums"]["billable_unit"]
          client_id: string
          client_location_id?: string | null
          company_id: string
          created_at?: string
          currency?: string
          description_rendered?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          qty?: number
          rate?: number
          service_date: string
          service_type?: string | null
          shift_group_id?: string | null
          source_status?: Database["public"]["Enums"]["service_block_source_status"]
          source_type?: Database["public"]["Enums"]["service_block_source_type"]
          updated_at?: string
          workers_count?: number
        }
        Update: {
          amount?: number
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          billable_unit?: Database["public"]["Enums"]["billable_unit"]
          client_id?: string
          client_location_id?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          description_rendered?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          qty?: number
          rate?: number
          service_date?: string
          service_type?: string | null
          shift_group_id?: string | null
          source_status?: Database["public"]["Enums"]["service_block_source_status"]
          source_type?: Database["public"]["Enums"]["service_block_source_type"]
          updated_at?: string
          workers_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "billable_service_blocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "billing_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billable_service_blocks_client_location_id_fkey"
            columns: ["client_location_id"]
            isOneToOne: false
            referencedRelation: "billing_client_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billable_service_blocks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billable_service_blocks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bsb_invoice"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_client_locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          client_id: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          location_v2_id: string | null
          name: string
          notes: string | null
          state: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_id: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          location_v2_id?: string | null
          name: string
          notes?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_id?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          location_v2_id?: string | null
          name?: string
          notes?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_client_locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "billing_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_client_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_client_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_client_locations_location_v2_id_fkey"
            columns: ["location_v2_id"]
            isOneToOne: false
            referencedRelation: "locations_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_clients: {
        Row: {
          billing_address_line1: string | null
          billing_address_line2: string | null
          billing_city: string | null
          billing_country: string | null
          billing_state: string | null
          billing_zip: string | null
          company_id: string
          created_at: string
          default_currency: string
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          name: string
          notes: string | null
          operational_client_id: string | null
          payment_terms: string | null
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          billing_zip?: string | null
          company_id: string
          created_at?: string
          default_currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name: string
          notes?: string | null
          operational_client_id?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          billing_zip?: string | null
          company_id?: string
          created_at?: string
          default_currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name?: string
          notes?: string | null
          operational_client_id?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_clients_operational_client_id_fkey"
            columns: ["operational_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
          {
            foreignKeyName: "billing_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          id: string
          is_muted: boolean
          joined_at: string
          last_read_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          is_pinned: boolean
          message_type: string
          metadata: Json | null
          reactions: Json | null
          reply_to: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_pinned?: boolean
          message_type?: string
          metadata?: Json | null
          reactions?: Json | null
          reply_to?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_pinned?: boolean
          message_type?: string
          metadata?: Json | null
          reactions?: Json | null
          reply_to?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "channel_messages"
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
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "clock_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          clock_method: string
          company_id: string
          created_at: string
          device: string | null
          employee_id: string
          id: string
          is_payroll_relevant: boolean
          kiosk_device_id: string | null
          latitude: number | null
          longitude: number | null
          photo_url: string | null
          punctuality: string | null
          shift_id: string | null
          time_entry_id: string | null
          type: string
        }
        Insert: {
          accuracy?: number | null
          address?: string | null
          clock_method?: string
          company_id: string
          created_at?: string
          device?: string | null
          employee_id: string
          id?: string
          is_payroll_relevant?: boolean
          kiosk_device_id?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          punctuality?: string | null
          shift_id?: string | null
          time_entry_id?: string | null
          type: string
        }
        Update: {
          accuracy?: number | null
          address?: string | null
          clock_method?: string
          company_id?: string
          created_at?: string
          device?: string | null
          employee_id?: string
          id?: string
          is_payroll_relevant?: boolean
          kiosk_device_id?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          punctuality?: string | null
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
            foreignKeyName: "clock_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "clock_events_kiosk_device_id_fkey"
            columns: ["kiosk_device_id"]
            isOneToOne: false
            referencedRelation: "kiosk_devices"
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
      closure_quality_log: {
        Row: {
          anomalous_clocks_suppressed: number
          auto_approved: number
          closed_at: string
          closure_confidence_pct: number | null
          company_id: string
          created_by: string | null
          id: string
          known_pattern_resolved: number
          manual_review: number
          new_patterns_detected: number
          notes: string | null
          period_id: string
          period_status_id: string | null
          total_employees: number
          truth_validated: number
        }
        Insert: {
          anomalous_clocks_suppressed?: number
          auto_approved?: number
          closed_at?: string
          closure_confidence_pct?: number | null
          company_id: string
          created_by?: string | null
          id?: string
          known_pattern_resolved?: number
          manual_review?: number
          new_patterns_detected?: number
          notes?: string | null
          period_id: string
          period_status_id?: string | null
          total_employees?: number
          truth_validated?: number
        }
        Update: {
          anomalous_clocks_suppressed?: number
          auto_approved?: number
          closed_at?: string
          closure_confidence_pct?: number | null
          company_id?: string
          created_by?: string | null
          id?: string
          known_pattern_resolved?: number
          manual_review?: number
          new_patterns_detected?: number
          notes?: string | null
          period_id?: string
          period_status_id?: string | null
          total_employees?: number
          truth_validated?: number
        }
        Relationships: [
          {
            foreignKeyName: "closure_quality_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_quality_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_channels: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          member_count: number
          name: string
          pinned_message_ids: string[] | null
          updated_at: string
          zone: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          member_count?: number
          name: string
          pinned_message_ids?: string[] | null
          updated_at?: string
          zone: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          member_count?: number
          name?: string
          pinned_message_ids?: string[] | null
          updated_at?: string
          zone?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          application_cover_url: string | null
          application_enabled: boolean
          application_intro: string | null
          billing_status: string
          brand_color: string | null
          company_code: number | null
          created_at: string
          id: string
          invite_code: string
          is_active: boolean
          is_sandbox: boolean
          logo_url: string | null
          max_admins: number
          max_employees: number
          name: string
          paid_features_enabled: boolean
          plan_activated_at: string | null
          plan_activated_by: string | null
          plan_code: string
          plan_status: string
          slug: string
          trial_ends_at: string | null
          updated_at: string
          upgrade_requested_at: string | null
        }
        Insert: {
          application_cover_url?: string | null
          application_enabled?: boolean
          application_intro?: string | null
          billing_status?: string
          brand_color?: string | null
          company_code?: number | null
          created_at?: string
          id?: string
          invite_code: string
          is_active?: boolean
          is_sandbox?: boolean
          logo_url?: string | null
          max_admins?: number
          max_employees?: number
          name: string
          paid_features_enabled?: boolean
          plan_activated_at?: string | null
          plan_activated_by?: string | null
          plan_code?: string
          plan_status?: string
          slug: string
          trial_ends_at?: string | null
          updated_at?: string
          upgrade_requested_at?: string | null
        }
        Update: {
          application_cover_url?: string | null
          application_enabled?: boolean
          application_intro?: string | null
          billing_status?: string
          brand_color?: string | null
          company_code?: number | null
          created_at?: string
          id?: string
          invite_code?: string
          is_active?: boolean
          is_sandbox?: boolean
          logo_url?: string | null
          max_admins?: number
          max_employees?: number
          name?: string
          paid_features_enabled?: boolean
          plan_activated_at?: string | null
          plan_activated_by?: string | null
          plan_code?: string
          plan_status?: string
          slug?: string
          trial_ends_at?: string | null
          updated_at?: string
          upgrade_requested_at?: string | null
        }
        Relationships: []
      }
      company_compensation_rules: {
        Row: {
          amount: number
          applies_to_employee: string | null
          applies_to_job: string | null
          applies_to_location: string | null
          applies_to_role: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          priority: number
          rule_name: string
          rule_type: Database["public"]["Enums"]["comp_rule_type"]
          unit_type: Database["public"]["Enums"]["comp_unit_type"]
          updated_at: string
        }
        Insert: {
          amount?: number
          applies_to_employee?: string | null
          applies_to_job?: string | null
          applies_to_location?: string | null
          applies_to_role?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          priority?: number
          rule_name: string
          rule_type: Database["public"]["Enums"]["comp_rule_type"]
          unit_type?: Database["public"]["Enums"]["comp_unit_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          applies_to_employee?: string | null
          applies_to_job?: string | null
          applies_to_location?: string | null
          applies_to_role?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          priority?: number
          rule_name?: string
          rule_type?: Database["public"]["Enums"]["comp_rule_type"]
          unit_type?: Database["public"]["Enums"]["comp_unit_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_compensation_rules_applies_to_employee_fkey"
            columns: ["applies_to_employee"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_compensation_rules_applies_to_employee_fkey"
            columns: ["applies_to_employee"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_compensation_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_compensation_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      company_cutover_dates: {
        Row: {
          company_id: string
          cutover_date: string
          id: string
          notes: string | null
          set_at: string
          set_by: string | null
        }
        Insert: {
          company_id: string
          cutover_date: string
          id?: string
          notes?: string | null
          set_at?: string
          set_by?: string | null
        }
        Update: {
          company_id?: string
          cutover_date?: string
          id?: string
          notes?: string | null
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_cutover_dates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_cutover_dates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      company_financial_policies: {
        Row: {
          advances_enabled: boolean
          allow_multiple_active: boolean
          allow_outside_payroll_repayments: boolean
          allow_transport_advances: boolean
          company_id: string
          created_at: string
          deduction_priority:
            | Database["public"]["Enums"]["deduction_priority_mode"]
            | null
          default_fixed_amount: number | null
          default_percentage: number | null
          default_repayment_mode:
            | Database["public"]["Enums"]["repayment_mode"]
            | null
          id: string
          loans_enabled: boolean
          max_advance_amount: number | null
          max_deduction_percent_of_net: number | null
          max_loan_amount: number | null
          protect_minimum_net_pay_amount: number | null
          require_approval: boolean
          updated_at: string
        }
        Insert: {
          advances_enabled?: boolean
          allow_multiple_active?: boolean
          allow_outside_payroll_repayments?: boolean
          allow_transport_advances?: boolean
          company_id: string
          created_at?: string
          deduction_priority?:
            | Database["public"]["Enums"]["deduction_priority_mode"]
            | null
          default_fixed_amount?: number | null
          default_percentage?: number | null
          default_repayment_mode?:
            | Database["public"]["Enums"]["repayment_mode"]
            | null
          id?: string
          loans_enabled?: boolean
          max_advance_amount?: number | null
          max_deduction_percent_of_net?: number | null
          max_loan_amount?: number | null
          protect_minimum_net_pay_amount?: number | null
          require_approval?: boolean
          updated_at?: string
        }
        Update: {
          advances_enabled?: boolean
          allow_multiple_active?: boolean
          allow_outside_payroll_repayments?: boolean
          allow_transport_advances?: boolean
          company_id?: string
          created_at?: string
          deduction_priority?:
            | Database["public"]["Enums"]["deduction_priority_mode"]
            | null
          default_fixed_amount?: number | null
          default_percentage?: number | null
          default_repayment_mode?:
            | Database["public"]["Enums"]["repayment_mode"]
            | null
          id?: string
          loans_enabled?: boolean
          max_advance_amount?: number | null
          max_deduction_percent_of_net?: number | null
          max_loan_amount?: number | null
          protect_minimum_net_pay_amount?: number | null
          require_approval?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_financial_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_financial_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_analysis_summary: {
        Row: {
          company_id: string
          current_known_hourly_rate: number | null
          daily_payment_detected: boolean
          employee_id: string
          first_known_hourly_rate: number | null
          first_seen_date: string | null
          hourly_rate_change_count: number
          id: string
          last_hourly_change_date: string | null
          manual_adjustment_detected: boolean
          mixed_compensation_detected: boolean
          notes: string | null
          refreshed_at: string
          ride_payment_detected: boolean
        }
        Insert: {
          company_id: string
          current_known_hourly_rate?: number | null
          daily_payment_detected?: boolean
          employee_id: string
          first_known_hourly_rate?: number | null
          first_seen_date?: string | null
          hourly_rate_change_count?: number
          id?: string
          last_hourly_change_date?: string | null
          manual_adjustment_detected?: boolean
          mixed_compensation_detected?: boolean
          notes?: string | null
          refreshed_at?: string
          ride_payment_detected?: boolean
        }
        Update: {
          company_id?: string
          current_known_hourly_rate?: number | null
          daily_payment_detected?: boolean
          employee_id?: string
          first_known_hourly_rate?: number | null
          first_seen_date?: string | null
          hourly_rate_change_count?: number
          id?: string
          last_hourly_change_date?: string | null
          manual_adjustment_detected?: boolean
          mixed_compensation_detected?: boolean
          notes?: string | null
          refreshed_at?: string
          ride_payment_detected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "compensation_analysis_summary_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_analysis_summary_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_analysis_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_analysis_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_change_log: {
        Row: {
          action_type: Database["public"]["Enums"]["comp_action_type"]
          changed_at: string
          changed_by: string
          changed_field: string | null
          company_id: string
          compensation_profile_id: string | null
          effective_from_new: string | null
          effective_from_old: string | null
          employee_id: string
          id: string
          import_batch_id: string | null
          metadata_json: Json | null
          new_payment_mode:
            | Database["public"]["Enums"]["payment_mode_type"]
            | null
          new_value: string | null
          old_payment_mode:
            | Database["public"]["Enums"]["payment_mode_type"]
            | null
          old_value: string | null
          reason: string | null
          source_file_name: string | null
          source_row_number: number | null
          source_sheet_name: string | null
          source_type: Database["public"]["Enums"]["comp_source_type"]
        }
        Insert: {
          action_type: Database["public"]["Enums"]["comp_action_type"]
          changed_at?: string
          changed_by: string
          changed_field?: string | null
          company_id: string
          compensation_profile_id?: string | null
          effective_from_new?: string | null
          effective_from_old?: string | null
          employee_id: string
          id?: string
          import_batch_id?: string | null
          metadata_json?: Json | null
          new_payment_mode?:
            | Database["public"]["Enums"]["payment_mode_type"]
            | null
          new_value?: string | null
          old_payment_mode?:
            | Database["public"]["Enums"]["payment_mode_type"]
            | null
          old_value?: string | null
          reason?: string | null
          source_file_name?: string | null
          source_row_number?: number | null
          source_sheet_name?: string | null
          source_type?: Database["public"]["Enums"]["comp_source_type"]
        }
        Update: {
          action_type?: Database["public"]["Enums"]["comp_action_type"]
          changed_at?: string
          changed_by?: string
          changed_field?: string | null
          company_id?: string
          compensation_profile_id?: string | null
          effective_from_new?: string | null
          effective_from_old?: string | null
          employee_id?: string
          id?: string
          import_batch_id?: string | null
          metadata_json?: Json | null
          new_payment_mode?:
            | Database["public"]["Enums"]["payment_mode_type"]
            | null
          new_value?: string | null
          old_payment_mode?:
            | Database["public"]["Enums"]["payment_mode_type"]
            | null
          old_value?: string | null
          reason?: string | null
          source_file_name?: string | null
          source_row_number?: number | null
          source_sheet_name?: string | null
          source_type?: Database["public"]["Enums"]["comp_source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "compensation_change_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_change_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_change_log_compensation_profile_id_fkey"
            columns: ["compensation_profile_id"]
            isOneToOne: false
            referencedRelation: "compensation_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_change_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_change_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_profiles: {
        Row: {
          bonus_transport_hourly_rate: number | null
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          default_daily_rate: number | null
          default_half_day_rate: number | null
          default_hourly_rate: number | null
          default_ride_rate_regular: number | null
          default_ride_rate_special: number | null
          double_pay_hourly_rate: number | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          hourly_rate_last_verified_at: string | null
          hourly_rate_override_manual: boolean | null
          id: string
          inferred_hourly_confidence: string | null
          inferred_hourly_rate: number | null
          inferred_hourly_source: string | null
          is_active: boolean
          kitchen_hourly_rate: number | null
          notes: string | null
          overtime_hourly_rate: number | null
          payment_mode: Database["public"]["Enums"]["payment_mode_type"]
          previous_inferred_rate: number | null
          rate_source: Database["public"]["Enums"]["comp_rate_source"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bonus_transport_hourly_rate?: number | null
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          default_daily_rate?: number | null
          default_half_day_rate?: number | null
          default_hourly_rate?: number | null
          default_ride_rate_regular?: number | null
          default_ride_rate_special?: number | null
          double_pay_hourly_rate?: number | null
          effective_from?: string
          effective_to?: string | null
          employee_id: string
          hourly_rate_last_verified_at?: string | null
          hourly_rate_override_manual?: boolean | null
          id?: string
          inferred_hourly_confidence?: string | null
          inferred_hourly_rate?: number | null
          inferred_hourly_source?: string | null
          is_active?: boolean
          kitchen_hourly_rate?: number | null
          notes?: string | null
          overtime_hourly_rate?: number | null
          payment_mode?: Database["public"]["Enums"]["payment_mode_type"]
          previous_inferred_rate?: number | null
          rate_source?: Database["public"]["Enums"]["comp_rate_source"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bonus_transport_hourly_rate?: number | null
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          default_daily_rate?: number | null
          default_half_day_rate?: number | null
          default_hourly_rate?: number | null
          default_ride_rate_regular?: number | null
          default_ride_rate_special?: number | null
          double_pay_hourly_rate?: number | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          hourly_rate_last_verified_at?: string | null
          hourly_rate_override_manual?: boolean | null
          id?: string
          inferred_hourly_confidence?: string | null
          inferred_hourly_rate?: number | null
          inferred_hourly_source?: string | null
          is_active?: boolean
          kitchen_hourly_rate?: number | null
          notes?: string | null
          overtime_hourly_rate?: number | null
          payment_mode?: Database["public"]["Enums"]["payment_mode_type"]
          previous_inferred_rate?: number | null
          rate_source?: Database["public"]["Enums"]["comp_rate_source"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compensation_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
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
          {
            foreignKeyName: "concepts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "contractor_w9_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "conversation_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      dispatch_logs: {
        Row: {
          action_type: string
          candidates_json: Json
          company_id: string
          confidence: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          executed_assignments: Json | null
          id: string
          outcome: string | null
          reason: string | null
          shift_id: string | null
          status: string
          updated_at: string
          zone: string | null
        }
        Insert: {
          action_type: string
          candidates_json?: Json
          company_id: string
          confidence: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          executed_assignments?: Json | null
          id?: string
          outcome?: string | null
          reason?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
          zone?: string | null
        }
        Update: {
          action_type?: string
          candidates_json?: Json
          company_id?: string
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          executed_assignments?: Json | null
          id?: string
          outcome?: string | null
          reason?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_logs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_aliases: {
        Row: {
          alias_name: string
          alias_name_normalized: string
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          source: string
        }
        Insert: {
          alias_name: string
          alias_name_normalized: string
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          source?: string
        }
        Update: {
          alias_name?: string
          alias_name_normalized?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_aliases_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_aliases_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_archive_records: {
        Row: {
          archived_by: string
          company_id: string
          created_at: string
          effective_date: string
          eligible_for_rehire: boolean | null
          employee_id: string
          id: string
          notes: string | null
          reason: string
        }
        Insert: {
          archived_by: string
          company_id: string
          created_at?: string
          effective_date?: string
          eligible_for_rehire?: boolean | null
          employee_id: string
          id?: string
          notes?: string | null
          reason: string
        }
        Update: {
          archived_by?: string
          company_id?: string
          created_at?: string
          effective_date?: string
          eligible_for_rehire?: boolean | null
          employee_id?: string
          id?: string
          notes?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_archive_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_archive_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_archive_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_archive_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "employee_availability_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "employee_availability_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "employee_badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          rejection_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
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
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
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
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
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
            foreignKeyName: "employee_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      employee_financial_attachments: {
        Row: {
          company_id: string
          file_name: string
          file_path: string
          file_type: string | null
          id: string
          record_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          company_id: string
          file_name: string
          file_path: string
          file_type?: string | null
          id?: string
          record_id: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          company_id?: string
          file_name?: string
          file_path?: string
          file_type?: string | null
          id?: string
          record_id?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_financial_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_attachments_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "employee_financial_records"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_financial_ledger: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          company_id: string
          created_at: string
          created_by: string
          employee_id: string
          id: string
          metadata: Json | null
          note: string | null
          period_id: string | null
          record_id: string
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["financial_transaction_type"]
        }
        Insert: {
          amount?: number
          balance_after?: number
          balance_before?: number
          company_id: string
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          metadata?: Json | null
          note?: string | null
          period_id?: string | null
          record_id: string
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["financial_transaction_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          company_id?: string
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          metadata?: Json | null
          note?: string | null
          period_id?: string | null
          record_id?: string
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["financial_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "employee_financial_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_ledger_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_ledger_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_ledger_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_ledger_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "employee_financial_records"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_financial_records: {
        Row: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          attachment_count: number
          auto_deduct_enabled: boolean
          balance_remaining: number
          category: Database["public"]["Enums"]["financial_category"]
          company_id: string
          company_policy_snapshot: Json | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          employee_id: string
          employee_visible_notes: string | null
          expected_end_date: string | null
          fixed_amount_per_cut: number | null
          id: string
          is_transport_related: boolean
          issue_date: string
          linked_period_id: string | null
          linked_shift_id: string | null
          maximum_payment_per_cut: number | null
          metadata: Json | null
          minimum_payment: number | null
          notes_internal: string | null
          original_amount: number
          payment_source:
            | Database["public"]["Enums"]["payment_source_method"]
            | null
          percentage_per_cut: number | null
          priority_order: number | null
          protect_minimum_net_pay: boolean
          protect_negative_payroll: boolean
          record_type: Database["public"]["Enums"]["financial_record_type"]
          reference_code: string
          repayment_mode: Database["public"]["Enums"]["repayment_mode"]
          repayment_start_date: string | null
          status: Database["public"]["Enums"]["financial_record_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachment_count?: number
          auto_deduct_enabled?: boolean
          balance_remaining?: number
          category?: Database["public"]["Enums"]["financial_category"]
          company_id: string
          company_policy_snapshot?: Json | null
          created_at?: string
          created_by: string
          currency?: string
          deleted_at?: string | null
          employee_id: string
          employee_visible_notes?: string | null
          expected_end_date?: string | null
          fixed_amount_per_cut?: number | null
          id?: string
          is_transport_related?: boolean
          issue_date?: string
          linked_period_id?: string | null
          linked_shift_id?: string | null
          maximum_payment_per_cut?: number | null
          metadata?: Json | null
          minimum_payment?: number | null
          notes_internal?: string | null
          original_amount: number
          payment_source?:
            | Database["public"]["Enums"]["payment_source_method"]
            | null
          percentage_per_cut?: number | null
          priority_order?: number | null
          protect_minimum_net_pay?: boolean
          protect_negative_payroll?: boolean
          record_type: Database["public"]["Enums"]["financial_record_type"]
          reference_code?: string
          repayment_mode?: Database["public"]["Enums"]["repayment_mode"]
          repayment_start_date?: string | null
          status?: Database["public"]["Enums"]["financial_record_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachment_count?: number
          auto_deduct_enabled?: boolean
          balance_remaining?: number
          category?: Database["public"]["Enums"]["financial_category"]
          company_id?: string
          company_policy_snapshot?: Json | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          employee_id?: string
          employee_visible_notes?: string | null
          expected_end_date?: string | null
          fixed_amount_per_cut?: number | null
          id?: string
          is_transport_related?: boolean
          issue_date?: string
          linked_period_id?: string | null
          linked_shift_id?: string | null
          maximum_payment_per_cut?: number | null
          metadata?: Json | null
          minimum_payment?: number | null
          notes_internal?: string | null
          original_amount?: number
          payment_source?:
            | Database["public"]["Enums"]["payment_source_method"]
            | null
          percentage_per_cut?: number | null
          priority_order?: number | null
          protect_minimum_net_pay?: boolean
          protect_negative_payroll?: boolean
          record_type?: Database["public"]["Enums"]["financial_record_type"]
          reference_code?: string
          repayment_mode?: Database["public"]["Enums"]["repayment_mode"]
          repayment_start_date?: string | null
          status?: Database["public"]["Enums"]["financial_record_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_financial_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_records_linked_period_id_fkey"
            columns: ["linked_period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_invitations: {
        Row: {
          accepted_at: string | null
          attempts: number
          bounce_reason: string | null
          channel: string
          company_id: string
          created_at: string
          delivered_at: string | null
          employee_id: string
          expires_at: string | null
          failed_at: string | null
          id: string
          invite_recipient: string | null
          invite_token: string
          last_attempt_at: string | null
          last_error: string | null
          metadata: Json | null
          notes: string | null
          opened_at: string | null
          provider_message_id: string | null
          sent_at: string
          sent_by: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          attempts?: number
          bounce_reason?: string | null
          channel?: string
          company_id: string
          created_at?: string
          delivered_at?: string | null
          employee_id: string
          expires_at?: string | null
          failed_at?: string | null
          id?: string
          invite_recipient?: string | null
          invite_token?: string
          last_attempt_at?: string | null
          last_error?: string | null
          metadata?: Json | null
          notes?: string | null
          opened_at?: string | null
          provider_message_id?: string | null
          sent_at?: string
          sent_by: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          bounce_reason?: string | null
          channel?: string
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          employee_id?: string
          expires_at?: string | null
          failed_at?: string | null
          id?: string
          invite_recipient?: string | null
          invite_token?: string
          last_attempt_at?: string | null
          last_error?: string | null
          metadata?: Json | null
          notes?: string | null
          opened_at?: string | null
          provider_message_id?: string | null
          sent_at?: string
          sent_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_employee_id_fkey"
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
            foreignKeyName: "employee_location_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      employee_onboarding_documents: {
        Row: {
          company_id: string
          created_at: string
          document_type: string
          employee_id: string
          file_name: string | null
          file_url: string
          id: string
          notes: string | null
          status: string
          uploaded_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          document_type: string
          employee_id: string
          file_name?: string | null
          file_url: string
          id?: string
          notes?: string | null
          status?: string
          uploaded_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          document_type?: string
          employee_id?: string
          file_name?: string | null
          file_url?: string
          id?: string
          notes?: string | null
          status?: string
          uploaded_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
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
            foreignKeyName: "employee_portal_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      employee_status: {
        Row: {
          company_id: string
          employee_id: string
          id: string
          last_seen_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          employee_id: string
          id?: string
          last_seen_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          employee_id?: string
          id?: string
          last_seen_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_status_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_status_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
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
            foreignKeyName: "employee_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          address_city: string | null
          address_line: string | null
          address_state: string | null
          address_zip: string | null
          approx_latitude: number | null
          approx_longitude: number | null
          available_for_work: boolean
          avatar_url: string | null
          birthday: string | null
          can_drive: boolean | null
          certifications: string[] | null
          company_id: string
          connecteam_employee_id: string | null
          country_code: string | null
          county: string | null
          created_at: string
          created_from_reconciliation: boolean | null
          date_added: string | null
          date_of_birth: string | null
          deleted_at: string | null
          direct_manager: string | null
          driver_licence: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_role: string | null
          employer_identification: string | null
          end_date: string | null
          english_level: string | null
          first_name: string
          gender: string | null
          groups: string | null
          has_car: string | null
          has_vehicle: boolean | null
          id: string
          is_active: boolean
          languages: string[] | null
          last_login: string | null
          last_name: string
          must_change_pin: boolean
          onboarding_completed_at: string | null
          onboarding_status: string | null
          passport_public: boolean
          phone_number: string | null
          portal_access_enabled: boolean
          professional_summary: string | null
          profile_status: Database["public"]["Enums"]["employee_profile_status"]
          qualify: string | null
          recommended_by: string | null
          service_category_ids: string[] | null
          skills: string[] | null
          ssn_last4: string | null
          start_date: string | null
          tags: string | null
          updated_at: string
          user_id: string | null
          verification_ssn_ein: string | null
          years_experience: number | null
        }
        Insert: {
          access_pin?: string | null
          added_by?: string | null
          added_via?: string | null
          address?: string | null
          address_city?: string | null
          address_line?: string | null
          address_state?: string | null
          address_zip?: string | null
          approx_latitude?: number | null
          approx_longitude?: number | null
          available_for_work?: boolean
          avatar_url?: string | null
          birthday?: string | null
          can_drive?: boolean | null
          certifications?: string[] | null
          company_id?: string
          connecteam_employee_id?: string | null
          country_code?: string | null
          county?: string | null
          created_at?: string
          created_from_reconciliation?: boolean | null
          date_added?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          direct_manager?: string | null
          driver_licence?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_role?: string | null
          employer_identification?: string | null
          end_date?: string | null
          english_level?: string | null
          first_name: string
          gender?: string | null
          groups?: string | null
          has_car?: string | null
          has_vehicle?: boolean | null
          id?: string
          is_active?: boolean
          languages?: string[] | null
          last_login?: string | null
          last_name: string
          must_change_pin?: boolean
          onboarding_completed_at?: string | null
          onboarding_status?: string | null
          passport_public?: boolean
          phone_number?: string | null
          portal_access_enabled?: boolean
          professional_summary?: string | null
          profile_status?: Database["public"]["Enums"]["employee_profile_status"]
          qualify?: string | null
          recommended_by?: string | null
          service_category_ids?: string[] | null
          skills?: string[] | null
          ssn_last4?: string | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string
          user_id?: string | null
          verification_ssn_ein?: string | null
          years_experience?: number | null
        }
        Update: {
          access_pin?: string | null
          added_by?: string | null
          added_via?: string | null
          address?: string | null
          address_city?: string | null
          address_line?: string | null
          address_state?: string | null
          address_zip?: string | null
          approx_latitude?: number | null
          approx_longitude?: number | null
          available_for_work?: boolean
          avatar_url?: string | null
          birthday?: string | null
          can_drive?: boolean | null
          certifications?: string[] | null
          company_id?: string
          connecteam_employee_id?: string | null
          country_code?: string | null
          county?: string | null
          created_at?: string
          created_from_reconciliation?: boolean | null
          date_added?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          direct_manager?: string | null
          driver_licence?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_role?: string | null
          employer_identification?: string | null
          end_date?: string | null
          english_level?: string | null
          first_name?: string
          gender?: string | null
          groups?: string | null
          has_car?: string | null
          has_vehicle?: boolean | null
          id?: string
          is_active?: boolean
          languages?: string[] | null
          last_login?: string | null
          last_name?: string
          must_change_pin?: boolean
          onboarding_completed_at?: string | null
          onboarding_status?: string | null
          passport_public?: boolean
          phone_number?: string | null
          portal_access_enabled?: boolean
          professional_summary?: string | null
          profile_status?: Database["public"]["Enums"]["employee_profile_status"]
          qualify?: string | null
          recommended_by?: string | null
          service_category_ids?: string[] | null
          skills?: string[] | null
          ssn_last4?: string | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string
          user_id?: string | null
          verification_ssn_ein?: string | null
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
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_job_responses: {
        Row: {
          flash_job_id: string
          id: string
          message: string | null
          responded_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          flash_job_id: string
          id?: string
          message?: string | null
          responded_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          flash_job_id?: string
          id?: string
          message?: string | null
          responded_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_job_responses_flash_job_id_fkey"
            columns: ["flash_job_id"]
            isOneToOne: false
            referencedRelation: "flash_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_jobs: {
        Row: {
          category: string
          channel_id: string | null
          company_id: string | null
          created_at: string
          description: string | null
          end_time: string | null
          expires_at: string
          id: string
          job_date: string
          location: string | null
          pay_amount: number | null
          pay_type: string
          posted_by: string
          requirements: string[] | null
          slots_filled: number
          slots_total: number
          start_time: string | null
          status: string
          title: string
          updated_at: string
          urgency_level: string
          zone: string | null
        }
        Insert: {
          category?: string
          channel_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          expires_at: string
          id?: string
          job_date: string
          location?: string | null
          pay_amount?: number | null
          pay_type?: string
          posted_by: string
          requirements?: string[] | null
          slots_filled?: number
          slots_total?: number
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
          urgency_level?: string
          zone?: string | null
        }
        Update: {
          category?: string
          channel_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          expires_at?: string
          id?: string
          job_date?: string
          location?: string | null
          pay_amount?: number | null
          pay_type?: string
          posted_by?: string
          requirements?: string[] | null
          slots_filled?: number
          slots_total?: number
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          urgency_level?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flash_jobs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flash_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flash_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      front_desk_devices: {
        Row: {
          company_id: string
          created_at: string
          device_name: string
          id: string
          is_active: boolean
          last_used_at: string | null
          location: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          device_name: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          location?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          device_name?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          location?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "front_desk_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "front_desk_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      hourly_rate_inference_evidence: {
        Row: {
          company_id: string
          compensation_profile_id: string | null
          confidence: string
          created_at: string
          employee_id: string
          id: string
          imported_at: string
          inferred_rate: number
          is_active: boolean
          match_method: string
          source_amount: number | null
          source_file: string | null
          source_qty: number | null
          source_rate: number | null
          source_record_label: string | null
          source_work_date: string | null
        }
        Insert: {
          company_id: string
          compensation_profile_id?: string | null
          confidence?: string
          created_at?: string
          employee_id: string
          id?: string
          imported_at?: string
          inferred_rate: number
          is_active?: boolean
          match_method?: string
          source_amount?: number | null
          source_file?: string | null
          source_qty?: number | null
          source_rate?: number | null
          source_record_label?: string | null
          source_work_date?: string | null
        }
        Update: {
          company_id?: string
          compensation_profile_id?: string | null
          confidence?: string
          created_at?: string
          employee_id?: string
          id?: string
          imported_at?: string
          inferred_rate?: number
          is_active?: boolean
          match_method?: string
          source_amount?: number | null
          source_file?: string | null
          source_qty?: number | null
          source_rate?: number | null
          source_record_label?: string | null
          source_work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hourly_rate_inference_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hourly_rate_inference_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hourly_rate_inference_evidence_compensation_profile_id_fkey"
            columns: ["compensation_profile_id"]
            isOneToOne: false
            referencedRelation: "compensation_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hourly_rate_inference_evidence_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hourly_rate_inference_evidence_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_log: {
        Row: {
          affected_company: string | null
          category: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          evidence: string | null
          fix_applied: string | null
          id: string
          item_type: string | null
          module: string | null
          notes: string | null
          origin: string | null
          priority: string | null
          prompt_ref: string | null
          responsible: string | null
          root_cause: string | null
          sprint: string | null
          status: string
          target_date: string | null
          title: string
          updated_at: string
          validation_required: string | null
        }
        Insert: {
          affected_company?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          evidence?: string | null
          fix_applied?: string | null
          id?: string
          item_type?: string | null
          module?: string | null
          notes?: string | null
          origin?: string | null
          priority?: string | null
          prompt_ref?: string | null
          responsible?: string | null
          root_cause?: string | null
          sprint?: string | null
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
          validation_required?: string | null
        }
        Update: {
          affected_company?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          evidence?: string | null
          fix_applied?: string | null
          id?: string
          item_type?: string | null
          module?: string | null
          notes?: string | null
          origin?: string | null
          priority?: string | null
          prompt_ref?: string | null
          responsible?: string | null
          root_cause?: string | null
          sprint?: string | null
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          validation_required?: string | null
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          audit_notes: string | null
          batch_type: string
          company_id: string
          created_at: string
          created_by: string
          date_range_from: string | null
          date_range_to: string | null
          errors: Json | null
          id: string
          is_legacy: boolean
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
          audit_notes?: string | null
          batch_type?: string
          company_id: string
          created_at?: string
          created_by: string
          date_range_from?: string | null
          date_range_to?: string | null
          errors?: Json | null
          id?: string
          is_legacy?: boolean
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
          audit_notes?: string | null
          batch_type?: string
          company_id?: string
          created_at?: string
          created_by?: string
          date_range_from?: string | null
          date_range_to?: string | null
          errors?: Json | null
          id?: string
          is_legacy?: boolean
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
          {
            foreignKeyName: "import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "internal_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      invoice_activity_log: {
        Row: {
          action: Database["public"]["Enums"]["invoice_activity_action"]
          actor_user_id: string | null
          company_id: string
          created_at: string
          id: string
          invoice_id: string
          new_values_json: Json | null
          notes: string | null
          old_values_json: Json | null
        }
        Insert: {
          action: Database["public"]["Enums"]["invoice_activity_action"]
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          invoice_id: string
          new_values_json?: Json | null
          notes?: string | null
          old_values_json?: Json | null
        }
        Update: {
          action?: Database["public"]["Enums"]["invoice_activity_action"]
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          new_values_json?: Json | null
          notes?: string | null
          old_values_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_activity_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_order: number
          line_type: Database["public"]["Enums"]["invoice_line_type"]
          metadata_json: Json
          qty: number
          rate: number
          source_service_block_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id: string
          line_order?: number
          line_type?: Database["public"]["Enums"]["invoice_line_type"]
          metadata_json?: Json
          qty?: number
          rate?: number
          source_service_block_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_order?: number
          line_type?: Database["public"]["Enums"]["invoice_line_type"]
          metadata_json?: Json
          qty?: number
          rate?: number
          source_service_block_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_source_service_block_id_fkey"
            columns: ["source_service_block_id"]
            isOneToOne: false
            referencedRelation: "billable_service_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["invoice_payment_method"]
          notes: string | null
          payment_date: string
          reference_number: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["invoice_payment_method"]
          notes?: string | null
          payment_date?: string
          reference_number?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["invoice_payment_method"]
          notes?: string | null
          payment_date?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          adjustment_total: number
          amount_paid: number
          balance_due: number
          client_id: string
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          due_date: string | null
          finalized_at: string | null
          footer_message: string | null
          id: string
          invoice_date: string
          invoice_number: number
          notes: string | null
          paid_at: string | null
          payment_instructions: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subject: string | null
          subtotal: number
          tax_total: number
          terms: string | null
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          adjustment_total?: number
          amount_paid?: number
          balance_due?: number
          client_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_date?: string | null
          finalized_at?: string | null
          footer_message?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: number
          notes?: string | null
          paid_at?: string | null
          payment_instructions?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subject?: string | null
          subtotal?: number
          tax_total?: number
          terms?: string | null
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          adjustment_total?: number
          amount_paid?: number
          balance_due?: number
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_date?: string | null
          finalized_at?: string | null
          footer_message?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: number
          notes?: string | null
          paid_at?: string | null
          payment_instructions?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subject?: string | null
          subtotal?: number
          tax_total?: number
          terms?: string | null
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey1"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "billing_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey1"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey1"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          address_city: string | null
          address_line: string | null
          address_state: string | null
          address_zip: string | null
          admin_notes: string | null
          application_type: string
          approval_payload: Json | null
          approved_employee_id: string | null
          availability: string | null
          can_drive: boolean | null
          can_travel: boolean | null
          city: string | null
          company_id: string
          created_at: string
          document_url: string | null
          draft_data: Json | null
          duplicate_of_application_id: string | null
          duplicate_of_user_id: string | null
          email: string | null
          emergency_contact: string | null
          experience_summary: string | null
          first_name: string
          formatted_address: string | null
          has_car: boolean | null
          id: string
          languages: string[] | null
          last_name: string
          linked_user_id: string | null
          notes: string | null
          phone: string
          reference_code: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role_suggestion: string | null
          source: string | null
          ssn_last4: string | null
          status: string
          updated_at: string
          worker_type: string
        }
        Insert: {
          address_city?: string | null
          address_line?: string | null
          address_state?: string | null
          address_zip?: string | null
          admin_notes?: string | null
          application_type?: string
          approval_payload?: Json | null
          approved_employee_id?: string | null
          availability?: string | null
          can_drive?: boolean | null
          can_travel?: boolean | null
          city?: string | null
          company_id: string
          created_at?: string
          document_url?: string | null
          draft_data?: Json | null
          duplicate_of_application_id?: string | null
          duplicate_of_user_id?: string | null
          email?: string | null
          emergency_contact?: string | null
          experience_summary?: string | null
          first_name: string
          formatted_address?: string | null
          has_car?: boolean | null
          id?: string
          languages?: string[] | null
          last_name: string
          linked_user_id?: string | null
          notes?: string | null
          phone: string
          reference_code?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_suggestion?: string | null
          source?: string | null
          ssn_last4?: string | null
          status?: string
          updated_at?: string
          worker_type?: string
        }
        Update: {
          address_city?: string | null
          address_line?: string | null
          address_state?: string | null
          address_zip?: string | null
          admin_notes?: string | null
          application_type?: string
          approval_payload?: Json | null
          approved_employee_id?: string | null
          availability?: string | null
          can_drive?: boolean | null
          can_travel?: boolean | null
          city?: string | null
          company_id?: string
          created_at?: string
          document_url?: string | null
          draft_data?: Json | null
          duplicate_of_application_id?: string | null
          duplicate_of_user_id?: string | null
          email?: string | null
          emergency_contact?: string | null
          experience_summary?: string | null
          first_name?: string
          formatted_address?: string | null
          has_car?: boolean | null
          id?: string
          languages?: string[] | null
          last_name?: string
          linked_user_id?: string | null
          notes?: string | null
          phone?: string
          reference_code?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_suggestion?: string | null
          source?: string | null
          ssn_last4?: string | null
          status?: string
          updated_at?: string
          worker_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_approved_employee_id_fkey"
            columns: ["approved_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_approved_employee_id_fkey"
            columns: ["approved_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_duplicate_of_application_id_fkey"
            columns: ["duplicate_of_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosk_devices: {
        Row: {
          company_id: string
          created_at: string
          device_identifier: string
          id: string
          is_active: boolean
          location_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          device_identifier?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          device_identifier?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_invoice_line_items: {
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
            foreignKeyName: "invoice_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            referencedRelation: "legacy_invoices"
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
      legacy_invoices: {
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
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      location_events: {
        Row: {
          accuracy_meters: number | null
          company_id: string | null
          context_id: string | null
          context_type:
            | Database["public"]["Enums"]["location_context_type_enum"]
            | null
          created_at: string
          details: Json
          distance_meters: number | null
          event_type: Database["public"]["Enums"]["location_event_type_enum"]
          id: string
          latitude: number | null
          location_v2_id: string | null
          longitude: number | null
          occurred_at: string
          session_id: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["location_subject_type_enum"]
        }
        Insert: {
          accuracy_meters?: number | null
          company_id?: string | null
          context_id?: string | null
          context_type?:
            | Database["public"]["Enums"]["location_context_type_enum"]
            | null
          created_at?: string
          details?: Json
          distance_meters?: number | null
          event_type: Database["public"]["Enums"]["location_event_type_enum"]
          id?: string
          latitude?: number | null
          location_v2_id?: string | null
          longitude?: number | null
          occurred_at?: string
          session_id?: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["location_subject_type_enum"]
        }
        Update: {
          accuracy_meters?: number | null
          company_id?: string | null
          context_id?: string | null
          context_type?:
            | Database["public"]["Enums"]["location_context_type_enum"]
            | null
          created_at?: string
          details?: Json
          distance_meters?: number | null
          event_type?: Database["public"]["Enums"]["location_event_type_enum"]
          id?: string
          latitude?: number | null
          location_v2_id?: string | null
          longitude?: number | null
          occurred_at?: string
          session_id?: string | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["location_subject_type_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "location_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_events_location_v2_id_fkey"
            columns: ["location_v2_id"]
            isOneToOne: false
            referencedRelation: "locations_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "location_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      location_presence: {
        Row: {
          accuracy_meters: number | null
          company_id: string | null
          context_id: string | null
          context_type:
            | Database["public"]["Enums"]["location_context_type_enum"]
            | null
          current_lat: number
          current_lng: number
          heading: number | null
          id: string
          is_active: boolean
          last_seen_at: string
          metadata: Json
          recorded_at: string
          session_id: string | null
          source: string | null
          speed_mps: number | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["location_subject_type_enum"]
          updated_at: string
        }
        Insert: {
          accuracy_meters?: number | null
          company_id?: string | null
          context_id?: string | null
          context_type?:
            | Database["public"]["Enums"]["location_context_type_enum"]
            | null
          current_lat: number
          current_lng: number
          heading?: number | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          metadata?: Json
          recorded_at?: string
          session_id?: string | null
          source?: string | null
          speed_mps?: number | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["location_subject_type_enum"]
          updated_at?: string
        }
        Update: {
          accuracy_meters?: number | null
          company_id?: string | null
          context_id?: string | null
          context_type?:
            | Database["public"]["Enums"]["location_context_type_enum"]
            | null
          current_lat?: number
          current_lng?: number
          heading?: number | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          metadata?: Json
          recorded_at?: string
          session_id?: string | null
          source?: string | null
          speed_mps?: number | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["location_subject_type_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_presence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_presence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_presence_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "location_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      location_sessions: {
        Row: {
          company_id: string | null
          context_id: string | null
          context_type: Database["public"]["Enums"]["location_context_type_enum"]
          created_at: string
          device: string | null
          expires_at: string | null
          id: string
          metadata: Json
          source: string | null
          started_at: string
          status: Database["public"]["Enums"]["location_session_status_enum"]
          stopped_at: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["location_subject_type_enum"]
        }
        Insert: {
          company_id?: string | null
          context_id?: string | null
          context_type?: Database["public"]["Enums"]["location_context_type_enum"]
          created_at?: string
          device?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          source?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["location_session_status_enum"]
          stopped_at?: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["location_subject_type_enum"]
        }
        Update: {
          company_id?: string | null
          context_id?: string | null
          context_type?: Database["public"]["Enums"]["location_context_type_enum"]
          created_at?: string
          device?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          source?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["location_session_status_enum"]
          stopped_at?: string | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["location_subject_type_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "location_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          default_clock_method: string | null
          default_instructions: string | null
          default_pay_type: string | null
          deleted_at: string | null
          deleted_by: string | null
          geofence_lat: number | null
          geofence_lng: number | null
          geofence_radius: number | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          require_car: boolean | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_clock_method?: string | null
          default_instructions?: string | null
          default_pay_type?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          require_car?: boolean | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_clock_method?: string | null
          default_instructions?: string | null
          default_pay_type?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          require_car?: boolean | null
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
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      locations_v2: {
        Row: {
          access_notes: string | null
          address_line1: string | null
          address_line2: string | null
          arrival_notes: string | null
          city: string | null
          company_id: string
          contact_on_site: string | null
          country: string | null
          created_at: string
          created_by: string | null
          formatted_address: string | null
          geofence_radius_meters: number | null
          id: string
          is_active: boolean
          latitude: number | null
          location_type: Database["public"]["Enums"]["location_type_enum"]
          longitude: number | null
          metadata: Json
          name: string | null
          parking_notes: string | null
          place_id: string | null
          postal_code: string | null
          state: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          address_line1?: string | null
          address_line2?: string | null
          arrival_notes?: string | null
          city?: string | null
          company_id: string
          contact_on_site?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          formatted_address?: string | null
          geofence_radius_meters?: number | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          location_type?: Database["public"]["Enums"]["location_type_enum"]
          longitude?: number | null
          metadata?: Json
          name?: string | null
          parking_notes?: string | null
          place_id?: string | null
          postal_code?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          address_line1?: string | null
          address_line2?: string | null
          arrival_notes?: string | null
          city?: string | null
          company_id?: string
          contact_on_site?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          formatted_address?: string | null
          geofence_radius_meters?: number | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          location_type?: Database["public"]["Enums"]["location_type_enum"]
          longitude?: number | null
          metadata?: Json
          name?: string | null
          parking_notes?: string | null
          place_id?: string | null
          postal_code?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_v2_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_v2_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      migration_clock_mapping: {
        Row: {
          company_id: string
          connecteam_data: Json
          connecteam_ref: string
          created_at: string
          id: string
          match_status: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          stafly_clock_event_id: string | null
          stafly_time_entry_id: string | null
          tolerance_minutes: number | null
          variance_data: Json | null
        }
        Insert: {
          company_id: string
          connecteam_data?: Json
          connecteam_ref: string
          created_at?: string
          id?: string
          match_status?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stafly_clock_event_id?: string | null
          stafly_time_entry_id?: string | null
          tolerance_minutes?: number | null
          variance_data?: Json | null
        }
        Update: {
          company_id?: string
          connecteam_data?: Json
          connecteam_ref?: string
          created_at?: string
          id?: string
          match_status?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stafly_clock_event_id?: string | null
          stafly_time_entry_id?: string | null
          tolerance_minutes?: number | null
          variance_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_clock_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_clock_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_clock_mapping_stafly_clock_event_id_fkey"
            columns: ["stafly_clock_event_id"]
            isOneToOne: false
            referencedRelation: "clock_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_clock_mapping_stafly_time_entry_id_fkey"
            columns: ["stafly_time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_employee_mapping: {
        Row: {
          company_id: string
          connecteam_email: string | null
          connecteam_name: string | null
          connecteam_phone: string | null
          connecteam_ref: string | null
          created_at: string
          id: string
          match_confidence: number | null
          match_method: string | null
          match_status: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          stafly_employee_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          connecteam_email?: string | null
          connecteam_name?: string | null
          connecteam_phone?: string | null
          connecteam_ref?: string | null
          created_at?: string
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          match_status?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stafly_employee_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          connecteam_email?: string | null
          connecteam_name?: string | null
          connecteam_phone?: string | null
          connecteam_ref?: string | null
          created_at?: string
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          match_status?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stafly_employee_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_employee_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_employee_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_employee_mapping_stafly_employee_id_fkey"
            columns: ["stafly_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_employee_mapping_stafly_employee_id_fkey"
            columns: ["stafly_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_exceptions: {
        Row: {
          assigned_to: string | null
          company_id: string
          created_at: string
          exception_type: string
          id: string
          period_reconciliation_id: string | null
          resolution_action: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_data: Json | null
          source_record_ref: string | null
          source_record_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          created_at?: string
          exception_type: string
          id?: string
          period_reconciliation_id?: string | null
          resolution_action?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_data?: Json | null
          source_record_ref?: string | null
          source_record_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          exception_type?: string
          id?: string
          period_reconciliation_id?: string | null
          resolution_action?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_data?: Json | null
          source_record_ref?: string | null
          source_record_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_exceptions_period_reconciliation_id_fkey"
            columns: ["period_reconciliation_id"]
            isOneToOne: false
            referencedRelation: "migration_period_reconciliation"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_location_mapping: {
        Row: {
          company_id: string
          connecteam_address: string | null
          connecteam_name: string | null
          connecteam_ref: string
          created_at: string
          id: string
          match_status: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          stafly_location_id: string | null
        }
        Insert: {
          company_id: string
          connecteam_address?: string | null
          connecteam_name?: string | null
          connecteam_ref: string
          created_at?: string
          id?: string
          match_status?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stafly_location_id?: string | null
        }
        Update: {
          company_id?: string
          connecteam_address?: string | null
          connecteam_name?: string | null
          connecteam_ref?: string
          created_at?: string
          id?: string
          match_status?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stafly_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_location_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_location_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_location_mapping_stafly_location_id_fkey"
            columns: ["stafly_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_normalized_records: {
        Row: {
          company_id: string
          created_at: string
          id: string
          match_status: string
          normalized_payload: Json
          raw_import_id: string | null
          record_type: string
          source_reference: string | null
          stafly_entity_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          match_status?: string
          normalized_payload?: Json
          raw_import_id?: string | null
          record_type: string
          source_reference?: string | null
          stafly_entity_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          match_status?: string
          normalized_payload?: Json
          raw_import_id?: string | null
          record_type?: string
          source_reference?: string | null
          stafly_entity_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_normalized_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_normalized_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_normalized_records_raw_import_id_fkey"
            columns: ["raw_import_id"]
            isOneToOne: false
            referencedRelation: "migration_raw_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_period_reconciliation: {
        Row: {
          company_id: string
          connecteam_totals: Json | null
          created_at: string
          id: string
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          period_code: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          stafly_period_id: string | null
          stafly_totals: Json | null
          status: string
          total_variance: number | null
          unresolved_count: number | null
          updated_at: string
          variance_details: Json | null
          week_end: string
          week_start: string
        }
        Insert: {
          company_id: string
          connecteam_totals?: Json | null
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          period_code?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          stafly_period_id?: string | null
          stafly_totals?: Json | null
          status?: string
          total_variance?: number | null
          unresolved_count?: number | null
          updated_at?: string
          variance_details?: Json | null
          week_end: string
          week_start: string
        }
        Update: {
          company_id?: string
          connecteam_totals?: Json | null
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          period_code?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          stafly_period_id?: string | null
          stafly_totals?: Json | null
          status?: string
          total_variance?: number | null
          unresolved_count?: number | null
          updated_at?: string
          variance_details?: Json | null
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_period_reconciliation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_period_reconciliation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_period_reconciliation_stafly_period_id_fkey"
            columns: ["stafly_period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_pilot_status: {
        Row: {
          company_id: string
          created_at: string
          date_range_end: string | null
          date_range_start: string | null
          id: string
          notes: string | null
          phase: string
          readiness: string
          sync_active: boolean | null
          total_unresolved_issues: number | null
          total_weeks_imported: number | null
          total_weeks_reconciled: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          notes?: string | null
          phase?: string
          readiness?: string
          sync_active?: boolean | null
          total_unresolved_issues?: number | null
          total_weeks_imported?: number | null
          total_weeks_reconciled?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          notes?: string | null
          phase?: string
          readiness?: string
          sync_active?: boolean | null
          total_unresolved_issues?: number | null
          total_weeks_imported?: number | null
          total_weeks_reconciled?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_pilot_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_pilot_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_raw_imports: {
        Row: {
          company_id: string
          file_name: string | null
          id: string
          imported_at: string
          imported_by: string | null
          raw_payload: Json
          record_type: string
          row_index: number | null
          source_system: string
        }
        Insert: {
          company_id: string
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          raw_payload?: Json
          record_type: string
          row_index?: number | null
          source_system?: string
        }
        Update: {
          company_id?: string
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          raw_payload?: Json
          record_type?: string
          row_index?: number | null
          source_system?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_raw_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_raw_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_shift_mapping: {
        Row: {
          company_id: string
          connecteam_data: Json
          connecteam_ref: string
          created_at: string
          id: string
          match_status: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          stafly_shift_id: string | null
          variance_data: Json | null
        }
        Insert: {
          company_id: string
          connecteam_data?: Json
          connecteam_ref: string
          created_at?: string
          id?: string
          match_status?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stafly_shift_id?: string | null
          variance_data?: Json | null
        }
        Update: {
          company_id?: string
          connecteam_data?: Json
          connecteam_ref?: string
          created_at?: string
          id?: string
          match_status?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stafly_shift_id?: string | null
          variance_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_shift_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_shift_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_shift_mapping_stafly_shift_id_fkey"
            columns: ["stafly_shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
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
            foreignKeyName: "movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      normalized_clock_rows: {
        Row: {
          batch_id: string
          break_minutes: number | null
          client_name: string | null
          clock_in: string | null
          clock_method: string | null
          clock_out: string | null
          company_id: string
          conflict_details: Json | null
          created_at: string
          employee_email: string | null
          employee_match_confidence: number | null
          employee_match_method: string | null
          employee_name_normalized: string | null
          employee_name_raw: string | null
          employee_phone: string | null
          external_clock_id: string | null
          has_conflict: boolean | null
          id: string
          location_name: string | null
          matched_employee_id: string | null
          notes: string | null
          raw_row_id: string
          total_hours: number | null
          work_date: string | null
        }
        Insert: {
          batch_id: string
          break_minutes?: number | null
          client_name?: string | null
          clock_in?: string | null
          clock_method?: string | null
          clock_out?: string | null
          company_id: string
          conflict_details?: Json | null
          created_at?: string
          employee_email?: string | null
          employee_match_confidence?: number | null
          employee_match_method?: string | null
          employee_name_normalized?: string | null
          employee_name_raw?: string | null
          employee_phone?: string | null
          external_clock_id?: string | null
          has_conflict?: boolean | null
          id?: string
          location_name?: string | null
          matched_employee_id?: string | null
          notes?: string | null
          raw_row_id: string
          total_hours?: number | null
          work_date?: string | null
        }
        Update: {
          batch_id?: string
          break_minutes?: number | null
          client_name?: string | null
          clock_in?: string | null
          clock_method?: string | null
          clock_out?: string | null
          company_id?: string
          conflict_details?: Json | null
          created_at?: string
          employee_email?: string | null
          employee_match_confidence?: number | null
          employee_match_method?: string | null
          employee_name_normalized?: string | null
          employee_name_raw?: string | null
          employee_phone?: string | null
          external_clock_id?: string | null
          has_conflict?: boolean | null
          id?: string
          location_name?: string | null
          matched_employee_id?: string | null
          notes?: string | null
          raw_row_id?: string
          total_hours?: number | null
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "normalized_clock_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_clock_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_clock_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_clock_rows_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_clock_rows_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_clock_rows_raw_row_id_fkey"
            columns: ["raw_row_id"]
            isOneToOne: false
            referencedRelation: "raw_clock_import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      normalized_payroll_rows: {
        Row: {
          base_pay: number | null
          batch_id: string
          company_id: string
          conflict_details: Json | null
          created_at: string
          employee_email: string | null
          employee_match_confidence: number | null
          employee_match_method: string | null
          employee_name_normalized: string | null
          employee_name_raw: string | null
          employee_phone: string | null
          has_conflict: boolean | null
          hourly_rate: number | null
          id: string
          manual_amount: number | null
          matched_employee_id: string | null
          notes: string | null
          pay_type: string | null
          raw_row_id: string
          ride_amount: number | null
          total_hours: number | null
          total_pay: number | null
          weekend_amount: number | null
          work_date: string | null
        }
        Insert: {
          base_pay?: number | null
          batch_id: string
          company_id: string
          conflict_details?: Json | null
          created_at?: string
          employee_email?: string | null
          employee_match_confidence?: number | null
          employee_match_method?: string | null
          employee_name_normalized?: string | null
          employee_name_raw?: string | null
          employee_phone?: string | null
          has_conflict?: boolean | null
          hourly_rate?: number | null
          id?: string
          manual_amount?: number | null
          matched_employee_id?: string | null
          notes?: string | null
          pay_type?: string | null
          raw_row_id: string
          ride_amount?: number | null
          total_hours?: number | null
          total_pay?: number | null
          weekend_amount?: number | null
          work_date?: string | null
        }
        Update: {
          base_pay?: number | null
          batch_id?: string
          company_id?: string
          conflict_details?: Json | null
          created_at?: string
          employee_email?: string | null
          employee_match_confidence?: number | null
          employee_match_method?: string | null
          employee_name_normalized?: string | null
          employee_name_raw?: string | null
          employee_phone?: string | null
          has_conflict?: boolean | null
          hourly_rate?: number | null
          id?: string
          manual_amount?: number | null
          matched_employee_id?: string | null
          notes?: string | null
          pay_type?: string | null
          raw_row_id?: string
          ride_amount?: number | null
          total_hours?: number | null
          total_pay?: number | null
          weekend_amount?: number | null
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "normalized_payroll_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_payroll_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_payroll_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_payroll_rows_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_payroll_rows_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_payroll_rows_raw_row_id_fkey"
            columns: ["raw_row_id"]
            isOneToOne: false
            referencedRelation: "raw_payroll_import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      normalized_schedule_rows: {
        Row: {
          availability_status: string | null
          batch_id: string
          client_name: string | null
          company_id: string
          conflict_details: Json | null
          created_at: string
          employee_email: string | null
          employee_match_confidence: number | null
          employee_match_method: string | null
          employee_name_normalized: string | null
          employee_name_raw: string | null
          employee_phone: string | null
          end_time: string | null
          external_shift_id: string | null
          has_conflict: boolean | null
          id: string
          location_name: string | null
          matched_employee_id: string | null
          notes: string | null
          pay_type: string | null
          raw_row_id: string
          shift_title: string | null
          start_time: string | null
          total_hours: number | null
          work_date: string | null
        }
        Insert: {
          availability_status?: string | null
          batch_id: string
          client_name?: string | null
          company_id: string
          conflict_details?: Json | null
          created_at?: string
          employee_email?: string | null
          employee_match_confidence?: number | null
          employee_match_method?: string | null
          employee_name_normalized?: string | null
          employee_name_raw?: string | null
          employee_phone?: string | null
          end_time?: string | null
          external_shift_id?: string | null
          has_conflict?: boolean | null
          id?: string
          location_name?: string | null
          matched_employee_id?: string | null
          notes?: string | null
          pay_type?: string | null
          raw_row_id: string
          shift_title?: string | null
          start_time?: string | null
          total_hours?: number | null
          work_date?: string | null
        }
        Update: {
          availability_status?: string | null
          batch_id?: string
          client_name?: string | null
          company_id?: string
          conflict_details?: Json | null
          created_at?: string
          employee_email?: string | null
          employee_match_confidence?: number | null
          employee_match_method?: string | null
          employee_name_normalized?: string | null
          employee_name_raw?: string | null
          employee_phone?: string | null
          end_time?: string | null
          external_shift_id?: string | null
          has_conflict?: boolean | null
          id?: string
          location_name?: string | null
          matched_employee_id?: string | null
          notes?: string | null
          pay_type?: string | null
          raw_row_id?: string
          shift_title?: string | null
          start_time?: string | null
          total_hours?: number | null
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "normalized_schedule_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_schedule_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_schedule_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_schedule_rows_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_schedule_rows_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_schedule_rows_raw_row_id_fkey"
            columns: ["raw_row_id"]
            isOneToOne: false
            referencedRelation: "raw_schedule_import_rows"
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
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      office_visits: {
        Row: {
          attendant_name: string | null
          attended_by: string | null
          channel: string
          checked_in_at: string
          checked_out_at: string | null
          company_id: string
          created_at: string
          device_id: string | null
          documents_uploaded: number
          duration_seconds: number | null
          employee_id: string
          id: string
          language: string
          pending_count: number | null
          pending_items: Json | null
          photo_taken: boolean
          rating: Database["public"]["Enums"]["office_visit_rating"] | null
          rating_comment: string | null
          rating_score: number | null
          rating_submitted_at: string | null
          status: Database["public"]["Enums"]["office_visit_status"]
          updated_at: string
          updates_made: Json | null
          visit_detail: string | null
          visit_type: Database["public"]["Enums"]["office_visit_type"]
        }
        Insert: {
          attendant_name?: string | null
          attended_by?: string | null
          channel?: string
          checked_in_at?: string
          checked_out_at?: string | null
          company_id: string
          created_at?: string
          device_id?: string | null
          documents_uploaded?: number
          duration_seconds?: number | null
          employee_id: string
          id?: string
          language?: string
          pending_count?: number | null
          pending_items?: Json | null
          photo_taken?: boolean
          rating?: Database["public"]["Enums"]["office_visit_rating"] | null
          rating_comment?: string | null
          rating_score?: number | null
          rating_submitted_at?: string | null
          status?: Database["public"]["Enums"]["office_visit_status"]
          updated_at?: string
          updates_made?: Json | null
          visit_detail?: string | null
          visit_type?: Database["public"]["Enums"]["office_visit_type"]
        }
        Update: {
          attendant_name?: string | null
          attended_by?: string | null
          channel?: string
          checked_in_at?: string
          checked_out_at?: string | null
          company_id?: string
          created_at?: string
          device_id?: string | null
          documents_uploaded?: number
          duration_seconds?: number | null
          employee_id?: string
          id?: string
          language?: string
          pending_count?: number | null
          pending_items?: Json | null
          photo_taken?: boolean
          rating?: Database["public"]["Enums"]["office_visit_rating"] | null
          rating_comment?: string | null
          rating_score?: number | null
          rating_submitted_at?: string | null
          status?: Database["public"]["Enums"]["office_visit_status"]
          updated_at?: string
          updates_made?: Json | null
          visit_detail?: string | null
          visit_type?: Database["public"]["Enums"]["office_visit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "office_visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_visits_device_fk"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "front_desk_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_visits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_visits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      parceros_event_queue: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          retry_count: number
          sent_at: string | null
          status: string
          worker_profile_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json
          retry_count?: number
          sent_at?: string | null
          status?: string
          worker_profile_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          retry_count?: number
          sent_at?: string | null
          status?: string
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceros_event_queue_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
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
          calculation_mode: string
          calculation_mode_changed_at: string | null
          calculation_mode_changed_by: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          end_date: string
          id: string
          last_reconciled_at: string | null
          last_reconciliation_id: string | null
          paid_at: string | null
          paid_by: string | null
          published_at: string | null
          reconciliation_status: string | null
          sequence_number: number | null
          source_type: string
          start_date: string
          status: string
        }
        Insert: {
          calculation_mode?: string
          calculation_mode_changed_at?: string | null
          calculation_mode_changed_by?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          end_date: string
          id?: string
          last_reconciled_at?: string | null
          last_reconciliation_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          published_at?: string | null
          reconciliation_status?: string | null
          sequence_number?: number | null
          source_type?: string
          start_date: string
          status?: string
        }
        Update: {
          calculation_mode?: string
          calculation_mode_changed_at?: string | null
          calculation_mode_changed_by?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          last_reconciled_at?: string | null
          last_reconciliation_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          published_at?: string | null
          reconciliation_status?: string | null
          sequence_number?: number | null
          source_type?: string
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
          {
            foreignKeyName: "pay_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_periods_last_reconciliation_id_fkey"
            columns: ["last_reconciliation_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_period_status"
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
            foreignKeyName: "payroll_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      payroll_concept_mappings: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          match_field: string
          notes: string | null
          pattern: string
          priority: number
          target_type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_field?: string
          notes?: string | null
          pattern: string
          priority?: number
          target_type: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_field?: string
          notes?: string | null
          pattern?: string
          priority?: number
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_concept_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_concept_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_import_batches: {
        Row: {
          company_id: string
          errors_count: number
          file_name: string
          id: string
          imported_at: string
          imported_by: string
          notes: string | null
          processed_rows: number
          status: string
          total_rows: number
          warnings_count: number
        }
        Insert: {
          company_id: string
          errors_count?: number
          file_name: string
          id?: string
          imported_at?: string
          imported_by: string
          notes?: string | null
          processed_rows?: number
          status?: string
          total_rows?: number
          warnings_count?: number
        }
        Update: {
          company_id?: string
          errors_count?: number
          file_name?: string
          id?: string
          imported_at?: string
          imported_by?: string
          notes?: string | null
          processed_rows?: number
          status?: string
          total_rows?: number
          warnings_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_interpreted_entries: {
        Row: {
          approved_compensation_change: boolean
          company_id: string
          confidence_score: number | null
          created_at: string
          detected_daily_full_days: number | null
          detected_daily_half_days: number | null
          detected_daily_units: number | null
          detected_hourly_rate: number | null
          detected_manual_adjustment: number | null
          detected_ride_amount: number | null
          detected_ride_type: string | null
          employee_id: string | null
          id: string
          import_batch_id: string
          interpretation_notes: string | null
          interpreted_payment_type: Database["public"]["Enums"]["interpreted_payment_type"]
          raw_employee_name: string | null
          raw_row_payload_json: Json | null
          raw_total_amount: number | null
          suggested_compensation_change: boolean
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          approved_compensation_change?: boolean
          company_id: string
          confidence_score?: number | null
          created_at?: string
          detected_daily_full_days?: number | null
          detected_daily_half_days?: number | null
          detected_daily_units?: number | null
          detected_hourly_rate?: number | null
          detected_manual_adjustment?: number | null
          detected_ride_amount?: number | null
          detected_ride_type?: string | null
          employee_id?: string | null
          id?: string
          import_batch_id: string
          interpretation_notes?: string | null
          interpreted_payment_type?: Database["public"]["Enums"]["interpreted_payment_type"]
          raw_employee_name?: string | null
          raw_row_payload_json?: Json | null
          raw_total_amount?: number | null
          suggested_compensation_change?: boolean
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          approved_compensation_change?: boolean
          company_id?: string
          confidence_score?: number | null
          created_at?: string
          detected_daily_full_days?: number | null
          detected_daily_half_days?: number | null
          detected_daily_units?: number | null
          detected_hourly_rate?: number | null
          detected_manual_adjustment?: number | null
          detected_ride_amount?: number | null
          detected_ride_type?: string | null
          employee_id?: string | null
          id?: string
          import_batch_id?: string
          interpretation_notes?: string | null
          interpreted_payment_type?: Database["public"]["Enums"]["interpreted_payment_type"]
          raw_employee_name?: string | null
          raw_row_payload_json?: Json | null
          raw_total_amount?: number | null
          suggested_compensation_change?: boolean
          week_end?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_interpreted_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_interpreted_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_interpreted_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_interpreted_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_interpreted_entries_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "payroll_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_rate_snapshots: {
        Row: {
          company_id: string
          created_at: string
          daily_rate: number | null
          effective_date: string
          employee_id: string
          half_day_rate: number | null
          hourly_rate: number | null
          id: string
          payment_mode: Database["public"]["Enums"]["payment_mode_type"] | null
          ride_rate: number | null
          snapshot_reason: string | null
          source_record_id: string | null
          source_record_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          daily_rate?: number | null
          effective_date?: string
          employee_id: string
          half_day_rate?: number | null
          hourly_rate?: number | null
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode_type"] | null
          ride_rate?: number | null
          snapshot_reason?: string | null
          source_record_id?: string | null
          source_record_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          daily_rate?: number | null
          effective_date?: string
          employee_id?: string
          half_day_rate?: number | null
          hourly_rate?: number | null
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode_type"] | null
          ride_rate?: number | null
          snapshot_reason?: string | null
          source_record_id?: string | null
          source_record_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_rate_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_rate_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_rate_snapshots_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_rate_snapshots_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      period_base_pay: {
        Row: {
          anomaly_flags: Json | null
          base_total_pay: number
          company_id: string
          created_at: string
          employee_id: string
          id: string
          import_id: string | null
          is_anomalous: boolean | null
          period_id: string
          total_overtime: number | null
          total_paid_hours: number | null
          total_regular: number | null
          total_work_hours: number | null
          weekly_total_hours: number | null
        }
        Insert: {
          anomaly_flags?: Json | null
          base_total_pay?: number
          company_id?: string
          created_at?: string
          employee_id: string
          id?: string
          import_id?: string | null
          is_anomalous?: boolean | null
          period_id: string
          total_overtime?: number | null
          total_paid_hours?: number | null
          total_regular?: number | null
          total_work_hours?: number | null
          weekly_total_hours?: number | null
        }
        Update: {
          anomaly_flags?: Json | null
          base_total_pay?: number
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          import_id?: string | null
          is_anomalous?: boolean | null
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
            foreignKeyName: "period_base_pay_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "profile_access_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          switch_pin: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone_login_enabled?: boolean | null
          phone_number?: string | null
          switch_pin?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone_login_enabled?: boolean | null
          phone_number?: string | null
          switch_pin?: string | null
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
            foreignKeyName: "promo_redemptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      raw_clock_import_rows: {
        Row: {
          batch_id: string
          company_id: string
          created_at: string
          id: string
          is_duplicate: boolean | null
          raw_data: Json
          row_hash: string | null
          row_number: number
        }
        Insert: {
          batch_id: string
          company_id: string
          created_at?: string
          id?: string
          is_duplicate?: boolean | null
          raw_data: Json
          row_hash?: string | null
          row_number: number
        }
        Update: {
          batch_id?: string
          company_id?: string
          created_at?: string
          id?: string
          is_duplicate?: boolean | null
          raw_data?: Json
          row_hash?: string | null
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "raw_clock_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_clock_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_clock_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_payroll_import_rows: {
        Row: {
          batch_id: string
          company_id: string
          created_at: string
          id: string
          is_duplicate: boolean | null
          raw_data: Json
          row_hash: string | null
          row_number: number
        }
        Insert: {
          batch_id: string
          company_id: string
          created_at?: string
          id?: string
          is_duplicate?: boolean | null
          raw_data: Json
          row_hash?: string | null
          row_number: number
        }
        Update: {
          batch_id?: string
          company_id?: string
          created_at?: string
          id?: string
          is_duplicate?: boolean | null
          raw_data?: Json
          row_hash?: string | null
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "raw_payroll_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_payroll_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_payroll_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_schedule_import_rows: {
        Row: {
          batch_id: string
          company_id: string
          created_at: string
          id: string
          is_duplicate: boolean | null
          raw_data: Json
          row_hash: string | null
          row_number: number
        }
        Insert: {
          batch_id: string
          company_id: string
          created_at?: string
          id?: string
          is_duplicate?: boolean | null
          raw_data: Json
          row_hash?: string | null
          row_number: number
        }
        Update: {
          batch_id?: string
          company_id?: string
          created_at?: string
          id?: string
          is_duplicate?: boolean | null
          raw_data?: Json
          row_hash?: string | null
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "raw_schedule_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_schedule_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_schedule_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      reconciliation_audit_log: {
        Row: {
          action_type: string
          batch_id: string
          created_at: string
          employee_row_id: string | null
          id: string
          new_value: string | null
          note: string | null
          performed_by: string | null
          previous_value: string | null
        }
        Insert: {
          action_type: string
          batch_id: string
          created_at?: string
          employee_row_id?: string | null
          id?: string
          new_value?: string | null
          note?: string | null
          performed_by?: string | null
          previous_value?: string | null
        }
        Update: {
          action_type?: string
          batch_id?: string
          created_at?: string
          employee_row_id?: string | null
          id?: string
          new_value?: string | null
          note?: string | null
          performed_by?: string | null
          previous_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_audit_log_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_audit_log_employee_row_id_fkey"
            columns: ["employee_row_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_employee_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          checklist_json: Json | null
          company_id: string
          component_mismatch_count: number | null
          created_at: string
          created_by: string | null
          critical_mismatch_count: number | null
          employees_system_count: number | null
          employees_truth_count: number | null
          exact_match_count: number | null
          health_grade: string | null
          health_score: number | null
          id: string
          locked_at: string | null
          matched_count: number | null
          mismatch_count: number | null
          notes: string | null
          payroll_corte: string | null
          payroll_date: string | null
          payroll_period_end: string | null
          payroll_period_start: string | null
          reconciliation_mode: string
          status: string
          tolerance_hours: number | null
          tolerance_money: number | null
          tolerance_tips: number | null
          total_variance_amount: number | null
          totals_system_json: Json | null
          totals_truth_json: Json | null
          totals_variance_json: Json | null
          truth_source_file_name: string | null
          truth_source_file_url: string | null
          truth_source_uploaded_at: string | null
          unmatched_system_count: number | null
          unmatched_truth_count: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          checklist_json?: Json | null
          company_id: string
          component_mismatch_count?: number | null
          created_at?: string
          created_by?: string | null
          critical_mismatch_count?: number | null
          employees_system_count?: number | null
          employees_truth_count?: number | null
          exact_match_count?: number | null
          health_grade?: string | null
          health_score?: number | null
          id?: string
          locked_at?: string | null
          matched_count?: number | null
          mismatch_count?: number | null
          notes?: string | null
          payroll_corte?: string | null
          payroll_date?: string | null
          payroll_period_end?: string | null
          payroll_period_start?: string | null
          reconciliation_mode?: string
          status?: string
          tolerance_hours?: number | null
          tolerance_money?: number | null
          tolerance_tips?: number | null
          total_variance_amount?: number | null
          totals_system_json?: Json | null
          totals_truth_json?: Json | null
          totals_variance_json?: Json | null
          truth_source_file_name?: string | null
          truth_source_file_url?: string | null
          truth_source_uploaded_at?: string | null
          unmatched_system_count?: number | null
          unmatched_truth_count?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          checklist_json?: Json | null
          company_id?: string
          component_mismatch_count?: number | null
          created_at?: string
          created_by?: string | null
          critical_mismatch_count?: number | null
          employees_system_count?: number | null
          employees_truth_count?: number | null
          exact_match_count?: number | null
          health_grade?: string | null
          health_score?: number | null
          id?: string
          locked_at?: string | null
          matched_count?: number | null
          mismatch_count?: number | null
          notes?: string | null
          payroll_corte?: string | null
          payroll_date?: string | null
          payroll_period_end?: string | null
          payroll_period_start?: string | null
          reconciliation_mode?: string
          status?: string
          tolerance_hours?: number | null
          tolerance_money?: number | null
          tolerance_tips?: number | null
          total_variance_amount?: number | null
          totals_system_json?: Json | null
          totals_truth_json?: Json | null
          totals_variance_json?: Json | null
          truth_source_file_name?: string | null
          truth_source_file_url?: string | null
          truth_source_uploaded_at?: string | null
          unmatched_system_count?: number | null
          unmatched_truth_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_business_rules: {
        Row: {
          applies_to_employee: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          match_field: string
          match_operator: string
          match_value: string
          priority: number
          result_description: string | null
          result_pay_type: string
          rule_key: string
          rule_label: string
          rule_type: string
          updated_at: string
        }
        Insert: {
          applies_to_employee?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_field?: string
          match_operator?: string
          match_value: string
          priority?: number
          result_description?: string | null
          result_pay_type: string
          rule_key: string
          rule_label: string
          rule_type?: string
          updated_at?: string
        }
        Update: {
          applies_to_employee?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_field?: string
          match_operator?: string
          match_value?: string
          priority?: number
          result_description?: string | null
          result_pay_type?: string
          rule_key?: string
          rule_label?: string
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_business_rules_applies_to_employee_fkey"
            columns: ["applies_to_employee"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_business_rules_applies_to_employee_fkey"
            columns: ["applies_to_employee"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_business_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_business_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_closing_receipts: {
        Row: {
          company_id: string
          created_at: string
          grand_total_posted: number | null
          id: string
          period_end: string
          period_label: string
          period_start: string
          period_status_id: string
          published_at: string
          published_by: string
          receipt_data: Json | null
          total_daily_pay: number | null
          total_employees: number | null
          total_hourly_pay: number | null
          total_manual_adjustments: number | null
          total_overtime_hours: number | null
          total_payroll_rows: number | null
          total_regular_hours: number | null
          total_ride_pay: number | null
          total_scheduled_shifts: number | null
          total_worked_shifts: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          grand_total_posted?: number | null
          id?: string
          period_end: string
          period_label: string
          period_start: string
          period_status_id: string
          published_at?: string
          published_by: string
          receipt_data?: Json | null
          total_daily_pay?: number | null
          total_employees?: number | null
          total_hourly_pay?: number | null
          total_manual_adjustments?: number | null
          total_overtime_hours?: number | null
          total_payroll_rows?: number | null
          total_regular_hours?: number | null
          total_ride_pay?: number | null
          total_scheduled_shifts?: number | null
          total_worked_shifts?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          grand_total_posted?: number | null
          id?: string
          period_end?: string
          period_label?: string
          period_start?: string
          period_status_id?: string
          published_at?: string
          published_by?: string
          receipt_data?: Json | null
          total_daily_pay?: number | null
          total_employees?: number | null
          total_hourly_pay?: number | null
          total_manual_adjustments?: number | null
          total_overtime_hours?: number | null
          total_payroll_rows?: number | null
          total_regular_hours?: number | null
          total_ride_pay?: number | null
          total_scheduled_shifts?: number | null
          total_worked_shifts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_closing_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_closing_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_employee_rows: {
        Row: {
          anomaly_flags_json: Json | null
          batch_id: string
          clock_count: number | null
          closure_hours_used: number | null
          closure_source: string | null
          created_at: string
          email: string | null
          employee_external_id: string | null
          employer_identification: string | null
          employer_identification_normalized: string | null
          excluded_from_reconciliation: boolean | null
          first_name: string | null
          full_name_normalized: string | null
          has_component_mismatch: boolean | null
          has_critical_mismatch: boolean | null
          has_manual_adjustment: boolean | null
          id: string
          is_exact_match: boolean | null
          last_name: string | null
          match_confidence: number | null
          match_notes: string | null
          match_status: string | null
          matched_by: string | null
          matched_system_employee_id: string | null
          phone: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          row_status: string | null
          shift_count: number | null
          source_tags: string[] | null
          system_date_range: string | null
          system_pay_per_day: number | null
          system_reimbursements: number | null
          system_ryde: number | null
          system_source_summary_json: Json | null
          system_tips: number | null
          system_total: number | null
          system_total_hours: number | null
          system_total_pay: number | null
          truth_corte: string | null
          truth_date: string | null
          truth_hourly_rate: number | null
          truth_hourly_rate_derived: number | null
          truth_hours: number | null
          truth_observaciones: string | null
          truth_paid_hours: number | null
          truth_pay_per_day: number | null
          truth_raw_json: Json | null
          truth_reimbursements: number | null
          truth_ryde: number | null
          truth_tips: number | null
          truth_total: number | null
          truth_total_hours: number | null
          truth_total_pay: number | null
          updated_at: string
          variance_hours: number | null
          variance_pay_per_day: number | null
          variance_reimbursements: number | null
          variance_ryde: number | null
          variance_tips: number | null
          variance_total: number | null
          variance_total_pay: number | null
          verification_ssn_ein: string | null
          verification_ssn_ein_normalized: string | null
        }
        Insert: {
          anomaly_flags_json?: Json | null
          batch_id: string
          clock_count?: number | null
          closure_hours_used?: number | null
          closure_source?: string | null
          created_at?: string
          email?: string | null
          employee_external_id?: string | null
          employer_identification?: string | null
          employer_identification_normalized?: string | null
          excluded_from_reconciliation?: boolean | null
          first_name?: string | null
          full_name_normalized?: string | null
          has_component_mismatch?: boolean | null
          has_critical_mismatch?: boolean | null
          has_manual_adjustment?: boolean | null
          id?: string
          is_exact_match?: boolean | null
          last_name?: string | null
          match_confidence?: number | null
          match_notes?: string | null
          match_status?: string | null
          matched_by?: string | null
          matched_system_employee_id?: string | null
          phone?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          row_status?: string | null
          shift_count?: number | null
          source_tags?: string[] | null
          system_date_range?: string | null
          system_pay_per_day?: number | null
          system_reimbursements?: number | null
          system_ryde?: number | null
          system_source_summary_json?: Json | null
          system_tips?: number | null
          system_total?: number | null
          system_total_hours?: number | null
          system_total_pay?: number | null
          truth_corte?: string | null
          truth_date?: string | null
          truth_hourly_rate?: number | null
          truth_hourly_rate_derived?: number | null
          truth_hours?: number | null
          truth_observaciones?: string | null
          truth_paid_hours?: number | null
          truth_pay_per_day?: number | null
          truth_raw_json?: Json | null
          truth_reimbursements?: number | null
          truth_ryde?: number | null
          truth_tips?: number | null
          truth_total?: number | null
          truth_total_hours?: number | null
          truth_total_pay?: number | null
          updated_at?: string
          variance_hours?: number | null
          variance_pay_per_day?: number | null
          variance_reimbursements?: number | null
          variance_ryde?: number | null
          variance_tips?: number | null
          variance_total?: number | null
          variance_total_pay?: number | null
          verification_ssn_ein?: string | null
          verification_ssn_ein_normalized?: string | null
        }
        Update: {
          anomaly_flags_json?: Json | null
          batch_id?: string
          clock_count?: number | null
          closure_hours_used?: number | null
          closure_source?: string | null
          created_at?: string
          email?: string | null
          employee_external_id?: string | null
          employer_identification?: string | null
          employer_identification_normalized?: string | null
          excluded_from_reconciliation?: boolean | null
          first_name?: string | null
          full_name_normalized?: string | null
          has_component_mismatch?: boolean | null
          has_critical_mismatch?: boolean | null
          has_manual_adjustment?: boolean | null
          id?: string
          is_exact_match?: boolean | null
          last_name?: string | null
          match_confidence?: number | null
          match_notes?: string | null
          match_status?: string | null
          matched_by?: string | null
          matched_system_employee_id?: string | null
          phone?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          row_status?: string | null
          shift_count?: number | null
          source_tags?: string[] | null
          system_date_range?: string | null
          system_pay_per_day?: number | null
          system_reimbursements?: number | null
          system_ryde?: number | null
          system_source_summary_json?: Json | null
          system_tips?: number | null
          system_total?: number | null
          system_total_hours?: number | null
          system_total_pay?: number | null
          truth_corte?: string | null
          truth_date?: string | null
          truth_hourly_rate?: number | null
          truth_hourly_rate_derived?: number | null
          truth_hours?: number | null
          truth_observaciones?: string | null
          truth_paid_hours?: number | null
          truth_pay_per_day?: number | null
          truth_raw_json?: Json | null
          truth_reimbursements?: number | null
          truth_ryde?: number | null
          truth_tips?: number | null
          truth_total?: number | null
          truth_total_hours?: number | null
          truth_total_pay?: number | null
          updated_at?: string
          variance_hours?: number | null
          variance_pay_per_day?: number | null
          variance_reimbursements?: number | null
          variance_ryde?: number | null
          variance_tips?: number | null
          variance_total?: number | null
          variance_total_pay?: number | null
          verification_ssn_ein?: string | null
          verification_ssn_ein_normalized?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_employee_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_employee_rows_matched_system_employee_id_fkey"
            columns: ["matched_system_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_employee_rows_matched_system_employee_id_fkey"
            columns: ["matched_system_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_exceptions: {
        Row: {
          batch_id: string | null
          company_id: string
          created_at: string
          description: string | null
          employee_id: string | null
          exception_type: string
          id: string
          period_id: string | null
          resolution_action: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_data: Json | null
          source_row_id: string | null
          source_type: string | null
          status: string
          suggested_resolution: string | null
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          employee_id?: string | null
          exception_type: string
          id?: string
          period_id?: string | null
          resolution_action?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_data?: Json | null
          source_row_id?: string | null
          source_type?: string | null
          status?: string
          suggested_resolution?: string | null
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          employee_id?: string | null
          exception_type?: string
          id?: string
          period_id?: string | null
          resolution_action?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_data?: Json | null
          source_row_id?: string | null
          source_type?: string | null
          status?: string
          suggested_resolution?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_exceptions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_exceptions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_exceptions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_exceptions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_final_records: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_pay: number | null
          clock_batch_id: string | null
          company_id: string
          conflict_count: number | null
          created_at: string
          daily_pay_total: number | null
          daily_rate: number | null
          employee_id: string
          final_total_pay: number | null
          grand_total: number | null
          hourly_pay_total: number | null
          hourly_rate: number | null
          id: string
          manual_adjustment_total: number | null
          manual_amount: number | null
          match_ids: Json | null
          overtime_hours: number | null
          pay_classification: string | null
          payroll_batch_id: string | null
          payroll_reference_total: number | null
          payroll_rows: Json | null
          period_status_id: string
          published_at: string | null
          publishing_user: string | null
          reconciliation_status: string
          regular_hours: number | null
          resolution_notes: string | null
          ride_amount: number | null
          ride_pay_total: number | null
          schedule_batch_id: string | null
          scheduled_shifts: Json | null
          shift_calculated_total: number | null
          shift_calculation_source: string | null
          shift_daily_rate_used: number | null
          shift_full_day_count: number | null
          shift_half_day_count: number | null
          shift_half_day_rate_used: number | null
          shift_vs_payroll_diff: number | null
          source_payroll_total: number | null
          total_payroll_amount: number | null
          total_payroll_hours: number | null
          total_scheduled_hours: number | null
          total_worked_hours: number | null
          updated_at: string
          variance_amount: number | null
          variance_reasons: Json | null
          variance_status: string | null
          warnings: Json | null
          weekend_amount: number | null
          weekend_pay_total: number | null
          worked_shifts: Json | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_pay?: number | null
          clock_batch_id?: string | null
          company_id: string
          conflict_count?: number | null
          created_at?: string
          daily_pay_total?: number | null
          daily_rate?: number | null
          employee_id: string
          final_total_pay?: number | null
          grand_total?: number | null
          hourly_pay_total?: number | null
          hourly_rate?: number | null
          id?: string
          manual_adjustment_total?: number | null
          manual_amount?: number | null
          match_ids?: Json | null
          overtime_hours?: number | null
          pay_classification?: string | null
          payroll_batch_id?: string | null
          payroll_reference_total?: number | null
          payroll_rows?: Json | null
          period_status_id: string
          published_at?: string | null
          publishing_user?: string | null
          reconciliation_status?: string
          regular_hours?: number | null
          resolution_notes?: string | null
          ride_amount?: number | null
          ride_pay_total?: number | null
          schedule_batch_id?: string | null
          scheduled_shifts?: Json | null
          shift_calculated_total?: number | null
          shift_calculation_source?: string | null
          shift_daily_rate_used?: number | null
          shift_full_day_count?: number | null
          shift_half_day_count?: number | null
          shift_half_day_rate_used?: number | null
          shift_vs_payroll_diff?: number | null
          source_payroll_total?: number | null
          total_payroll_amount?: number | null
          total_payroll_hours?: number | null
          total_scheduled_hours?: number | null
          total_worked_hours?: number | null
          updated_at?: string
          variance_amount?: number | null
          variance_reasons?: Json | null
          variance_status?: string | null
          warnings?: Json | null
          weekend_amount?: number | null
          weekend_pay_total?: number | null
          worked_shifts?: Json | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_pay?: number | null
          clock_batch_id?: string | null
          company_id?: string
          conflict_count?: number | null
          created_at?: string
          daily_pay_total?: number | null
          daily_rate?: number | null
          employee_id?: string
          final_total_pay?: number | null
          grand_total?: number | null
          hourly_pay_total?: number | null
          hourly_rate?: number | null
          id?: string
          manual_adjustment_total?: number | null
          manual_amount?: number | null
          match_ids?: Json | null
          overtime_hours?: number | null
          pay_classification?: string | null
          payroll_batch_id?: string | null
          payroll_reference_total?: number | null
          payroll_rows?: Json | null
          period_status_id?: string
          published_at?: string | null
          publishing_user?: string | null
          reconciliation_status?: string
          regular_hours?: number | null
          resolution_notes?: string | null
          ride_amount?: number | null
          ride_pay_total?: number | null
          schedule_batch_id?: string | null
          scheduled_shifts?: Json | null
          shift_calculated_total?: number | null
          shift_calculation_source?: string | null
          shift_daily_rate_used?: number | null
          shift_full_day_count?: number | null
          shift_half_day_count?: number | null
          shift_half_day_rate_used?: number | null
          shift_vs_payroll_diff?: number | null
          source_payroll_total?: number | null
          total_payroll_amount?: number | null
          total_payroll_hours?: number | null
          total_scheduled_hours?: number | null
          total_worked_hours?: number | null
          updated_at?: string
          variance_amount?: number | null
          variance_reasons?: Json | null
          variance_status?: string | null
          warnings?: Json | null
          weekend_amount?: number | null
          weekend_pay_total?: number | null
          worked_shifts?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_final_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_final_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_final_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_final_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_final_records_period_status_id_fkey"
            columns: ["period_status_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_period_status"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_known_patterns: {
        Row: {
          auto_resolution: string | null
          company_id: string
          created_by: string | null
          description: string | null
          first_seen_at: string
          id: string
          is_active: boolean
          last_seen_at: string
          match_criteria: Json
          pattern_key: string
          pattern_label: string
          times_seen: number
        }
        Insert: {
          auto_resolution?: string | null
          company_id: string
          created_by?: string | null
          description?: string | null
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          match_criteria?: Json
          pattern_key: string
          pattern_label: string
          times_seen?: number
        }
        Update: {
          auto_resolution?: string | null
          company_id?: string
          created_by?: string | null
          description?: string | null
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          match_criteria?: Json
          pattern_key?: string
          pattern_label?: string
          times_seen?: number
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_known_patterns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_known_patterns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_learned_mappings: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          mapping_type: string
          source_value: string
          source_value_normalized: string
          target_id: string | null
          target_value: string
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          mapping_type: string
          source_value: string
          source_value_normalized: string
          target_id?: string | null
          target_value: string
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          mapping_type?: string
          source_value?: string
          source_value_normalized?: string
          target_id?: string | null
          target_value?: string
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_learned_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_learned_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_learned_rules: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string | null
          id: string
          last_used_at: string | null
          match_criteria: Json
          result_action: Json
          rule_label: string
          source_type: string
          usage_count: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          last_used_at?: string | null
          match_criteria?: Json
          result_action?: Json
          rule_label: string
          source_type?: string
          usage_count?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          last_used_at?: string | null
          match_criteria?: Json
          result_action?: Json
          rule_label?: string
          source_type?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_learned_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_learned_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_learned_rules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_learned_rules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_matches: {
        Row: {
          batch_id: string | null
          clock_row_id: string | null
          company_id: string
          confidence_score: number
          conflict_flags: Json | null
          created_at: string
          employee_id: string | null
          hours_variance: number | null
          id: string
          match_status: string
          match_type: string
          pay_variance: number | null
          payroll_row_id: string | null
          period_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          schedule_row_id: string | null
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          clock_row_id?: string | null
          company_id: string
          confidence_score?: number
          conflict_flags?: Json | null
          created_at?: string
          employee_id?: string | null
          hours_variance?: number | null
          id?: string
          match_status?: string
          match_type: string
          pay_variance?: number | null
          payroll_row_id?: string | null
          period_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          schedule_row_id?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          clock_row_id?: string | null
          company_id?: string
          confidence_score?: number
          conflict_flags?: Json | null
          created_at?: string
          employee_id?: string | null
          hours_variance?: number | null
          id?: string
          match_status?: string
          match_type?: string
          pay_variance?: number | null
          payroll_row_id?: string | null
          period_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          schedule_row_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_matches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_clock_row_id_fkey"
            columns: ["clock_row_id"]
            isOneToOne: false
            referencedRelation: "normalized_clock_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_payroll_row_id_fkey"
            columns: ["payroll_row_id"]
            isOneToOne: false
            referencedRelation: "normalized_payroll_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_schedule_row_id_fkey"
            columns: ["schedule_row_id"]
            isOneToOne: false
            referencedRelation: "normalized_schedule_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_name_resolutions: {
        Row: {
          applies_to_rows: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          imported_name_normalized: string
          imported_name_raw: string
          resolution_source: string
          scope_key: string
          selected_employee_id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          applies_to_rows?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          imported_name_normalized: string
          imported_name_raw: string
          resolution_source?: string
          scope_key?: string
          selected_employee_id: string
          source_type?: string
          updated_at?: string
        }
        Update: {
          applies_to_rows?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          imported_name_normalized?: string
          imported_name_raw?: string
          resolution_source?: string
          scope_key?: string
          selected_employee_id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_name_resolutions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_name_resolutions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_name_resolutions_selected_employee_id_fkey"
            columns: ["selected_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_name_resolutions_selected_employee_id_fkey"
            columns: ["selected_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_overrides: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          employee_id: string
          id: string
          notes: string | null
          override_source: string
          override_type: string
          period_status_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          notes?: string | null
          override_source?: string
          override_type: string
          period_status_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          notes?: string | null
          override_source?: string
          override_type?: string
          period_status_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_period_journal: {
        Row: {
          company_id: string
          created_at: string
          detail: string | null
          event_label: string
          event_type: string
          id: string
          metadata: Json | null
          performed_by: string | null
          period_status_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          detail?: string | null
          event_label: string
          event_type: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          period_status_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          detail?: string | null
          event_label?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          period_status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_period_journal_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_period_journal_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_period_status: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_matches: number | null
          approved_note: string | null
          calculation_mode: string | null
          clock_batch_id: string | null
          closed_at: string | null
          closed_by: string | null
          closed_note: string | null
          closure_method: string | null
          company_id: string
          created_at: string
          golive_checklist: Json | null
          id: string
          locked: boolean | null
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          outcome_label: string | null
          payroll_batch_id: string | null
          period_end: string
          period_id: string
          period_label: string
          period_start: string
          posted_at: string | null
          posted_by: string | null
          posted_note: string | null
          publish_idempotency_key: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          reconciled_note: string | null
          reopen_count: number | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          resolved_exceptions: number | null
          schedule_batch_id: string | null
          status: string
          total_clocks: number | null
          total_employees: number | null
          total_exceptions: number | null
          total_matches: number | null
          total_payroll_rows: number | null
          total_schedules: number | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validated_note: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_matches?: number | null
          approved_note?: string | null
          calculation_mode?: string | null
          clock_batch_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_note?: string | null
          closure_method?: string | null
          company_id: string
          created_at?: string
          golive_checklist?: Json | null
          id?: string
          locked?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          outcome_label?: string | null
          payroll_batch_id?: string | null
          period_end: string
          period_id: string
          period_label?: string
          period_start: string
          posted_at?: string | null
          posted_by?: string | null
          posted_note?: string | null
          publish_idempotency_key?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciled_note?: string | null
          reopen_count?: number | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          resolved_exceptions?: number | null
          schedule_batch_id?: string | null
          status?: string
          total_clocks?: number | null
          total_employees?: number | null
          total_exceptions?: number | null
          total_matches?: number | null
          total_payroll_rows?: number | null
          total_schedules?: number | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validated_note?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_matches?: number | null
          approved_note?: string | null
          calculation_mode?: string | null
          clock_batch_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_note?: string | null
          closure_method?: string | null
          company_id?: string
          created_at?: string
          golive_checklist?: Json | null
          id?: string
          locked?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          outcome_label?: string | null
          payroll_batch_id?: string | null
          period_end?: string
          period_id?: string
          period_label?: string
          period_start?: string
          posted_at?: string | null
          posted_by?: string | null
          posted_note?: string | null
          publish_idempotency_key?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciled_note?: string | null
          reopen_count?: number | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          resolved_exceptions?: number | null
          schedule_batch_id?: string | null
          status?: string
          total_clocks?: number | null
          total_employees?: number | null
          total_exceptions?: number | null
          total_matches?: number | null
          total_payroll_rows?: number | null
          total_schedules?: number | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validated_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_period_status_clock_batch_id_fkey"
            columns: ["clock_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_period_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_period_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_period_status_payroll_batch_id_fkey"
            columns: ["payroll_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_period_status_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_period_status_schedule_batch_id_fkey"
            columns: ["schedule_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_pilot_reports: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          employee_exact_match_pct: number | null
          go_live_readiness: string
          id: string
          learned_rules_created: number | null
          manual_intervention_count: number | null
          payroll_match_pct: number | null
          period_status_id: string
          publish_confidence: number | null
          recommendation: string | null
          report_data: Json
          unresolved_critical: number | null
          unresolved_warnings: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_exact_match_pct?: number | null
          go_live_readiness?: string
          id?: string
          learned_rules_created?: number | null
          manual_intervention_count?: number | null
          payroll_match_pct?: number | null
          period_status_id: string
          publish_confidence?: number | null
          recommendation?: string | null
          report_data?: Json
          unresolved_critical?: number | null
          unresolved_warnings?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_exact_match_pct?: number | null
          go_live_readiness?: string
          id?: string
          learned_rules_created?: number | null
          manual_intervention_count?: number | null
          payroll_match_pct?: number | null
          period_status_id?: string
          publish_confidence?: number | null
          recommendation?: string | null
          report_data?: Json
          unresolved_critical?: number | null
          unresolved_warnings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_pilot_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_pilot_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_row_actions: {
        Row: {
          action_data: Json | null
          action_type: string
          company_id: string
          employee_id: string | null
          exception_id: string | null
          id: string
          match_id: string | null
          performed_at: string
          performed_by: string
          period_status_id: string | null
          reason: string | null
          source_row_id: string | null
          target_row_id: string | null
        }
        Insert: {
          action_data?: Json | null
          action_type: string
          company_id: string
          employee_id?: string | null
          exception_id?: string | null
          id?: string
          match_id?: string | null
          performed_at?: string
          performed_by: string
          period_status_id?: string | null
          reason?: string | null
          source_row_id?: string | null
          target_row_id?: string | null
        }
        Update: {
          action_data?: Json | null
          action_type?: string
          company_id?: string
          employee_id?: string | null
          exception_id?: string | null
          id?: string
          match_id?: string | null
          performed_at?: string
          performed_by?: string
          period_status_id?: string | null
          reason?: string | null
          source_row_id?: string | null
          target_row_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_row_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_row_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_row_actions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_row_actions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_row_actions_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_row_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_row_actions_period_status_id_fkey"
            columns: ["period_status_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_period_status"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_uat_issues: {
        Row: {
          category: string
          company_id: string
          created_at: string
          description: string | null
          fix_notes: string | null
          fixed_at: string | null
          id: string
          linked_employee_id: string | null
          linked_record_id: string | null
          linked_step: string | null
          period_status_id: string
          reported_at: string
          reported_by: string | null
          retested_at: string | null
          retested_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          description?: string | null
          fix_notes?: string | null
          fixed_at?: string | null
          id?: string
          linked_employee_id?: string | null
          linked_record_id?: string | null
          linked_step?: string | null
          period_status_id: string
          reported_at?: string
          reported_by?: string | null
          retested_at?: string | null
          retested_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          description?: string | null
          fix_notes?: string | null
          fixed_at?: string | null
          id?: string
          linked_employee_id?: string | null
          linked_record_id?: string | null
          linked_step?: string | null
          period_status_id?: string
          reported_at?: string
          reported_by?: string | null
          retested_at?: string | null
          retested_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_uat_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_uat_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_uat_issues_linked_employee_id_fkey"
            columns: ["linked_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_uat_issues_linked_employee_id_fkey"
            columns: ["linked_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_validation_results: {
        Row: {
          company_id: string
          confidence_score: number | null
          created_at: string
          employee_variances: Json | null
          employees_exact_match: number | null
          employees_major_variance: number | null
          employees_minor_variance: number | null
          employees_unresolved: number | null
          id: string
          is_dry_run: boolean
          notes: string | null
          period_status_id: string
          publish_readiness: string | null
          published_total: number | null
          reconciled_total: number | null
          source_payroll_total: number | null
          tested_at: string
          tested_by: string
          total_employees: number | null
          total_variance: number | null
          uat_checklist: Json | null
          unresolved_exceptions: number | null
        }
        Insert: {
          company_id: string
          confidence_score?: number | null
          created_at?: string
          employee_variances?: Json | null
          employees_exact_match?: number | null
          employees_major_variance?: number | null
          employees_minor_variance?: number | null
          employees_unresolved?: number | null
          id?: string
          is_dry_run?: boolean
          notes?: string | null
          period_status_id: string
          publish_readiness?: string | null
          published_total?: number | null
          reconciled_total?: number | null
          source_payroll_total?: number | null
          tested_at?: string
          tested_by: string
          total_employees?: number | null
          total_variance?: number | null
          uat_checklist?: Json | null
          unresolved_exceptions?: number | null
        }
        Update: {
          company_id?: string
          confidence_score?: number | null
          created_at?: string
          employee_variances?: Json | null
          employees_exact_match?: number | null
          employees_major_variance?: number | null
          employees_minor_variance?: number | null
          employees_unresolved?: number | null
          id?: string
          is_dry_run?: boolean
          notes?: string | null
          period_status_id?: string
          publish_readiness?: string | null
          published_total?: number | null
          reconciled_total?: number | null
          source_payroll_total?: number | null
          tested_at?: string
          tested_by?: string
          total_employees?: number | null
          total_variance?: number | null
          uat_checklist?: Json | null
          unresolved_exceptions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_validation_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_validation_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "request_candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      review_dimension_scores: {
        Row: {
          category_key: string
          created_at: string
          id: string
          rating: number
          submission_id: string
        }
        Insert: {
          category_key: string
          created_at?: string
          id?: string
          rating: number
          submission_id: string
        }
        Update: {
          category_key?: string
          created_at?: string
          id?: string
          rating?: number
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_dimension_scores_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "review_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_flags: {
        Row: {
          company_id: string
          created_at: string
          flag_type: string
          id: string
          note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["review_flag_severity"]
          status: string
          submission_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          flag_type: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["review_flag_severity"]
          status?: string
          submission_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          flag_type?: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["review_flag_severity"]
          status?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_flags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_flags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_flags_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "review_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_form_dimensions: {
        Row: {
          category_key: string
          display_order: number
          form_type: Database["public"]["Enums"]["review_form_type"]
          id: string
          is_active: boolean
          label_en: string
          label_es: string
        }
        Insert: {
          category_key: string
          display_order?: number
          form_type: Database["public"]["Enums"]["review_form_type"]
          id?: string
          is_active?: boolean
          label_en: string
          label_es: string
        }
        Update: {
          category_key?: string
          display_order?: number
          form_type?: Database["public"]["Enums"]["review_form_type"]
          id?: string
          is_active?: boolean
          label_en?: string
          label_es?: string
        }
        Relationships: []
      }
      review_requests: {
        Row: {
          company_id: string
          created_at: string
          deadline_at: string
          evaluated_entity_id: string
          evaluated_entity_type: Database["public"]["Enums"]["review_entity_type"]
          evaluated_role: string | null
          evaluator_employee_id: string | null
          evaluator_user_id: string | null
          id: string
          priority: number
          review_form_type: Database["public"]["Enums"]["review_form_type"]
          sampling_reason: string | null
          source_event_id: string
          source_event_type: string
          source_product: Database["public"]["Enums"]["review_product"]
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deadline_at: string
          evaluated_entity_id: string
          evaluated_entity_type: Database["public"]["Enums"]["review_entity_type"]
          evaluated_role?: string | null
          evaluator_employee_id?: string | null
          evaluator_user_id?: string | null
          id?: string
          priority?: number
          review_form_type: Database["public"]["Enums"]["review_form_type"]
          sampling_reason?: string | null
          source_event_id: string
          source_event_type: string
          source_product?: Database["public"]["Enums"]["review_product"]
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deadline_at?: string
          evaluated_entity_id?: string
          evaluated_entity_type?: Database["public"]["Enums"]["review_entity_type"]
          evaluated_role?: string | null
          evaluator_employee_id?: string | null
          evaluator_user_id?: string | null
          id?: string
          priority?: number
          review_form_type?: Database["public"]["Enums"]["review_form_type"]
          sampling_reason?: string | null
          source_event_id?: string
          source_event_type?: string
          source_product?: Database["public"]["Enums"]["review_product"]
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_evaluator_employee_id_fkey"
            columns: ["evaluator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_evaluator_employee_id_fkey"
            columns: ["evaluator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sampling_config: {
        Row: {
          base_sample_rate: number
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          incident_boost: number
          low_score_boost: number
          min_interval_days: number
          new_entity_boost: number
          review_window_hours: number
          source_product: Database["public"]["Enums"]["review_product"]
          updated_at: string
        }
        Insert: {
          base_sample_rate?: number
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          incident_boost?: number
          low_score_boost?: number
          min_interval_days?: number
          new_entity_boost?: number
          review_window_hours?: number
          source_product?: Database["public"]["Enums"]["review_product"]
          updated_at?: string
        }
        Update: {
          base_sample_rate?: number
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          incident_boost?: number
          low_score_boost?: number
          min_interval_days?: number
          new_entity_boost?: number
          review_window_hours?: number
          source_product?: Database["public"]["Enums"]["review_product"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_sampling_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sampling_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      review_scores: {
        Row: {
          company_id: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["review_entity_type"]
          id: string
          last_review_at: string | null
          score_count: number
          score_type: string
          score_value: number
          trend: string | null
          updated_at: string
          weighted_score: number | null
        }
        Insert: {
          company_id: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["review_entity_type"]
          id?: string
          last_review_at?: string | null
          score_count?: number
          score_type?: string
          score_value?: number
          trend?: string | null
          updated_at?: string
          weighted_score?: number | null
        }
        Update: {
          company_id?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["review_entity_type"]
          id?: string
          last_review_at?: string | null
          score_count?: number
          score_type?: string
          score_value?: number
          trend?: string | null
          updated_at?: string
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "review_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      review_submissions: {
        Row: {
          comment: string | null
          company_id: string
          created_at: string
          evaluated_entity_id: string
          evaluated_entity_type: Database["public"]["Enums"]["review_entity_type"]
          evaluated_role: string | null
          evaluator_employee_id: string | null
          evaluator_user_id: string
          id: string
          low_rating_reason: string | null
          low_rating_reasons: string[] | null
          overall_rating: number
          review_form_type: Database["public"]["Enums"]["review_form_type"]
          review_request_id: string | null
          source_event_id: string | null
          source_event_type: string | null
          source_product: Database["public"]["Enums"]["review_product"]
          submitted_at: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          company_id: string
          created_at?: string
          evaluated_entity_id: string
          evaluated_entity_type: Database["public"]["Enums"]["review_entity_type"]
          evaluated_role?: string | null
          evaluator_employee_id?: string | null
          evaluator_user_id: string
          id?: string
          low_rating_reason?: string | null
          low_rating_reasons?: string[] | null
          overall_rating: number
          review_form_type: Database["public"]["Enums"]["review_form_type"]
          review_request_id?: string | null
          source_event_id?: string | null
          source_event_type?: string | null
          source_product?: Database["public"]["Enums"]["review_product"]
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          company_id?: string
          created_at?: string
          evaluated_entity_id?: string
          evaluated_entity_type?: Database["public"]["Enums"]["review_entity_type"]
          evaluated_role?: string | null
          evaluator_employee_id?: string | null
          evaluator_user_id?: string
          id?: string
          low_rating_reason?: string | null
          low_rating_reasons?: string[] | null
          overall_rating?: number
          review_form_type?: Database["public"]["Enums"]["review_form_type"]
          review_request_id?: string | null
          source_event_id?: string | null
          source_event_type?: string | null
          source_product?: Database["public"]["Enums"]["review_product"]
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_submissions_evaluator_employee_id_fkey"
            columns: ["evaluator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_submissions_evaluator_employee_id_fkey"
            columns: ["evaluator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_submissions_review_request_id_fkey"
            columns: ["review_request_id"]
            isOneToOne: true
            referencedRelation: "review_requests"
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
          {
            foreignKeyName: "role_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          {
            foreignKeyName: "saved_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_shifts: {
        Row: {
          attendance_mode: string
          car_capacity: number
          category_id: string | null
          claimable: boolean
          client_id: string | null
          clock_method: string
          company_id: string
          created_at: string
          created_by: string | null
          date: string
          day_type: string
          deleted_at: string | null
          driver_employee_id: string | null
          end_time: string
          id: string
          job_site_location_id: string | null
          location_id: string | null
          meeting_point: string | null
          meeting_point_location_id: string | null
          meeting_time: string | null
          notes: string | null
          operational_version: number
          pay_type: string
          qr_attendance_mode: string
          qr_token: string | null
          reconciliation_hash: string | null
          shift_admin_id: string | null
          shift_code: string | null
          shift_link_token: string | null
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
          attendance_mode?: string
          car_capacity?: number
          category_id?: string | null
          claimable?: boolean
          client_id?: string | null
          clock_method?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          date: string
          day_type?: string
          deleted_at?: string | null
          driver_employee_id?: string | null
          end_time: string
          id?: string
          job_site_location_id?: string | null
          location_id?: string | null
          meeting_point?: string | null
          meeting_point_location_id?: string | null
          meeting_time?: string | null
          notes?: string | null
          operational_version?: number
          pay_type?: string
          qr_attendance_mode?: string
          qr_token?: string | null
          reconciliation_hash?: string | null
          shift_admin_id?: string | null
          shift_code?: string | null
          shift_link_token?: string | null
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
          attendance_mode?: string
          car_capacity?: number
          category_id?: string | null
          claimable?: boolean
          client_id?: string | null
          clock_method?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          day_type?: string
          deleted_at?: string | null
          driver_employee_id?: string | null
          end_time?: string
          id?: string
          job_site_location_id?: string | null
          location_id?: string | null
          meeting_point?: string | null
          meeting_point_location_id?: string | null
          meeting_time?: string | null
          notes?: string | null
          operational_version?: number
          pay_type?: string
          qr_attendance_mode?: string
          qr_token?: string | null
          reconciliation_hash?: string | null
          shift_admin_id?: string | null
          shift_code?: string | null
          shift_link_token?: string | null
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
            foreignKeyName: "scheduled_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "scheduled_shifts_job_site_location_id_fkey"
            columns: ["job_site_location_id"]
            isOneToOne: false
            referencedRelation: "locations_v2"
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
            foreignKeyName: "scheduled_shifts_meeting_point_location_id_fkey"
            columns: ["meeting_point_location_id"]
            isOneToOne: false
            referencedRelation: "locations_v2"
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
          {
            foreignKeyName: "service_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_items: {
        Row: {
          billing_unit:
            | Database["public"]["Enums"]["service_request_billing_unit"]
            | null
          company_id: string
          created_at: string
          id: string
          notes: string | null
          quantity_requested: number
          requested_bill_rate: number | null
          role_label: string | null
          role_type: Database["public"]["Enums"]["service_request_role_type"]
          service_request_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          billing_unit?:
            | Database["public"]["Enums"]["service_request_billing_unit"]
            | null
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          quantity_requested?: number
          requested_bill_rate?: number | null
          role_label?: string | null
          role_type?: Database["public"]["Enums"]["service_request_role_type"]
          service_request_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          billing_unit?:
            | Database["public"]["Enums"]["service_request_billing_unit"]
            | null
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          quantity_requested?: number
          requested_bill_rate?: number | null
          role_label?: string | null
          role_type?: Database["public"]["Enums"]["service_request_role_type"]
          service_request_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_items_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_shift_links: {
        Row: {
          company_id: string
          created_at: string
          id: string
          linked_by: string | null
          service_request_id: string
          service_request_item_id: string | null
          shift_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          linked_by?: string | null
          service_request_id: string
          service_request_item_id?: string | null
          shift_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          linked_by?: string | null
          service_request_id?: string
          service_request_item_id?: string | null
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_shift_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_shift_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_shift_links_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_shift_links_service_request_item_id_fkey"
            columns: ["service_request_item_id"]
            isOneToOne: false
            referencedRelation: "service_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_shift_links_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          client_name_snapshot: string | null
          company_id: string
          created_at: string
          created_by: string | null
          end_time: string | null
          gender_requirement: Database["public"]["Enums"]["service_request_gender_req"]
          id: string
          location_name: string | null
          notes: string | null
          onsite_contact_name: string | null
          onsite_contact_phone: string | null
          request_channel: Database["public"]["Enums"]["service_request_channel"]
          request_code: string
          request_date: string
          service_address: string | null
          service_date: string
          start_time: string | null
          status: Database["public"]["Enums"]["service_request_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          client_name_snapshot?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          gender_requirement?: Database["public"]["Enums"]["service_request_gender_req"]
          id?: string
          location_name?: string | null
          notes?: string | null
          onsite_contact_name?: string | null
          onsite_contact_phone?: string | null
          request_channel?: Database["public"]["Enums"]["service_request_channel"]
          request_code: string
          request_date?: string
          service_address?: string | null
          service_date: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["service_request_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          client_name_snapshot?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          gender_requirement?: Database["public"]["Enums"]["service_request_gender_req"]
          id?: string
          location_name?: string | null
          notes?: string | null
          onsite_contact_name?: string | null
          onsite_contact_phone?: string | null
          request_channel?: Database["public"]["Enums"]["service_request_channel"]
          request_code?: string
          request_date?: string
          service_address?: string | null
          service_date?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["service_request_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          accepted_at: string | null
          accepted_shift_version: number | null
          assignment_role: string | null
          company_id: string
          created_at: string
          employee_id: string
          id: string
          last_notified_at: string | null
          rejected_at: string | null
          rejection_reason: string | null
          responded_at: string | null
          response_required: boolean
          response_status: string
          role_slot_id: string | null
          shift_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_shift_version?: number | null
          assignment_role?: string | null
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          last_notified_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          responded_at?: string | null
          response_required?: boolean
          response_status?: string
          role_slot_id?: string | null
          shift_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_shift_version?: number | null
          assignment_role?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          last_notified_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          responded_at?: string | null
          response_required?: boolean
          response_status?: string
          role_slot_id?: string | null
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
            foreignKeyName: "shift_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "shift_assignments_role_slot_id_fkey"
            columns: ["role_slot_id"]
            isOneToOne: false
            referencedRelation: "shift_role_slots"
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
            foreignKeyName: "shift_attendance_confirmations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "shift_chat_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "shift_chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "shift_comments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      shift_notes: {
        Row: {
          company_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          linked_employee_id: string | null
          note_type: string
          shift_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          linked_employee_id?: string | null
          note_type?: string
          shift_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          linked_employee_id?: string | null
          note_type?: string
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_notes_linked_employee_id_fkey"
            columns: ["linked_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_notes_linked_employee_id_fkey"
            columns: ["linked_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_notes_shift_id_fkey"
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
            foreignKeyName: "shift_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      shift_review_tags: {
        Row: {
          company_id: string
          created_at: string
          id: string
          review_id: string
          tag: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          review_id: string
          tag: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          review_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_review_tags_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "shift_reviews"
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
          is_anonymous: boolean
          overall_rating: number
          private_notes: string | null
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
          review_type: Database["public"]["Enums"]["review_type"]
          reviewed_client_id: string | null
          reviewed_employee_id: string | null
          reviewer_employee_id: string | null
          reviewer_id: string
          reviewer_role:
            | Database["public"]["Enums"]["review_reviewer_role"]
            | null
          reviewer_type: string
          reviewer_user_id: string | null
          shift_id: string
          status: Database["public"]["Enums"]["review_status"]
          submitted_at: string | null
          updated_at: string
          would_work_again: boolean | null
        }
        Insert: {
          comment?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          overall_rating: number
          private_notes?: string | null
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
          review_type?: Database["public"]["Enums"]["review_type"]
          reviewed_client_id?: string | null
          reviewed_employee_id?: string | null
          reviewer_employee_id?: string | null
          reviewer_id: string
          reviewer_role?:
            | Database["public"]["Enums"]["review_reviewer_role"]
            | null
          reviewer_type: string
          reviewer_user_id?: string | null
          shift_id: string
          status?: Database["public"]["Enums"]["review_status"]
          submitted_at?: string | null
          updated_at?: string
          would_work_again?: boolean | null
        }
        Update: {
          comment?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          overall_rating?: number
          private_notes?: string | null
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
          review_type?: Database["public"]["Enums"]["review_type"]
          reviewed_client_id?: string | null
          reviewed_employee_id?: string | null
          reviewer_employee_id?: string | null
          reviewer_id?: string
          reviewer_role?:
            | Database["public"]["Enums"]["review_reviewer_role"]
            | null
          reviewer_type?: string
          reviewer_user_id?: string | null
          shift_id?: string
          status?: Database["public"]["Enums"]["review_status"]
          submitted_at?: string | null
          updated_at?: string
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
            foreignKeyName: "shift_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "shift_reviews_reviewer_employee_id_fkey"
            columns: ["reviewer_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reviews_reviewer_employee_id_fkey"
            columns: ["reviewer_employee_id"]
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
            foreignKeyName: "shift_rides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      shift_role_slots: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          quantity: number
          role_label: string | null
          role_type: Database["public"]["Enums"]["service_request_role_type"]
          service_request_id: string | null
          service_request_item_id: string | null
          shift_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          quantity: number
          role_label?: string | null
          role_type: Database["public"]["Enums"]["service_request_role_type"]
          service_request_id?: string | null
          service_request_item_id?: string | null
          shift_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          quantity?: number
          role_label?: string | null
          role_type?: Database["public"]["Enums"]["service_request_role_type"]
          service_request_id?: string | null
          service_request_item_id?: string | null
          shift_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_role_slots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_role_slots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_role_slots_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_role_slots_service_request_item_id_fkey"
            columns: ["service_request_item_id"]
            isOneToOne: false
            referencedRelation: "service_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_role_slots_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_timeline: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string
          description: string
          event_type: string
          id: string
          metadata: Json | null
          shift_id: string
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          created_at?: string
          description: string
          event_type: string
          id?: string
          metadata?: Json | null
          shift_id: string
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_timeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_timeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_timeline_shift_id_fkey"
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
            foreignKeyName: "shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "staffing_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
            foreignKeyName: "tax_forms_1099_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
            foreignKeyName: "ticket_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
          entry_source: string
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
          entry_source?: string
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
          entry_source?: string
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
            foreignKeyName: "time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      truth_resolution_log: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          period_status_id: string
          resolution_mode: string
          resolved_at: string
          resolved_by: string
          resolved_employee_id: string | null
          truth_employee_name: string
          truth_hours: number | null
          truth_raw_json: Json | null
          truth_total: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          period_status_id: string
          resolution_mode: string
          resolved_at?: string
          resolved_by: string
          resolved_employee_id?: string | null
          truth_employee_name: string
          truth_hours?: number | null
          truth_raw_json?: Json | null
          truth_total?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          period_status_id?: string
          resolution_mode?: string
          resolved_at?: string
          resolved_by?: string
          resolved_employee_id?: string | null
          truth_employee_name?: string
          truth_hours?: number | null
          truth_raw_json?: Json | null
          truth_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "truth_resolution_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truth_resolution_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      upgrade_requests: {
        Row: {
          company_id: string
          company_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          current_plan: string | null
          id: string
          notes: string | null
          plan_requested: string
          requested_by: string
          resolved_at: string | null
          resolved_by: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          current_plan?: string | null
          id?: string
          notes?: string | null
          plan_requested?: string
          requested_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          current_plan?: string | null
          id?: string
          notes?: string | null
          plan_requested?: string
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upgrade_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upgrade_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_column_preferences: {
        Row: {
          id: string
          page_key: string
          updated_at: string
          user_id: string
          visible_columns: Json
        }
        Insert: {
          id?: string
          page_key?: string
          updated_at?: string
          user_id: string
          visible_columns?: Json
        }
        Update: {
          id?: string
          page_key?: string
          updated_at?: string
          user_id?: string
          visible_columns?: Json
        }
        Relationships: []
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
          avatar_url: string | null
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
          first_name: string | null
          gender: string | null
          headline: string | null
          id: string
          is_available_for_marketplace: boolean | null
          is_profile_public: boolean | null
          last_name: string | null
          primary_phone: string | null
          primary_worker_type:
            | Database["public"]["Enums"]["worker_type_enum"]
            | null
          profile_completion_percent: number | null
          profile_completion_stage: Database["public"]["Enums"]["profile_stage_enum"]
          public_slug: string | null
          referred_by: string | null
          state: string | null
          updated_at: string | null
          user_id: string | null
          verification_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          work_authorization_status:
            | Database["public"]["Enums"]["work_auth_status_enum"]
            | null
          years_of_experience: number | null
          zip_code: string | null
        }
        Insert: {
          avatar_url?: string | null
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
          first_name?: string | null
          gender?: string | null
          headline?: string | null
          id?: string
          is_available_for_marketplace?: boolean | null
          is_profile_public?: boolean | null
          last_name?: string | null
          primary_phone?: string | null
          primary_worker_type?:
            | Database["public"]["Enums"]["worker_type_enum"]
            | null
          profile_completion_percent?: number | null
          profile_completion_stage?: Database["public"]["Enums"]["profile_stage_enum"]
          public_slug?: string | null
          referred_by?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          work_authorization_status?:
            | Database["public"]["Enums"]["work_auth_status_enum"]
            | null
          years_of_experience?: number | null
          zip_code?: string | null
        }
        Update: {
          avatar_url?: string | null
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
          first_name?: string | null
          gender?: string | null
          headline?: string | null
          id?: string
          is_available_for_marketplace?: boolean | null
          is_profile_public?: boolean | null
          last_name?: string | null
          primary_phone?: string | null
          primary_worker_type?:
            | Database["public"]["Enums"]["worker_type_enum"]
            | null
          profile_completion_percent?: number | null
          profile_completion_stage?: Database["public"]["Enums"]["profile_stage_enum"]
          public_slug?: string | null
          referred_by?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          work_authorization_status?:
            | Database["public"]["Enums"]["work_auth_status_enum"]
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
      companies_public: {
        Row: {
          application_cover_url: string | null
          application_enabled: boolean | null
          application_intro: string | null
          brand_color: string | null
          id: string | null
          is_active: boolean | null
          logo_url: string | null
          name: string | null
          slug: string | null
        }
        Insert: {
          application_cover_url?: string | null
          application_enabled?: boolean | null
          application_intro?: string | null
          brand_color?: string | null
          id?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
        }
        Update: {
          application_cover_url?: string | null
          application_enabled?: boolean | null
          application_intro?: string | null
          brand_color?: string | null
          id?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      employee_review_stats: {
        Row: {
          avg_attitude_score: number | null
          avg_communication_score: number | null
          avg_overall_score: number | null
          avg_presentation_score: number | null
          avg_punctuality_score: number | null
          avg_work_quality_score: number | null
          company_id: string | null
          employee_id: string | null
          last_review_at: string | null
          low_score_count_30d: number | null
          no_show_flags_90d: number | null
          total_reviews: number | null
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
            foreignKeyName: "shift_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reviews_reviewed_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reviews_reviewed_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
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
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      office_visits_daily_summary: {
        Row: {
          avg_duration_seconds: number | null
          avg_rating: number | null
          company_id: string | null
          low_rating_count: number | null
          pending_followup_count: number | null
          rated_count: number | null
          resolved_count: number | null
          total_visits: number | null
          unique_employees: number | null
          visit_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_public"
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
      compute_employee_profile_status: {
        Args: { _employee_id: string }
        Returns: Database["public"]["Enums"]["employee_profile_status"]
      }
      compute_profile_stage: {
        Args: { _worker_profile_id: string }
        Returns: Database["public"]["Enums"]["profile_stage_enum"]
      }
      consolidate_all_passports: { Args: never; Returns: Json }
      consolidate_passport: {
        Args: { _worker_profile_id: string }
        Returns: undefined
      }
      consolidate_period_base_pay: {
        Args: { _company_id: string; _period_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_old_invitations: { Args: never; Returns: number }
      generate_shift_link_token: { Args: never; Returns: string }
      generate_shift_review_requests: {
        Args: { _shift_id: string }
        Returns: number
      }
      get_company_by_invite_code: {
        Args: { _invite_code: string }
        Returns: {
          brand_color: string
          id: string
          logo_url: string
          name: string
        }[]
      }
      get_employee_for_activation: {
        Args: { _employee_id: string; _invite_token: string }
        Returns: {
          avatar_url: string
          company_id: string
          email: string
          first_name: string
          last_name: string
          phone_number: string
        }[]
      }
      get_invitation_by_token: {
        Args: { _token: string }
        Returns: {
          company_id: string
          employee_id: string
          expires_at: string
          id: string
          opened_at: string
          status: string
        }[]
      }
      get_profile_status: {
        Args: { _employee_id: string }
        Returns: Database["public"]["Enums"]["employee_profile_status"]
      }
      get_required_documents_for_company: {
        Args: { _company_id: string }
        Returns: string[]
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
      is_company_owner: {
        Args: { _company_id: string; _user_id: string }
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      pick_workers_to_rate: {
        Args: { _shift_id: string }
        Returns: {
          employee_id: string
          priority: number
          sampling_reason: string
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalculate_rep_score: {
        Args: { _worker_profile_id: string }
        Returns: undefined
      }
      recalculate_review_score: {
        Args: {
          _company_id: string
          _entity_id: string
          _entity_type: Database["public"]["Enums"]["review_entity_type"]
        }
        Returns: undefined
      }
      update_invitation_status_by_token: {
        Args: { _new_status: string; _token: string }
        Returns: boolean
      }
      user_can_access_worker_docs: {
        Args: { _user_id: string; _worker_profile_id: string }
        Returns: boolean
      }
      user_company_ids: { Args: { _user_id: string }; Returns: string[] }
      user_is_assigned_to_shift: {
        Args: { _shift_id: string; _user_id: string }
        Returns: boolean
      }
      user_is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "employee"
        | "developer"
        | "owner"
        | "manager"
        | "supervisor"
      billable_unit: "hour" | "day" | "flat"
      calc_mode: "quantity_x_rate" | "manual_value" | "hybrid"
      comp_action_type:
        | "created"
        | "updated"
        | "archived"
        | "imported"
        | "corrected"
        | "system_detected"
        | "inline_table_edit"
      comp_rate_source:
        | "company_default"
        | "job_default"
        | "location_default"
        | "employee_custom"
        | "imported"
      comp_rule_type:
        | "hourly_default"
        | "daily_full"
        | "daily_half"
        | "ride_regular"
        | "ride_special"
        | "custom_daily_pattern"
      comp_source_type:
        | "manual"
        | "import"
        | "migration"
        | "sync"
        | "admin_edit"
        | "inline_edit"
      comp_unit_type: "hour" | "day" | "half_day" | "ride" | "custom"
      concept_category: "extra" | "deduction"
      consent_type:
        | "terms_of_service"
        | "privacy_policy"
        | "background_check"
        | "drug_test"
        | "gps_tracking"
        | "data_sharing"
        | "photo_release"
      deduction_priority_mode:
        | "oldest_first"
        | "newest_first"
        | "highest_balance_first"
        | "manual_priority"
      document_type_enum:
        | "id_card"
        | "passport"
        | "driver_license"
        | "w9"
        | "certification"
        | "background_check"
        | "other"
      employee_profile_status:
        | "incomplete"
        | "pending_documents"
        | "ready"
        | "active"
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
      financial_category:
        | "payroll_advance"
        | "employee_loan"
        | "transport_support"
        | "emergency_support"
        | "payroll_correction"
        | "equipment_deduction"
        | "uniform_related"
        | "other"
      financial_record_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "active"
        | "paused"
        | "paid"
        | "cancelled"
        | "closed_manually"
        | "written_off"
      financial_record_type: "advance" | "loan"
      financial_transaction_type:
        | "disbursement"
        | "payroll_deduction"
        | "manual_adjustment_add"
        | "manual_adjustment_reduce"
        | "pause"
        | "resume"
        | "approval"
        | "cancellation"
        | "manual_close"
        | "reversal"
        | "refund"
        | "writeoff"
        | "repayment_outside_payroll"
      interpreted_payment_type:
        | "hourly"
        | "daily"
        | "ride"
        | "manual_adjustment"
        | "mixed"
        | "unknown"
      invoice_activity_action:
        | "created"
        | "edited"
        | "finalized"
        | "sent"
        | "payment_recorded"
        | "paid"
        | "voided"
        | "reopened"
      invoice_line_type:
        | "service"
        | "fee"
        | "discount"
        | "tax"
        | "adjustment"
        | "manual"
      invoice_payment_method:
        | "zelle"
        | "check"
        | "ach"
        | "cash"
        | "card"
        | "other"
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
      location_context_type_enum: "shift" | "job" | "route" | "general"
      location_event_type_enum:
        | "tracking_started"
        | "tracking_stopped"
        | "entered_geofence"
        | "exited_geofence"
        | "arrived_meeting_point"
        | "arrived_job_site"
        | "stale_location"
        | "manual_checkpoint"
      location_session_status_enum: "active" | "stopped" | "expired"
      location_subject_type_enum:
        | "employee"
        | "shift"
        | "applicant"
        | "provider"
        | "kiosk_device"
      location_type_enum:
        | "billing"
        | "operational"
        | "meeting_point"
        | "job_site"
        | "company_site"
        | "customer_site"
      office_visit_rating: "excellent" | "good" | "regular" | "bad"
      office_visit_status:
        | "in_progress"
        | "resolved"
        | "pending_followup"
        | "requires_admin_review"
        | "cancelled"
      office_visit_type:
        | "pickup_check"
        | "update_data"
        | "submit_documents"
        | "fix_documents"
        | "portal_help"
        | "payment_support"
        | "onboarding"
        | "general_inquiry"
        | "other"
      passport_source:
        | "stafly_shift"
        | "marketplace_booking"
        | "imported_experience"
      payment_mode_type: "hourly" | "daily" | "mixed"
      payment_source_method:
        | "cash"
        | "zelle"
        | "transfer"
        | "check"
        | "payroll_offset"
        | "other"
      proficiency_level: "beginner" | "intermediate" | "advanced" | "expert"
      profile_stage_enum:
        | "minimal"
        | "claim_ready"
        | "work_ready"
        | "payroll_ready"
      profile_visibility: "private" | "limited" | "public"
      rate_source: "concept_default" | "per_employee"
      repayment_mode:
        | "fixed_amount"
        | "percentage_net"
        | "percentage_gross"
        | "one_time_next"
        | "manual"
        | "hybrid"
      reputation_source:
        | "shift_review"
        | "marketplace_review"
        | "attendance"
        | "no_show"
        | "cancellation"
        | "completion_bonus"
        | "manual_adjustment"
      review_entity_type:
        | "employee"
        | "captain"
        | "supervisor"
        | "shift"
        | "client"
        | "worker"
        | "location"
      review_flag_severity: "low" | "medium" | "high" | "critical"
      review_form_type:
        | "captain_to_employee"
        | "employee_to_captain"
        | "employee_to_shift"
        | "captain_to_shift"
        | "admin_to_employee"
        | "client_to_worker"
        | "worker_to_client"
        | "service_experience"
      review_product: "stafly" | "parceros"
      review_reviewer_role:
        | "admin"
        | "owner"
        | "captain"
        | "manager"
        | "supervisor"
        | "client"
        | "peer"
        | "system"
        | "employee"
      review_status:
        | "generated"
        | "pending"
        | "submitted"
        | "expired"
        | "dismissed"
        | "flagged"
      review_type: "post_shift" | "incident" | "periodic"
      service_block_source_status:
        | "pending"
        | "approved"
        | "adjusted"
        | "invoiced"
        | "discarded"
      service_block_source_type: "attendance" | "approval" | "manual"
      service_request_billing_unit: "hourly" | "daily" | "flat"
      service_request_channel:
        | "whatsapp"
        | "phone"
        | "manual"
        | "client_link"
        | "email"
      service_request_gender_req: "none" | "men_only" | "women_only"
      service_request_role_type:
        | "waiter"
        | "captain"
        | "kitchen_staff"
        | "cleaner"
        | "bartender"
        | "other"
      service_request_status:
        | "new"
        | "reviewing"
        | "approved_for_scheduling"
        | "converted_to_shift"
        | "in_progress"
        | "pending_closure_review"
        | "ready_for_billing"
        | "invoiced"
        | "cancelled"
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
      work_auth_status_enum:
        | "citizen"
        | "permanent_resident"
        | "work_visa"
        | "ead"
        | "pending"
        | "not_provided"
      worker_type_enum:
        | "server"
        | "bartender"
        | "cook"
        | "kitchen_help"
        | "runner"
        | "host"
        | "security"
        | "driver"
        | "cleaner"
        | "event_staff"
        | "other"
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
      billable_unit: ["hour", "day", "flat"],
      calc_mode: ["quantity_x_rate", "manual_value", "hybrid"],
      comp_action_type: [
        "created",
        "updated",
        "archived",
        "imported",
        "corrected",
        "system_detected",
        "inline_table_edit",
      ],
      comp_rate_source: [
        "company_default",
        "job_default",
        "location_default",
        "employee_custom",
        "imported",
      ],
      comp_rule_type: [
        "hourly_default",
        "daily_full",
        "daily_half",
        "ride_regular",
        "ride_special",
        "custom_daily_pattern",
      ],
      comp_source_type: [
        "manual",
        "import",
        "migration",
        "sync",
        "admin_edit",
        "inline_edit",
      ],
      comp_unit_type: ["hour", "day", "half_day", "ride", "custom"],
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
      deduction_priority_mode: [
        "oldest_first",
        "newest_first",
        "highest_balance_first",
        "manual_priority",
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
      employee_profile_status: [
        "incomplete",
        "pending_documents",
        "ready",
        "active",
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
      financial_category: [
        "payroll_advance",
        "employee_loan",
        "transport_support",
        "emergency_support",
        "payroll_correction",
        "equipment_deduction",
        "uniform_related",
        "other",
      ],
      financial_record_status: [
        "draft",
        "pending_approval",
        "approved",
        "active",
        "paused",
        "paid",
        "cancelled",
        "closed_manually",
        "written_off",
      ],
      financial_record_type: ["advance", "loan"],
      financial_transaction_type: [
        "disbursement",
        "payroll_deduction",
        "manual_adjustment_add",
        "manual_adjustment_reduce",
        "pause",
        "resume",
        "approval",
        "cancellation",
        "manual_close",
        "reversal",
        "refund",
        "writeoff",
        "repayment_outside_payroll",
      ],
      interpreted_payment_type: [
        "hourly",
        "daily",
        "ride",
        "manual_adjustment",
        "mixed",
        "unknown",
      ],
      invoice_activity_action: [
        "created",
        "edited",
        "finalized",
        "sent",
        "payment_recorded",
        "paid",
        "voided",
        "reopened",
      ],
      invoice_line_type: [
        "service",
        "fee",
        "discount",
        "tax",
        "adjustment",
        "manual",
      ],
      invoice_payment_method: [
        "zelle",
        "check",
        "ach",
        "cash",
        "card",
        "other",
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
      location_context_type_enum: ["shift", "job", "route", "general"],
      location_event_type_enum: [
        "tracking_started",
        "tracking_stopped",
        "entered_geofence",
        "exited_geofence",
        "arrived_meeting_point",
        "arrived_job_site",
        "stale_location",
        "manual_checkpoint",
      ],
      location_session_status_enum: ["active", "stopped", "expired"],
      location_subject_type_enum: [
        "employee",
        "shift",
        "applicant",
        "provider",
        "kiosk_device",
      ],
      location_type_enum: [
        "billing",
        "operational",
        "meeting_point",
        "job_site",
        "company_site",
        "customer_site",
      ],
      office_visit_rating: ["excellent", "good", "regular", "bad"],
      office_visit_status: [
        "in_progress",
        "resolved",
        "pending_followup",
        "requires_admin_review",
        "cancelled",
      ],
      office_visit_type: [
        "pickup_check",
        "update_data",
        "submit_documents",
        "fix_documents",
        "portal_help",
        "payment_support",
        "onboarding",
        "general_inquiry",
        "other",
      ],
      passport_source: [
        "stafly_shift",
        "marketplace_booking",
        "imported_experience",
      ],
      payment_mode_type: ["hourly", "daily", "mixed"],
      payment_source_method: [
        "cash",
        "zelle",
        "transfer",
        "check",
        "payroll_offset",
        "other",
      ],
      proficiency_level: ["beginner", "intermediate", "advanced", "expert"],
      profile_stage_enum: [
        "minimal",
        "claim_ready",
        "work_ready",
        "payroll_ready",
      ],
      profile_visibility: ["private", "limited", "public"],
      rate_source: ["concept_default", "per_employee"],
      repayment_mode: [
        "fixed_amount",
        "percentage_net",
        "percentage_gross",
        "one_time_next",
        "manual",
        "hybrid",
      ],
      reputation_source: [
        "shift_review",
        "marketplace_review",
        "attendance",
        "no_show",
        "cancellation",
        "completion_bonus",
        "manual_adjustment",
      ],
      review_entity_type: [
        "employee",
        "captain",
        "supervisor",
        "shift",
        "client",
        "worker",
        "location",
      ],
      review_flag_severity: ["low", "medium", "high", "critical"],
      review_form_type: [
        "captain_to_employee",
        "employee_to_captain",
        "employee_to_shift",
        "captain_to_shift",
        "admin_to_employee",
        "client_to_worker",
        "worker_to_client",
        "service_experience",
      ],
      review_product: ["stafly", "parceros"],
      review_reviewer_role: [
        "admin",
        "owner",
        "captain",
        "manager",
        "supervisor",
        "client",
        "peer",
        "system",
        "employee",
      ],
      review_status: [
        "generated",
        "pending",
        "submitted",
        "expired",
        "dismissed",
        "flagged",
      ],
      review_type: ["post_shift", "incident", "periodic"],
      service_block_source_status: [
        "pending",
        "approved",
        "adjusted",
        "invoiced",
        "discarded",
      ],
      service_block_source_type: ["attendance", "approval", "manual"],
      service_request_billing_unit: ["hourly", "daily", "flat"],
      service_request_channel: [
        "whatsapp",
        "phone",
        "manual",
        "client_link",
        "email",
      ],
      service_request_gender_req: ["none", "men_only", "women_only"],
      service_request_role_type: [
        "waiter",
        "captain",
        "kitchen_staff",
        "cleaner",
        "bartender",
        "other",
      ],
      service_request_status: [
        "new",
        "reviewing",
        "approved_for_scheduling",
        "converted_to_shift",
        "in_progress",
        "pending_closure_review",
        "ready_for_billing",
        "invoiced",
        "cancelled",
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
      work_auth_status_enum: [
        "citizen",
        "permanent_resident",
        "work_visa",
        "ead",
        "pending",
        "not_provided",
      ],
      worker_type_enum: [
        "server",
        "bartender",
        "cook",
        "kitchen_help",
        "runner",
        "host",
        "security",
        "driver",
        "cleaner",
        "event_staff",
        "other",
      ],
    },
  },
} as const
