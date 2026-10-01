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
      agri_intelligence_sources: {
        Row: {
          base_url: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          reliability_score: number | null
          source_type: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          reliability_score?: number | null
          source_type: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          reliability_score?: number | null
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agri_intelligence_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_intelligence_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agri_observation_inputs: {
        Row: {
          created_at: string
          id: string
          input_category: string
          observation_id: string
          reasoning: string | null
          urgency: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          input_category: string
          observation_id: string
          reasoning?: string | null
          urgency?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          input_category?: string
          observation_id?: string
          reasoning?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agri_observation_inputs_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "agri_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      agri_observations: {
        Row: {
          advisory_notes: string | null
          confidence_score: number | null
          created_at: string
          created_by: string | null
          crop_name: string
          crop_stage: string
          freshness_status: Database["public"]["Enums"]["freshness_status"]
          geographic_level: Database["public"]["Enums"]["geographic_level"]
          id: string
          observation_date: string
          observed_text: string | null
          organization_id: string
          progress_status: string
          publication_date: string
          region: string
          season: string
          source_id: string
          source_reference_url: string | null
          updated_at: string
        }
        Insert: {
          advisory_notes?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          crop_name: string
          crop_stage: string
          freshness_status?: Database["public"]["Enums"]["freshness_status"]
          geographic_level?: Database["public"]["Enums"]["geographic_level"]
          id?: string
          observation_date: string
          observed_text?: string | null
          organization_id: string
          progress_status: string
          publication_date: string
          region: string
          season: string
          source_id: string
          source_reference_url?: string | null
          updated_at?: string
        }
        Update: {
          advisory_notes?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          crop_name?: string
          crop_stage?: string
          freshness_status?: Database["public"]["Enums"]["freshness_status"]
          geographic_level?: Database["public"]["Enums"]["geographic_level"]
          id?: string
          observation_date?: string
          observed_text?: string | null
          organization_id?: string
          progress_status?: string
          publication_date?: string
          region?: string
          season?: string
          source_id?: string
          source_reference_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agri_observations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_observations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "agri_intelligence_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          organization_id: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_organization_id_parent_id_fkey"
            columns: ["organization_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      customer_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          organization_id: string
          reference_id: string | null
          store_id: string | null
          transaction_type: Database["public"]["Enums"]["ledger_transaction_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          organization_id: string
          reference_id?: string | null
          store_id?: string | null
          transaction_type: Database["public"]["Enums"]["ledger_transaction_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          reference_id?: string | null
          store_id?: string | null
          transaction_type?: Database["public"]["Enums"]["ledger_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          credit_limit: number | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          outstanding_balance: number
          phone_number: string | null
          updated_at: string
          village: string | null
        }
        Insert: {
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          outstanding_balance?: number
          phone_number?: string | null
          updated_at?: string
          village?: string | null
        }
        Update: {
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          outstanding_balance?: number
          phone_number?: string | null
          updated_at?: string
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          damaged_stock: number
          id: string
          incoming_stock: number
          on_hand_stock: number
          organization_id: string
          store_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          damaged_stock?: number
          id?: string
          incoming_stock?: number
          on_hand_stock?: number
          organization_id: string
          store_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          damaged_stock?: number
          id?: string
          incoming_stock?: number
          on_hand_stock?: number
          organization_id?: string
          store_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_organization_id_variant_id_fkey"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_number: string | null
          created_at: string
          created_by: string | null
          disposition: Database["public"]["Enums"]["return_disposition"] | null
          expiry_date: string | null
          id: string
          mfg_date: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          quantity: number
          reference_id: string | null
          store_id: string
          variant_id: string
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          created_by?: string | null
          disposition?: Database["public"]["Enums"]["return_disposition"] | null
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          quantity: number
          reference_id?: string | null
          store_id: string
          variant_id: string
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          created_by?: string | null
          disposition?: Database["public"]["Enums"]["return_disposition"] | null
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          quantity?: number
          reference_id?: string | null
          store_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          batch_number: string | null
          created_at: string
          expires_at: string
          id: string
          quantity: number
          status: Database["public"]["Enums"]["reservation_status"]
          store_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          expires_at: string
          id?: string
          quantity: number
          status?: Database["public"]["Enums"]["reservation_status"]
          store_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["reservation_status"]
          store_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_serials: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          serial_number: string
          status: Database["public"]["Enums"]["serial_status"]
          store_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          serial_number: string
          status?: Database["public"]["Enums"]["serial_status"]
          store_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          serial_number?: string
          status?: Database["public"]["Enums"]["serial_status"]
          store_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_serials_organization_id_variant_id_fkey"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          business_type: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
          village: string | null
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
          village?: string | null
        }
        Update: {
          address?: string | null
          business_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
          village?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          organization_id: string | null
          paid_at: string | null
          provider: string | null
          provider_reference: string | null
          sale_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          store_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          provider?: string | null
          provider_reference?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          provider?: string | null
          provider_reference?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      po_items: {
        Row: {
          batch_number: string | null
          discount_amount: number | null
          discount_percentage: number | null
          expiry_date: string | null
          gross_purchase_cost: number | null
          id: string
          mfg_date: string | null
          organization_id: string
          package_quantity: number | null
          package_unit: string | null
          po_id: string
          po_store_id: string
          purchase_cost: number
          quantity_ordered: number
          quantity_received: number
          units_per_package: number | null
          variant_id: string
        }
        Insert: {
          batch_number?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          expiry_date?: string | null
          gross_purchase_cost?: number | null
          id?: string
          mfg_date?: string | null
          organization_id: string
          package_quantity?: number | null
          package_unit?: string | null
          po_id: string
          po_store_id: string
          purchase_cost: number
          quantity_ordered: number
          quantity_received?: number
          units_per_package?: number | null
          variant_id: string
        }
        Update: {
          batch_number?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          expiry_date?: string | null
          gross_purchase_cost?: number | null
          id?: string
          mfg_date?: string | null
          organization_id?: string
          package_quantity?: number | null
          package_unit?: string | null
          po_id?: string
          po_store_id?: string
          purchase_cost?: number
          quantity_ordered?: number
          quantity_received?: number
          units_per_package?: number | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_items_organization_id_variant_id_fkey"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "po_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_items_po_id_po_store_id_fkey"
            columns: ["po_id", "po_store_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      product_intelligence_cache: {
        Row: {
          avg_daily_sales: number
          classification: Database["public"]["Enums"]["intelligence_classification"]
          confidence_score: number
          days_of_stock: number
          forecast_demand_30d: number
          id: string
          last_calculated_at: string
          organization_id: string
          recommended_purchase_base_units: number
          reorder_point: number
          safety_stock: number
          supplier_lead_time_days: number
          trend_status: Database["public"]["Enums"]["trend_status"]
          variant_id: string
          village_signal: string | null
        }
        Insert: {
          avg_daily_sales?: number
          classification?: Database["public"]["Enums"]["intelligence_classification"]
          confidence_score?: number
          days_of_stock?: number
          forecast_demand_30d?: number
          id?: string
          last_calculated_at?: string
          organization_id: string
          recommended_purchase_base_units?: number
          reorder_point?: number
          safety_stock?: number
          supplier_lead_time_days?: number
          trend_status?: Database["public"]["Enums"]["trend_status"]
          variant_id: string
          village_signal?: string | null
        }
        Update: {
          avg_daily_sales?: number
          classification?: Database["public"]["Enums"]["intelligence_classification"]
          confidence_score?: number
          days_of_stock?: number
          forecast_demand_30d?: number
          id?: string
          last_calculated_at?: string
          organization_id?: string
          recommended_purchase_base_units?: number
          reorder_point?: number
          safety_stock?: number
          supplier_lead_time_days?: number
          trend_status?: Database["public"]["Enums"]["trend_status"]
          variant_id?: string
          village_signal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_intelligence_cache_organization_id_variant_id_fkey"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json | null
          barcode: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          item_size: number
          organization_id: string
          packaging_type: string
          product_id: string
          purchase_cost: number
          purchase_packaging_type: string | null
          purchase_units_per_pack: number | null
          selling_price: number
          sku: string | null
          tracking_mode: Database["public"]["Enums"]["tracking_mode"]
          unit_of_measure: string
          units_per_pack: number
          updated_at: string
        }
        Insert: {
          attributes?: Json | null
          barcode?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_size?: number
          organization_id: string
          packaging_type?: string
          product_id: string
          purchase_cost?: number
          purchase_packaging_type?: string | null
          purchase_units_per_pack?: number | null
          selling_price?: number
          sku?: string | null
          tracking_mode?: Database["public"]["Enums"]["tracking_mode"]
          unit_of_measure?: string
          units_per_pack?: number
          updated_at?: string
        }
        Update: {
          attributes?: Json | null
          barcode?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_size?: number
          organization_id?: string
          packaging_type?: string
          product_id?: string
          purchase_cost?: number
          purchase_packaging_type?: string | null
          purchase_units_per_pack?: number | null
          selling_price?: number
          sku?: string | null
          tracking_mode?: Database["public"]["Enums"]["tracking_mode"]
          unit_of_measure?: string
          units_per_pack?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          additional_discount: number
          amount_paid: number
          created_at: string
          created_by: string | null
          grand_total: number
          id: string
          idempotency_key: string | null
          invoice_discount: number
          organization_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          round_off: number
          status: Database["public"]["Enums"]["po_status"]
          store_id: string
          subtotal: number
          supplier_id: string
          tax_total: number
          updated_at: string
        }
        Insert: {
          additional_discount?: number
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          grand_total?: number
          id?: string
          idempotency_key?: string | null
          invoice_discount?: number
          organization_id: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          round_off?: number
          status?: Database["public"]["Enums"]["po_status"]
          store_id: string
          subtotal?: number
          supplier_id: string
          tax_total?: number
          updated_at?: string
        }
        Update: {
          additional_discount?: number
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          grand_total?: number
          id?: string
          idempotency_key?: string | null
          invoice_discount?: number
          organization_id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          round_off?: number
          status?: Database["public"]["Enums"]["po_status"]
          store_id?: string
          subtotal?: number
          supplier_id?: string
          tax_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_supplier_id_fkey"
            columns: ["organization_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipt_items: {
        Row: {
          batch_number: string | null
          expiry_date: string | null
          id: string
          mfg_date: string | null
          po_item_id: string
          po_item_po_id: string
          quantity_received: number
          receipt_id: string
          receipt_po_id: string
        }
        Insert: {
          batch_number?: string | null
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          po_item_id: string
          po_item_po_id: string
          quantity_received: number
          receipt_id: string
          receipt_po_id: string
        }
        Update: {
          batch_number?: string | null
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          po_item_id?: string
          po_item_po_id?: string
          quantity_received?: number
          receipt_id?: string
          receipt_po_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_items_po_item_id_po_item_po_id_fkey"
            columns: ["po_item_id", "po_item_po_id"]
            isOneToOne: false
            referencedRelation: "po_items"
            referencedColumns: ["id", "po_id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_receipt_id_receipt_po_id_fkey"
            columns: ["receipt_id", "receipt_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id", "po_id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          created_by: string | null
          id: string
          idempotency_key: string | null
          po_id: string
          received_at: string
          status: Database["public"]["Enums"]["receipt_status"]
        }
        Insert: {
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          po_id: string
          received_at?: string
          status?: Database["public"]["Enums"]["receipt_status"]
        }
        Update: {
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          po_id?: string
          received_at?: string
          status?: Database["public"]["Enums"]["receipt_status"]
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          disposition: Database["public"]["Enums"]["return_disposition"]
          id: string
          quantity: number
          return_id: string
          sale_item_id: string
        }
        Insert: {
          disposition?: Database["public"]["Enums"]["return_disposition"]
          id?: string
          quantity: number
          return_id: string
          sale_item_id: string
        }
        Update: {
          disposition?: Database["public"]["Enums"]["return_disposition"]
          id?: string
          quantity?: number
          return_id?: string
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          sale_id: string
          status: Database["public"]["Enums"]["return_status"]
          store_id: string
          total_refund_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          sale_id: string
          status?: Database["public"]["Enums"]["return_status"]
          store_id: string
          total_refund_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          sale_id?: string
          status?: Database["public"]["Enums"]["return_status"]
          store_id?: string
          total_refund_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          batch_number: string | null
          cgst: number
          discount_amount: number
          id: string
          igst: number
          organization_id: string
          product_name: string | null
          quantity: number
          sale_id: string
          sgst: number
          sku: string | null
          tax_rate: number
          total_price: number
          unit_purchase_cost: number
          unit_selling_price: number
          variant_id: string
        }
        Insert: {
          batch_number?: string | null
          cgst?: number
          discount_amount?: number
          id?: string
          igst?: number
          organization_id: string
          product_name?: string | null
          quantity: number
          sale_id: string
          sgst?: number
          sku?: string | null
          tax_rate?: number
          total_price: number
          unit_purchase_cost: number
          unit_selling_price: number
          variant_id: string
        }
        Update: {
          batch_number?: string | null
          cgst?: number
          discount_amount?: number
          id?: string
          igst?: number
          organization_id?: string
          product_name?: string | null
          quantity?: number
          sale_id?: string
          sgst?: number
          sku?: string | null
          tax_rate?: number
          total_price?: number
          unit_purchase_cost?: number
          unit_selling_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_organization_id_variant_id_fkey"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cashier_id: string | null
          created_at: string
          customer_id: string | null
          discount_total: number
          due_date: string | null
          grand_total: number
          id: string
          invoice_number: string | null
          organization_id: string
          status: Database["public"]["Enums"]["sale_status"]
          store_id: string
          subtotal: number
          tax_total: number
          updated_at: string
        }
        Insert: {
          cashier_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount_total?: number
          due_date?: string | null
          grand_total?: number
          id?: string
          invoice_number?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["sale_status"]
          store_id: string
          subtotal?: number
          tax_total?: number
          updated_at?: string
        }
        Update: {
          cashier_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount_total?: number
          due_date?: string | null
          grand_total?: number
          id?: string
          invoice_number?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["sale_status"]
          store_id?: string
          subtotal?: number
          tax_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_store_id_fkey"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_demand_profiles: {
        Row: {
          demand_multiplier: number
          id: string
          month: number
          organization_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          demand_multiplier?: number
          id?: string
          month: number
          organization_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          demand_multiplier?: number
          id?: string
          month?: number
          organization_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_demand_profiles_organization_id_variant_id_fkey"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      store_invoice_sequences: {
        Row: {
          business_year: number
          last_value: number
          store_id: string
        }
        Insert: {
          business_year: number
          last_value?: number
          store_id: string
        }
        Update: {
          business_year?: number
          last_value?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_invoice_sequences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          reference_id: string | null
          store_id: string | null
          supplier_id: string
          transaction_type: Database["public"]["Enums"]["supplier_transaction_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          reference_id?: string | null
          store_id?: string | null
          supplier_id: string
          transaction_type: Database["public"]["Enums"]["supplier_transaction_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          reference_id?: string | null
          store_id?: string | null
          supplier_id?: string
          transaction_type?: Database["public"]["Enums"]["supplier_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ledger_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ledger_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          organization_id: string
          po_id: string | null
          reference: string | null
          store_id: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          organization_id: string
          po_id?: string | null
          reference?: string | null
          store_id: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          organization_id?: string
          po_id?: string | null
          reference?: string | null
          store_id?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_price_history: {
        Row: {
          effective_date: string
          id: string
          organization_id: string
          price: number
          supplier_id: string
          variant_id: string
        }
        Insert: {
          effective_date?: string
          id?: string
          organization_id: string
          price: number
          supplier_id: string
          variant_id: string
        }
        Update: {
          effective_date?: string
          id?: string
          organization_id?: string
          price?: number
          supplier_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_history_organization_id_supplier_id_fkey"
            columns: ["organization_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "supplier_price_history_organization_id_variant_id_fkey"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          active: boolean
          created_at: string
          id: string
          lead_time_override: number | null
          minimum_order_quantity: number
          order_multiple: number
          organization_id: string
          preferred: boolean
          supplier_id: string
          supplier_sku: string | null
          updated_at: string
          variant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          lead_time_override?: number | null
          minimum_order_quantity?: number
          order_multiple?: number
          organization_id: string
          preferred?: boolean
          supplier_id: string
          supplier_sku?: string | null
          updated_at?: string
          variant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          lead_time_override?: number | null
          minimum_order_quantity?: number
          order_multiple?: number
          organization_id?: string
          preferred?: boolean
          supplier_id?: string
          supplier_sku?: string | null
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_organization_id_supplier_id_fkey"
            columns: ["organization_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "supplier_products_organization_id_variant_id_fkey"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      suppliers: {
        Row: {
          attributes: Json | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          outstanding_balance: number
          updated_at: string
        }
        Insert: {
          attributes?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          outstanding_balance?: number
          updated_at?: string
        }
        Update: {
          attributes?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          outstanding_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stores: {
        Row: {
          is_active: boolean
          profile_id: string
          store_id: string
        }
        Insert: {
          is_active?: boolean
          profile_id: string
          store_id: string
        }
        Update: {
          is_active?: boolean
          profile_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stores_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_price_history: {
        Row: {
          effective_date: string
          id: string
          organization_id: string
          purchase_cost: number
          selling_price: number
          variant_id: string
        }
        Insert: {
          effective_date?: string
          id?: string
          organization_id: string
          purchase_cost: number
          selling_price: number
          variant_id: string
        }
        Update: {
          effective_date?: string
          id?: string
          organization_id?: string
          purchase_cost?: number
          selling_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_price_history_organization_id_variant_id_fkey"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      worker_invitations: {
        Row: {
          cancelled_at: string | null
          claimed_at: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          intended_name: string
          organization_id: string
          phone_number: string
          role: Database["public"]["Enums"]["user_role"]
          status: string
          store_id: string
        }
        Insert: {
          cancelled_at?: string | null
          claimed_at?: string | null
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          intended_name: string
          organization_id: string
          phone_number: string
          role: Database["public"]["Enums"]["user_role"]
          status?: string
          store_id: string
        }
        Update: {
          cancelled_at?: string | null
          claimed_at?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          intended_name?: string
          organization_id?: string
          phone_number?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_invitations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_batch_inventory: {
        Row: {
          active_reserved_stock: number | null
          available_stock: number | null
          batch_number: string | null
          expiry_date: string | null
          mfg_date: string | null
          on_hand_stock: number | null
          store_id: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_inventory_available: {
        Row: {
          active_reserved_stock: number | null
          available_stock: number | null
          on_hand_stock: number | null
          store_id: string | null
          variant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_product_intelligence: {
        Args: { p_organization_id: string; p_variant_id: string }
        Returns: undefined
      }
      calculate_supplier_lead_time: {
        Args: { p_variant_id: string }
        Returns: Record<string, unknown>
      }
      calculate_village_intelligence: {
        Args: { p_variant_id: string }
        Returns: string
      }
      can_view_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      canonicalize_phone: { Args: { p_phone: string }; Returns: string }
      claim_worker_invitations: { Args: never; Returns: number }
      create_organization: { Args: { org_name: string }; Returns: string }
      create_organization_and_store: {
        Args: {
          p_address: string
          p_business_type: string
          p_org_name: string
          p_owner_name: string
          p_phone: string
          p_store_name: string
          p_village: string
        }
        Returns: string
      }
      create_product_with_opening_stock: {
        Args: {
          p_attributes?: Json
          p_barcode?: string
          p_category_id?: string
          p_description?: string
          p_image_url?: string
          p_is_active?: boolean
          p_item_size?: number
          p_name: string
          p_opening_stock_packages: number
          p_organization_id: string
          p_packaging_type?: string
          p_purchase_cost: number
          p_selling_price: number
          p_sku: string
          p_store_id: string
          p_tracking_mode?: Database["public"]["Enums"]["tracking_mode"]
          p_unit_of_measure?: string
          p_units_per_pack?: number
          p_variant_image_url?: string
        }
        Returns: Database["public"]["CompositeTypes"]["product_creation_result"]
        SetofOptions: {
          from: "*"
          to: "product_creation_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_product_with_variant: {
        Args: {
          p_attributes?: Json
          p_barcode?: string
          p_category_id?: string
          p_description?: string
          p_image_url?: string
          p_is_active?: boolean
          p_item_size?: number
          p_name: string
          p_organization_id: string
          p_packaging_type?: string
          p_purchase_cost: number
          p_selling_price: number
          p_sku: string
          p_tracking_mode?: Database["public"]["Enums"]["tracking_mode"]
          p_unit_of_measure?: string
          p_units_per_pack?: number
          p_variant_image_url?: string
        }
        Returns: Database["public"]["CompositeTypes"]["product_creation_result"]
        SetofOptions: {
          from: "*"
          to: "product_creation_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_supplier_with_opening_balance: {
        Args: {
          p_attributes: Json
          p_name: string
          p_opening_balance?: number
          p_store_id: string
        }
        Returns: string
      }
      get_historical_stock_for_date: {
        Args: { p_date: string; p_store_id: string; p_variant_id: string }
        Returns: number
      }
      get_intelligence_dashboard: {
        Args: { p_org_id: string }
        Returns: {
          avg_daily_sales: number
          category_id: string
          classification: Database["public"]["Enums"]["intelligence_classification"]
          confidence_score: number
          current_stock: number
          days_of_stock: number
          forecast_demand_30d: number
          incoming_stock: number
          item_size: number
          last_calculated_at: string
          product_id: string
          product_name: string
          purchase_packaging_type: string
          purchase_units_per_pack: number
          recommended_purchase_base_units: number
          reorder_point: number
          safety_stock: number
          supplier_lead_time_days: number
          trend_status: Database["public"]["Enums"]["trend_status"]
          unit_of_measure: string
          variant_id: string
          variant_sku: string
          village_signal: string
        }[]
      }
      invite_worker: {
        Args: {
          p_intended_name: string
          p_phone: string
          p_role: Database["public"]["Enums"]["user_role"]
          p_store_id: string
        }
        Returns: string
      }
      is_org_manager_or_owner: { Args: { org_id: string }; Returns: boolean }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_org_owner: { Args: { org_id: string }; Returns: boolean }
      is_store_member: { Args: { target_store_id: string }; Returns: boolean }
      process_inventory_adjustment: {
        Args: {
          p_movement_type: Database["public"]["Enums"]["movement_type"]
          p_notes?: string
          p_quantity: number
          p_store_id: string
          p_variant_id: string
        }
        Returns: undefined
      }
      process_invoice_purchase:
        | {
            Args: {
              p_idempotency_key: string
              p_items: Json
              p_store_id: string
              p_supplier_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_additional_discount?: number
              p_amount_paid?: number
              p_idempotency_key: string
              p_invoice_discount?: number
              p_items: Json
              p_payment_method?: string
              p_payment_reference?: string
              p_store_id: string
              p_supplier_id: string
              p_tax_total?: number
            }
            Returns: string
          }
        | {
            Args: {
              p_additional_discount?: number
              p_amount_paid?: number
              p_idempotency_key: string
              p_invoice_discount?: number
              p_items: Json
              p_payment_method?: string
              p_payment_reference?: string
              p_round_off?: number
              p_store_id: string
              p_supplier_id: string
              p_tax_total?: number
            }
            Returns: string
          }
      process_purchase_order: {
        Args: {
          p_idempotency_key: string
          p_items: Json
          p_store_id: string
          p_supplier_id: string
        }
        Returns: string
      }
      process_return: {
        Args: {
          p_items: Json
          p_refund_method?: Database["public"]["Enums"]["payment_method"]
          p_sale_id: string
        }
        Returns: string
      }
      process_sale: {
        Args: {
          p_customer_id: string
          p_due_date?: string
          p_items: Json
          p_payments: Json
          p_store_id: string
        }
        Returns: string
      }
      receive_purchase: {
        Args: { p_items: Json; p_po_id: string }
        Returns: string
      }
      record_customer_payment: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_notes?: string
          p_store_id: string
        }
        Returns: string
      }
      record_goods_receipt: {
        Args: { p_idempotency_key: string; p_items: Json; p_po_id: string }
        Returns: string
      }
      record_inventory_movement:
        | {
            Args: {
              p_batch_number?: string
              p_disposition?: Database["public"]["Enums"]["return_disposition"]
              p_expiry_date?: string
              p_mfg_date?: string
              p_movement_type: Database["public"]["Enums"]["movement_type"]
              p_notes?: string
              p_quantity: number
              p_reference_id: string
              p_store_id: string
              p_variant_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_disposition?: Database["public"]["Enums"]["return_disposition"]
              p_movement_type: Database["public"]["Enums"]["movement_type"]
              p_notes?: string
              p_quantity: number
              p_reference_id?: string
              p_store_id: string
              p_variant_id: string
            }
            Returns: string
          }
      record_supplier_payment: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_method: string
          p_notes: string
          p_reference: string
          p_store_id: string
          p_supplier_id: string
        }
        Returns: string
      }
      record_supplier_response: {
        Args: {
          p_po_id: string
          p_status: Database["public"]["Enums"]["po_status"]
        }
        Returns: string
      }
      release_reservation: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      reserve_inventory: {
        Args: {
          p_expires_in_minutes: number
          p_quantity: number
          p_store_id: string
          p_variant_id: string
        }
        Returns: string
      }
      revoke_worker: {
        Args: { p_org_id: string; p_profile_id: string }
        Returns: undefined
      }
      test_inject_historical_movement: {
        Args: {
          p_created_at: string
          p_movement_type: Database["public"]["Enums"]["movement_type"]
          p_quantity: number
          p_store_id: string
          p_variant_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      freshness_status: "FRESH" | "AGING" | "STALE" | "CRITICAL" | "UNAVAILABLE"
      geographic_level: "STATE" | "DISTRICT" | "MANDAL" | "LOCAL_CLUSTER"
      intelligence_classification:
        | "BUY_MORE"
        | "NORMAL"
        | "WATCH"
        | "DO_NOT_BUY"
        | "DEAD_STOCK"
        | "NEW_PRODUCT"
      ledger_transaction_type: "SALE" | "PAYMENT" | "RETURN" | "ADJUSTMENT"
      movement_type:
        | "opening_stock"
        | "sale"
        | "purchase_received"
        | "customer_return"
        | "supplier_return"
        | "damage"
        | "adjustment"
        | "correction"
        | "transfer_out"
        | "transfer_in"
      payment_method: "CASH" | "UPI" | "CARD" | "SPLIT"
      payment_status:
        | "PENDING"
        | "PAID"
        | "FAILED"
        | "PARTIALLY_PAID"
        | "REFUNDED"
      po_status:
        | "DRAFT"
        | "PENDING_APPROVAL"
        | "APPROVED"
        | "ORDERED"
        | "PARTIAL_RECEIVED"
        | "COMPLETED"
        | "CANCELLED"
        | "PENDING"
        | "SUPPLIER_CONFIRMED"
        | "REJECTED"
      receipt_status: "PENDING" | "COMPLETED" | "CANCELLED"
      reservation_status: "ACTIVE" | "EXPIRED" | "COMPLETED" | "CANCELLED"
      return_disposition:
        | "RESELLABLE"
        | "DAMAGED"
        | "WARRANTY"
        | "SUPPLIER_RETURN"
      return_status: "REQUESTED" | "INSPECTED" | "REFUNDED" | "REJECTED"
      sale_status: "PENDING" | "COMPLETED" | "REFUNDED" | "CANCELLED"
      serial_status: "AVAILABLE" | "RESERVED" | "SOLD" | "DAMAGED" | "RETURNED"
      supplier_transaction_type:
        | "OPENING_BALANCE"
        | "PURCHASE"
        | "PAYMENT"
        | "ADJUSTMENT"
        | "RETURN"
      tracking_mode: "NONE" | "SERIALIZED" | "BATCH"
      trend_status:
        | "STABLE"
        | "GROWING"
        | "DECLINING"
        | "SEASONAL"
        | "SPIKE"
        | "INSUFFICIENT_DATA"
      user_role: "OWNER" | "MANAGER" | "CASHIER"
    }
    CompositeTypes: {
      product_creation_result: {
        product_id: string | null
        variant_id: string | null
      }
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
      freshness_status: ["FRESH", "AGING", "STALE", "CRITICAL", "UNAVAILABLE"],
      geographic_level: ["STATE", "DISTRICT", "MANDAL", "LOCAL_CLUSTER"],
      intelligence_classification: [
        "BUY_MORE",
        "NORMAL",
        "WATCH",
        "DO_NOT_BUY",
        "DEAD_STOCK",
        "NEW_PRODUCT",
      ],
      ledger_transaction_type: ["SALE", "PAYMENT", "RETURN", "ADJUSTMENT"],
      movement_type: [
        "opening_stock",
        "sale",
        "purchase_received",
        "customer_return",
        "supplier_return",
        "damage",
        "adjustment",
        "correction",
        "transfer_out",
        "transfer_in",
      ],
      payment_method: ["CASH", "UPI", "CARD", "SPLIT"],
      payment_status: [
        "PENDING",
        "PAID",
        "FAILED",
        "PARTIALLY_PAID",
        "REFUNDED",
      ],
      po_status: [
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED",
        "ORDERED",
        "PARTIAL_RECEIVED",
        "COMPLETED",
        "CANCELLED",
        "PENDING",
        "SUPPLIER_CONFIRMED",
        "REJECTED",
      ],
      receipt_status: ["PENDING", "COMPLETED", "CANCELLED"],
      reservation_status: ["ACTIVE", "EXPIRED", "COMPLETED", "CANCELLED"],
      return_disposition: [
        "RESELLABLE",
        "DAMAGED",
        "WARRANTY",
        "SUPPLIER_RETURN",
      ],
      return_status: ["REQUESTED", "INSPECTED", "REFUNDED", "REJECTED"],
      sale_status: ["PENDING", "COMPLETED", "REFUNDED", "CANCELLED"],
      serial_status: ["AVAILABLE", "RESERVED", "SOLD", "DAMAGED", "RETURNED"],
      supplier_transaction_type: [
        "OPENING_BALANCE",
        "PURCHASE",
        "PAYMENT",
        "ADJUSTMENT",
        "RETURN",
      ],
      tracking_mode: ["NONE", "SERIALIZED", "BATCH"],
      trend_status: [
        "STABLE",
        "GROWING",
        "DECLINING",
        "SEASONAL",
        "SPIKE",
        "INSUFFICIENT_DATA",
      ],
      user_role: ["OWNER", "MANAGER", "CASHIER"],
    },
  },
} as const
