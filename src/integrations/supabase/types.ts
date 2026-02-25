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
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_sandbox: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_sandbox?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
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
      employees: {
        Row: {
          access_pin: string | null
          added_by: string | null
          added_via: string | null
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
          groups: string | null
          has_car: string | null
          id: string
          is_active: boolean
          last_login: string | null
          last_name: string
          phone_number: string | null
          qualify: string | null
          recommended_by: string | null
          social_security_number: string | null
          start_date: string | null
          tags: string | null
          updated_at: string
          user_id: string | null
          verification_ssn_ein: string | null
        }
        Insert: {
          access_pin?: string | null
          added_by?: string | null
          added_via?: string | null
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
          groups?: string | null
          has_car?: string | null
          id?: string
          is_active?: boolean
          last_login?: string | null
          last_name: string
          phone_number?: string | null
          qualify?: string | null
          recommended_by?: string | null
          social_security_number?: string | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string
          user_id?: string | null
          verification_ssn_ein?: string | null
        }
        Update: {
          access_pin?: string | null
          added_by?: string | null
          added_via?: string | null
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
          groups?: string | null
          has_car?: string | null
          id?: string
          is_active?: boolean
          last_login?: string | null
          last_name?: string
          phone_number?: string | null
          qualify?: string | null
          recommended_by?: string | null
          social_security_number?: string | null
          start_date?: string | null
          tags?: string | null
          updated_at?: string
          user_id?: string | null
          verification_ssn_ein?: string | null
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
      pay_periods: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          end_date: string
          id: string
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
      sensitive_data_audit_log: {
        Row: {
          action: string
          created_at: string
          fields_accessed: string[]
          id: string
          ip_address: string | null
          record_id: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          fields_accessed: string[]
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          fields_accessed?: string[]
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
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
      cleanup_expired_rate_limits: { Args: never; Returns: undefined }
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
      is_global_owner: { Args: { _user_id: string }; Returns: boolean }
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
