export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json
          id: string
          target_user_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_day_lifecycle_events: {
        Row: {
          actor_id: string | null
          cash_day_id: string
          closing_balance: number | null
          closure_kind: string | null
          created_at: string
          event_type: string
          id: string
          idempotency_fingerprint: string
          idempotency_key: string
          reason: string | null
          sequence_no: number
        }
        Insert: {
          actor_id?: string | null
          cash_day_id: string
          closing_balance?: number | null
          closure_kind?: string | null
          created_at?: string
          event_type: string
          id?: string
          idempotency_fingerprint: string
          idempotency_key: string
          reason?: string | null
          sequence_no: number
        }
        Update: {
          actor_id?: string | null
          cash_day_id?: string
          closing_balance?: number | null
          closure_kind?: string | null
          created_at?: string
          event_type?: string
          id?: string
          idempotency_fingerprint?: string
          idempotency_key?: string
          reason?: string | null
          sequence_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_day_lifecycle_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_day_lifecycle_events_cash_day_id_fkey"
            columns: ["cash_day_id"]
            isOneToOne: false
            referencedRelation: "cash_days"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_days: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_balance: number | null
          closure_idempotency_fingerprint: string | null
          closure_idempotency_key: string | null
          closure_kind: string | null
          created_at: string
          id: string
          opening_balance: number
          opening_updated_at: string
          operational_date: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number | null
          closure_idempotency_fingerprint?: string | null
          closure_idempotency_key?: string | null
          closure_kind?: string | null
          created_at?: string
          id?: string
          opening_balance?: number
          opening_updated_at?: string
          operational_date: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number | null
          closure_idempotency_fingerprint?: string | null
          closure_idempotency_key?: string | null
          closure_kind?: string | null
          created_at?: string
          id?: string
          opening_balance?: number
          opening_updated_at?: string
          operational_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_days_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_expense_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      cash_movement_events: {
        Row: {
          actor_id: string
          cash_day_id: string
          created_at: string
          event_type: string
          id: string
          idempotency_fingerprint: string
          idempotency_key: string
          movement_id: string
          new_state: Json | null
          previous_state: Json
          reason: string | null
        }
        Insert: {
          actor_id: string
          cash_day_id: string
          created_at?: string
          event_type: string
          id?: string
          idempotency_fingerprint: string
          idempotency_key: string
          movement_id: string
          new_state?: Json | null
          previous_state: Json
          reason?: string | null
        }
        Update: {
          actor_id?: string
          cash_day_id?: string
          created_at?: string
          event_type?: string
          id?: string
          idempotency_fingerprint?: string
          idempotency_key?: string
          movement_id?: string
          new_state?: Json | null
          previous_state?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_movement_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movement_events_cash_day_id_fkey"
            columns: ["cash_day_id"]
            isOneToOne: false
            referencedRelation: "cash_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movement_events_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          actor_id: string
          amount: number
          cash_day_id: string
          created_at: string
          description: string | null
          direction: string
          expense_category_code: string | null
          expense_category_id: string | null
          expense_category_name: string | null
          id: string
          idempotency_fingerprint: string
          idempotency_key: string
          is_payment_reversal: boolean
        }
        Insert: {
          actor_id: string
          amount: number
          cash_day_id: string
          created_at?: string
          description?: string | null
          direction: string
          expense_category_code?: string | null
          expense_category_id?: string | null
          expense_category_name?: string | null
          id?: string
          idempotency_fingerprint: string
          idempotency_key: string
          is_payment_reversal?: boolean
        }
        Update: {
          actor_id?: string
          amount?: number
          cash_day_id?: string
          created_at?: string
          description?: string | null
          direction?: string
          expense_category_code?: string | null
          expense_category_id?: string | null
          expense_category_name?: string | null
          id?: string
          idempotency_fingerprint?: string
          idempotency_key?: string
          is_payment_reversal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_cash_day_id_fkey"
            columns: ["cash_day_id"]
            isOneToOne: false
            referencedRelation: "cash_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_expense_category_id_fkey"
            columns: ["expense_category_id"]
            isOneToOne: false
            referencedRelation: "cash_expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_opening_events: {
        Row: {
          actor_id: string
          cash_day_id: string
          created_at: string
          id: string
          idempotency_fingerprint: string
          idempotency_key: string
          new_amount: number
          previous_amount: number
        }
        Insert: {
          actor_id: string
          cash_day_id: string
          created_at?: string
          id?: string
          idempotency_fingerprint: string
          idempotency_key: string
          new_amount: number
          previous_amount: number
        }
        Update: {
          actor_id?: string
          cash_day_id?: string
          created_at?: string
          id?: string
          idempotency_fingerprint?: string
          idempotency_key?: string
          new_amount?: number
          previous_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_opening_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_opening_events_cash_day_id_fkey"
            columns: ["cash_day_id"]
            isOneToOne: false
            referencedRelation: "cash_days"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          name_key: string | null
          section_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          name_key?: string | null
          section_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          name_key?: string | null
          section_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "catalog_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_item_events: {
        Row: {
          action: string
          actor_id: string
          catalog_item_id: string | null
          catalog_item_name: string
          created_at: string
          details: Json
          id: string
        }
        Insert: {
          action: string
          actor_id: string
          catalog_item_id?: string | null
          catalog_item_name: string
          created_at?: string
          details?: Json
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string
          catalog_item_id?: string | null
          catalog_item_name?: string
          created_at?: string
          details?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_item_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_item_events_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          created_at: string
          created_by: string
          garment_layer: Database["public"]["Enums"]["garment_layer"] | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["catalog_item_kind"]
          name: string
          name_key: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          created_by: string
          garment_layer?: Database["public"]["Enums"]["garment_layer"] | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["catalog_item_kind"]
          name: string
          name_key?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          created_by?: string
          garment_layer?: Database["public"]["Enums"]["garment_layer"] | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["catalog_item_kind"]
          name?: string
          name_key?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_option_values: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          option_id: string
          position: number
          updated_at: string
          updated_by: string
          value: string
          value_key: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          option_id: string
          position?: number
          updated_at?: string
          updated_by: string
          value: string
          value_key?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          option_id?: string
          position?: number
          updated_at?: string
          updated_by?: string
          value?: string
          value_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_option_values_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_option_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "catalog_product_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_option_values_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_options: {
        Row: {
          code: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          position: number
          product_id: string
          selection_mode: Database["public"]["Enums"]["catalog_option_selection_mode"]
          updated_at: string
          updated_by: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          position?: number
          product_id: string
          selection_mode: Database["public"]["Enums"]["catalog_option_selection_mode"]
          updated_at?: string
          updated_by: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          product_id?: string
          selection_mode?: Database["public"]["Enums"]["catalog_option_selection_mode"]
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_options_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_options_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_products: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string
          garment_layer: Database["public"]["Enums"]["garment_layer"] | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["catalog_product_kind"]
          legacy_catalog_item_id: string | null
          name: string
          name_key: string | null
          section_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by: string
          garment_layer?: Database["public"]["Enums"]["garment_layer"] | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["catalog_product_kind"]
          legacy_catalog_item_id?: string | null
          name: string
          name_key?: string | null
          section_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string
          garment_layer?: Database["public"]["Enums"]["garment_layer"] | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["catalog_product_kind"]
          legacy_catalog_item_id?: string | null
          name?: string
          name_key?: string | null
          section_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_products_category_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_legacy_catalog_item_id_fkey"
            columns: ["legacy_catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "catalog_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sections: {
        Row: {
          code: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_sections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_catalog_items: {
        Row: {
          catalog_item_id: string | null
          catalog_kind: Database["public"]["Enums"]["catalog_item_kind"]
          created_at: string
          garment_layer: Database["public"]["Enums"]["garment_layer"] | null
          id: string
          item_name: string
          order_id: string
          selection_key: string
        }
        Insert: {
          catalog_item_id?: string | null
          catalog_kind: Database["public"]["Enums"]["catalog_item_kind"]
          created_at?: string
          garment_layer?: Database["public"]["Enums"]["garment_layer"] | null
          id?: string
          item_name: string
          order_id: string
          selection_key: string
        }
        Update: {
          catalog_item_id?: string | null
          catalog_kind?: Database["public"]["Enums"]["catalog_item_kind"]
          created_at?: string
          garment_layer?: Database["public"]["Enums"]["garment_layer"] | null
          id?: string
          item_name?: string
          order_id?: string
          selection_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_catalog_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_catalog_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_change_events: {
        Row: {
          action: string
          actor_id: string
          change_note: string | null
          created_at: string
          details: Json
          id: string
          idempotency_fingerprint: string
          idempotency_key: string
          order_id: string
          order_updated_at: string
        }
        Insert: {
          action: string
          actor_id: string
          change_note?: string | null
          created_at?: string
          details?: Json
          id?: string
          idempotency_fingerprint: string
          idempotency_key: string
          order_id: string
          order_updated_at: string
        }
        Update: {
          action?: string
          actor_id?: string
          change_note?: string | null
          created_at?: string
          details?: Json
          id?: string
          idempotency_fingerprint?: string
          idempotency_key?: string
          order_id?: string
          order_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_change_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_change_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_comments: {
        Row: {
          actor_id: string
          body: string
          created_at: string
          id: string
          idempotency_fingerprint: string
          idempotency_key: string
          order_id: string
        }
        Insert: {
          actor_id: string
          body: string
          created_at?: string
          id?: string
          idempotency_fingerprint: string
          idempotency_key: string
          order_id: string
        }
        Update: {
          actor_id?: string
          body?: string
          created_at?: string
          id?: string
          idempotency_fingerprint?: string
          idempotency_key?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_comments_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_comments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_design_image_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          idempotency_fingerprint: string
          idempotency_key: string
          image_updated_at: string
          object_path: string
          order_id: string
          previous_object_path: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          idempotency_fingerprint: string
          idempotency_key: string
          image_updated_at: string
          object_path: string
          order_id: string
          previous_object_path?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          idempotency_fingerprint?: string
          idempotency_key?: string
          image_updated_at?: string
          object_path?: string
          order_id?: string
          previous_object_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_design_image_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_design_image_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_design_images: {
        Row: {
          byte_size: number
          content_type: string
          created_at: string
          object_path: string
          order_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          byte_size: number
          content_type: string
          created_at?: string
          object_path: string
          order_id: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          byte_size?: number
          content_type?: string
          created_at?: string
          object_path?: string
          order_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_design_images_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_design_images_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_financials: {
        Row: {
          created_at: string
          deposit_amount: number
          deposit_paid: boolean
          order_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deposit_amount: number
          deposit_paid?: boolean
          order_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deposit_amount?: number
          deposit_paid?: boolean
          order_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_financials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_shields: {
        Row: {
          created_at: string
          id: string
          order_line_id: string
          position: number
          shield_name_snapshot: string
          shield_product_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_line_id: string
          position: number
          shield_name_snapshot: string
          shield_product_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_line_id?: string
          position?: number
          shield_name_snapshot?: string
          shield_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_line_shields_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_shields_shield_product_id_fkey"
            columns: ["shield_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          color: string | null
          configuration: Json
          created_at: string
          id: string
          line_type: Database["public"]["Enums"]["order_line_type"]
          order_id: string
          position: number
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          configuration?: Json
          created_at?: string
          id?: string
          line_type: Database["public"]["Enums"]["order_line_type"]
          order_id: string
          position: number
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          configuration?: Json
          created_at?: string
          id?: string
          line_type?: Database["public"]["Enums"]["order_line_type"]
          order_id?: string
          position?: number
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payment_events: {
        Row: {
          actor_id: string
          event_type: string
          fingerprint: string
          id: string
          idempotency_key: string
          occurred_at: string
          order_payment_id: string
          order_snapshot: Json
          payment_snapshot: Json
          stage: string
        }
        Insert: {
          actor_id: string
          event_type: string
          fingerprint: string
          id?: string
          idempotency_key: string
          occurred_at?: string
          order_payment_id: string
          order_snapshot: Json
          payment_snapshot: Json
          stage: string
        }
        Update: {
          actor_id?: string
          event_type?: string
          fingerprint?: string
          id?: string
          idempotency_key?: string
          occurred_at?: string
          order_payment_id?: string
          order_snapshot?: Json
          payment_snapshot?: Json
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_events_order_payment_id_fkey"
            columns: ["order_payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          actor_id: string
          amount: number
          cash_movement_id: string | null
          confirmed_at: string
          fingerprint: string
          id: string
          idempotency_key: string
          order_id: string
          reversal_cash_movement_id: string | null
          reversed_at: string | null
        }
        Insert: {
          actor_id: string
          amount: number
          cash_movement_id?: string | null
          confirmed_at?: string
          fingerprint: string
          id?: string
          idempotency_key: string
          order_id: string
          reversal_cash_movement_id?: string | null
          reversed_at?: string | null
        }
        Update: {
          actor_id?: string
          amount?: number
          cash_movement_id?: string | null
          confirmed_at?: string
          fingerprint?: string
          id?: string
          idempotency_key?: string
          order_id?: string
          reversal_cash_movement_id?: string | null
          reversed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_reversal_cash_movement_id_fkey"
            columns: ["reversal_cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stage_events: {
        Row: {
          actor_id: string
          created_at: string
          from_stage_id: string | null
          from_stage_name: string | null
          id: string
          idempotency_fingerprint: string | null
          idempotency_key: string | null
          order_id: string
          to_stage_id: string
          to_stage_name: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          from_stage_id?: string | null
          from_stage_name?: string | null
          id?: string
          idempotency_fingerprint?: string | null
          idempotency_key?: string | null
          order_id: string
          to_stage_id: string
          to_stage_name?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          from_stage_id?: string | null
          from_stage_name?: string | null
          id?: string
          idempotency_fingerprint?: string | null
          idempotency_key?: string | null
          order_id?: string
          to_stage_id?: string
          to_stage_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_stage_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_stage_events_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_stage_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_stage_events_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_name: string | null
          created_at: string
          created_by: string
          current_stage_id: string
          customer_name: string | null
          description: string | null
          id: string
          idempotency_fingerprint: string
          idempotency_key: string
          order_date: string
          order_type: Database["public"]["Enums"]["order_type"] | null
          phone: string | null
          promised_delivery_date: string
          public_number: number
          quantity: number
          team_name: string | null
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          created_by: string
          current_stage_id: string
          customer_name?: string | null
          description?: string | null
          id?: string
          idempotency_fingerprint: string
          idempotency_key: string
          order_date: string
          order_type?: Database["public"]["Enums"]["order_type"] | null
          phone?: string | null
          promised_delivery_date: string
          public_number?: number
          quantity: number
          team_name?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          created_by?: string
          current_stage_id?: string
          customer_name?: string | null
          description?: string | null
          id?: string
          idempotency_fingerprint?: string
          idempotency_key?: string
          order_date?: string
          order_type?: Database["public"]["Enums"]["order_type"] | null
          phone?: string | null
          promised_delivery_date?: string
          public_number?: number
          quantity?: number
          team_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          must_change_password: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          is_active?: boolean
          must_change_password?: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      workflow_stage_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json
          id: string
          idempotency_fingerprint: string
          idempotency_key: string
          workflow_stage_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json
          id?: string
          idempotency_fingerprint: string
          idempotency_key: string
          workflow_stage_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json
          id?: string
          idempotency_fingerprint?: string
          idempotency_key?: string
          workflow_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stage_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stage_events_workflow_stage_id_fkey"
            columns: ["workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_stages: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          position: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cash_current_actor_is_operational: { Args: never; Returns: boolean }
      cash_m10_effective_movements: {
        Args: { p_day_id: string }
        Returns: {
          actor_id: string
          amount: number
          cash_day_id: string
          created_at: string
          description: string
          direction: string
          expense_category_code: string
          expense_category_id: string
          expense_category_name: string
          movement_id: string
          voided: boolean
        }[]
      }
      close_cash_day: {
        Args: { p_cash_day_id: string; p_idempotency_key: string }
        Returns: {
          cash_day_id: string
          closed_at: string
          closed_by: string
          closing_balance: string
          closure_kind: string
        }[]
      }
      confirm_order_payment: {
        Args: {
          p_expected_updated_at: string
          p_idempotency_key: string
          p_order_id: string
        }
        Returns: {
          amount: number
          cash_movement_id: string
          confirmed_at: string
          event_id: string
          from_stage_id: string
          order_id: string
          payment_id: string
          public_number: number
          stage_code: string
          to_stage_id: string
          updated_at: string
        }[]
      }
      correct_cash_movement: {
        Args: {
          p_amount: number
          p_description: string
          p_direction: string
          p_expense_category_id: string
          p_idempotency_key: string
          p_movement_id: string
        }
        Returns: {
          actor_id: string
          amount: number
          cash_day_id: string
          created_at: string
          description: string
          direction: string
          event_id: string
          expense_category_code: string
          expense_category_id: string
          expense_category_name: string
          movement_id: string
        }[]
      }
      correct_cash_movement_m10: {
        Args: {
          p_amount: number
          p_description: string
          p_direction: string
          p_expense_category_id: string
          p_idempotency_key: string
          p_movement_id: string
        }
        Returns: {
          actor_id: string
          amount: number
          cash_day_id: string
          created_at: string
          description: string
          direction: string
          event_id: string
          expense_category_code: string
          expense_category_id: string
          expense_category_name: string
          movement_id: string
        }[]
      }
      create_cash_movement: {
        Args: {
          p_amount: number
          p_description: string
          p_direction: string
          p_expense_category_id: string
          p_idempotency_key: string
        }
        Returns: {
          actor_id: string
          amount: number
          cash_day_id: string
          created_at: string
          description: string
          direction: string
          expense_category_code: string
          expense_category_id: string
          expense_category_name: string
          movement_id: string
        }[]
      }
      create_catalog_category: {
        Args: { target_name: string; target_section_id: string }
        Returns: string
      }
      create_catalog_item: {
        Args: {
          target_garment_layer: string
          target_kind: Database["public"]["Enums"]["catalog_item_kind"]
          target_name: string
        }
        Returns: string
      }
      create_catalog_option_value: {
        Args: { target_option_id: string; target_value: string }
        Returns: string
      }
      create_catalog_product: {
        Args: {
          target_category_id: string
          target_kind: Database["public"]["Enums"]["catalog_product_kind"]
          target_name: string
          target_section_id: string
        }
        Returns: string
      }
      create_catalog_product_option: {
        Args: {
          target_code: string
          target_name: string
          target_product_id: string
          target_selection_mode: Database["public"]["Enums"]["catalog_option_selection_mode"]
        }
        Returns: string
      }
      create_catalog_product_without_category: {
        Args: {
          target_kind: Database["public"]["Enums"]["catalog_product_kind"]
          target_name: string
          target_section_id: string
        }
        Returns: string
      }
      create_catalog_section: {
        Args: { target_code: string; target_name: string }
        Returns: string
      }
      create_managed_profile: {
        Args: {
          target_display_name: string
          target_id: string
          target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      create_order: {
        Args: {
          p_client_name: string
          p_deposit_amount: string
          p_deposit_paid: boolean
          p_description: string
          p_idempotency_key: string
          p_lines: Json
          p_order_date: string
          p_phone: string
          p_promised_delivery_date: string
          p_team_name: string
          p_total_amount: string
        }
        Returns: {
          order_id: string
          public_number: number
          stage_code: string
        }[]
      }
      create_order_comment: {
        Args: { p_body: string; p_idempotency_key: string; p_order_id: string }
        Returns: {
          comment_id: string
          created_at: string
        }[]
      }
      create_workflow_stage: {
        Args: { p_idempotency_key: string; p_name: string }
        Returns: {
          event_id: string
          stage_code: string
          stage_id: string
          stage_name: string
          stage_position: number
        }[]
      }
      current_active_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      delete_catalog_item: { Args: { target_id: string }; Returns: undefined }
      ensure_catalog_section: {
        Args: { target_code: string; target_name: string }
        Returns: string
      }
      ensure_current_cash_day: {
        Args: never
        Returns: {
          cash_day_id: string
          opening_balance: number
          opening_updated_at: string
          operational_date: string
        }[]
      }
      finalize_order_design_image: {
        Args: {
          p_actor_id: string
          p_expected_image_updated_at?: string
          p_idempotency_key: string
          p_object_path: string
          p_order_id: string
        }
        Returns: {
          event_id: string
          image_updated_at: string
          object_path: string
          order_id: string
          previous_object_path: string
        }[]
      }
      get_cash_day_summary: {
        Args: { p_cash_day_id: string }
        Returns: {
          cash_day_id: string
          closed_at: string
          closed_by: string
          closed_by_display_name: string
          closing_balance: string
          closure_kind: string
          events: Json
          lifecycle_events: Json
          movements: Json
          opening_balance: number
          opening_updated_at: string
          operational_date: string
        }[]
      }
      get_current_cash_summary: {
        Args: never
        Returns: {
          cash_day_id: string
          categories: Json
          closed_at: string
          closed_by: string
          closed_by_display_name: string
          closing_balance: number
          closure_kind: string
          current_balance: string
          movements: Json
          opening_balance: number
          opening_updated_at: string
          operational_date: string
        }[]
      }
      get_order_board: {
        Args: { p_search?: string }
        Returns: {
          current_stage_id: string
          customer_name: string
          has_design_image: boolean
          id: string
          image_updated_at: string
          order_type: Database["public"]["Enums"]["order_type"]
          payment_confirmed_at: string
          promised_delivery_date: string
          public_number: number
          quantity: number
          team_name: string
          total_amount: number
          updated_at: string
        }[]
      }
      get_order_timeline: {
        Args: { p_order_id: string }
        Returns: {
          actor_display_name: string
          change_note: string
          comment_body: string
          details: Json
          event_id: string
          event_type: string
          from_stage_id: string
          occurred_at: string
          to_stage_id: string
        }[]
      }
      list_closed_cash_days: {
        Args: never
        Returns: {
          cash_day_id: string
          closed_at: string
          closed_by: string
          closed_by_display_name: string
          closing_balance: string
          closure_kind: string
          operational_date: string
        }[]
      }
      m11_payment_fingerprint: {
        Args: { p_expected_updated_at: string; p_order_id: string }
        Returns: string
      }
      m12_reversal_fingerprint: {
        Args: {
          p_expected_updated_at: string
          p_order_id: string
          p_payment_id: string
          p_reason: string
        }
        Returns: string
      }
      move_order: {
        Args: {
          p_expected_updated_at: string
          p_from_stage_id: string
          p_idempotency_key: string
          p_order_id: string
          p_to_stage_id: string
        }
        Returns: {
          event_id: string
          from_stage_id: string
          order_id: string
          public_number: number
          stage_code: string
          to_stage_id: string
          updated_at: string
        }[]
      }
      pr1_snapshot_legacy_options: { Args: { options: Json }; Returns: Json }
      pr1_validate_legacy_options: {
        Args: { needs_lower: boolean; needs_upper: boolean; options: Json }
        Returns: undefined
      }
      pr1a_assert_actor: {
        Args: { allowed_roles: Database["public"]["Enums"]["app_role"][] }
        Returns: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          must_change_password: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pr1a_insert_lines: {
        Args: { lines: Json; target_order_id: string }
        Returns: undefined
      }
      pr1a_snapshot_options: {
        Args: { p_product_id: string; selections: Json }
        Returns: Json
      }
      pr1a_validate_line: { Args: { line: Json }; Returns: undefined }
      pr1a_validate_option_selections: {
        Args: { p_product_id: string; selections: Json }
        Returns: undefined
      }
      prepare_password_reset: {
        Args: { target_id: string }
        Returns: undefined
      }
      record_password_reset_result: {
        Args: { succeeded: boolean; target_id: string }
        Returns: undefined
      }
      rename_catalog_category: {
        Args: { target_id: string; target_name: string }
        Returns: undefined
      }
      rename_catalog_item: {
        Args: { target_id: string; target_name: string }
        Returns: undefined
      }
      rename_catalog_product: {
        Args: { target_id: string; target_name: string }
        Returns: undefined
      }
      rename_workflow_stage: {
        Args: {
          p_expected_updated_at: string
          p_idempotency_key: string
          p_name: string
          p_stage_id: string
        }
        Returns: {
          event_id: string
          stage_id: string
          stage_name: string
        }[]
      }
      reopen_cash_day: {
        Args: {
          p_cash_day_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: {
          cash_day_id: string
          event_id: string
          reason: string
          reopened_at: string
          reopened_by: string
          sequence_no: number
        }[]
      }
      reorder_workflow_stages: {
        Args: {
          p_expected_stage_ids: string[]
          p_idempotency_key: string
          p_stage_ids: string[]
        }
        Returns: {
          event_id: string
        }[]
      }
      retire_workflow_stage: {
        Args: {
          p_expected_updated_at: string
          p_idempotency_key: string
          p_stage_id: string
        }
        Returns: {
          event_id: string
          stage_id: string
        }[]
      }
      reverse_order_payment: {
        Args: {
          p_expected_updated_at: string
          p_idempotency_key: string
          p_order_id: string
          p_payment_id: string
          p_reason?: string
        }
        Returns: {
          amount: number
          event_id: string
          from_stage_id: string
          order_id: string
          payment_id: string
          reversal_cash_movement_id: string
          stage_code: string
          to_stage_id: string
          updated_at: string
        }[]
      }
      set_cash_opening: {
        Args: {
          p_amount: number
          p_expected_opening_updated_at: string
          p_idempotency_key: string
        }
        Returns: {
          cash_day_id: string
          event_id: string
          opening_balance: number
          opening_updated_at: string
        }[]
      }
      set_catalog_category_active: {
        Args: { target_id: string; target_is_active: boolean }
        Returns: undefined
      }
      set_catalog_product_active: {
        Args: { target_id: string; target_is_active: boolean }
        Returns: undefined
      }
      update_managed_profile: {
        Args: {
          target_id: string
          target_is_active: boolean
          target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      update_order: {
        Args: {
          p_change_note: string
          p_client_name: string
          p_deposit_amount: number
          p_deposit_paid: boolean
          p_description: string
          p_expected_updated_at: string
          p_idempotency_key: string
          p_lines: Json
          p_order_date: string
          p_order_id: string
          p_phone: string
          p_promised_delivery_date: string
          p_team_name: string
          p_total_amount: number
        }
        Returns: {
          event_id: string
          order_id: string
          updated_at: string
        }[]
      }
      update_order_description: {
        Args: {
          p_change_note: string
          p_description: string
          p_expected_updated_at: string
          p_idempotency_key: string
          p_order_id: string
        }
        Returns: {
          event_id: string
          order_id: string
          updated_at: string
        }[]
      }
      void_cash_movement: {
        Args: {
          p_idempotency_key: string
          p_movement_id: string
          p_reason: string
        }
        Returns: {
          cash_day_id: string
          event_id: string
          movement_id: string
          voided: boolean
        }[]
      }
      void_cash_movement_m10: {
        Args: {
          p_idempotency_key: string
          p_movement_id: string
          p_reason: string
        }
        Returns: {
          cash_day_id: string
          event_id: string
          movement_id: string
          voided: boolean
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "attention" | "employee"
      catalog_item_kind:
        | "garment"
        | "neckline"
        | "upper_pattern"
        | "lower_pattern"
        | "fabric"
        | "extra"
      catalog_option_selection_mode: "single" | "multiple"
      catalog_product_kind: "garment" | "flag" | "bag" | "shield"
      garment_layer: "upper" | "lower"
      order_line_type: "individual" | "set" | "flag" | "bag" | "shield"
      order_type: "set" | "individual"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "attention", "employee"],
      catalog_item_kind: [
        "garment",
        "neckline",
        "upper_pattern",
        "lower_pattern",
        "fabric",
        "extra",
      ],
      catalog_option_selection_mode: ["single", "multiple"],
      catalog_product_kind: ["garment", "flag", "bag", "shield"],
      garment_layer: ["upper", "lower"],
      order_line_type: ["individual", "set", "flag", "bag", "shield"],
      order_type: ["set", "individual"],
    },
  },
} as const

