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
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      audio_tracks: {
        Row: {
          audio_url: string | null
          created_at: string
          day: number
          duration_seconds: number
          id: string
          is_free_preview: boolean
          kind: string
          product_id: string
          sort_order: number
          subtitle: string | null
          title: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          day: number
          duration_seconds?: number
          id?: string
          is_free_preview?: boolean
          kind: string
          product_id: string
          sort_order?: number
          subtitle?: string | null
          title: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          day?: number
          duration_seconds?: number
          id?: string
          is_free_preview?: boolean
          kind?: string
          product_id?: string
          sort_order?: number
          subtitle?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_tracks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          duration_seconds: number
          id: string
          lesson_index: number
          module_index: number
          sort_order: number
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number
          id?: string
          lesson_index?: number
          module_index?: number
          sort_order?: number
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number
          id?: string
          lesson_index?: number
          module_index?: number
          sort_order?: number
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          badge: string | null
          cover_url: string | null
          created_at: string
          days: number
          id: string
          kind: string
          modules: number
          required_product_id: string | null
          slug: string
          sort_order: number
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          badge?: string | null
          cover_url?: string | null
          created_at?: string
          days?: number
          id?: string
          kind?: string
          modules?: number
          required_product_id?: string | null
          slug: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          badge?: string | null
          cover_url?: string | null
          created_at?: string
          days?: number
          id?: string
          kind?: string
          modules?: number
          required_product_id?: string | null
          slug?: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_required_product_id_fkey"
            columns: ["required_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ebooks: {
        Row: {
          badge: string | null
          category: string
          cover_url: string | null
          created_at: string
          file_url: string | null
          id: string
          price_cents: number
          required_product_id: string | null
          sort_order: number
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          badge?: string | null
          category?: string
          cover_url?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          price_cents?: number
          required_product_id?: string | null
          sort_order?: number
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          badge?: string | null
          category?: string
          cover_url?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          price_cents?: number
          required_product_id?: string | null
          sort_order?: number
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebooks_required_product_id_fkey"
            columns: ["required_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          buyer_email: string | null
          created_at: string
          granted_at: string
          id: string
          kirvano_offer_id: string | null
          kirvano_transaction_id: string | null
          metadata: Json
          product_id: string
          revoked_at: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_email?: string | null
          created_at?: string
          granted_at?: string
          id?: string
          kirvano_offer_id?: string | null
          kirvano_transaction_id?: string | null
          metadata?: Json
          product_id: string
          revoked_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_email?: string | null
          created_at?: string
          granted_at?: string
          id?: string
          kirvano_offer_id?: string | null
          kirvano_transaction_id?: string | null
          metadata?: Json
          product_id?: string
          revoked_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archetype: string | null
          created_at: string
          desire: string | null
          email: string | null
          id: string
          ip: string | null
          name: string | null
          referrer: string | null
          risk_flag: boolean
          scores: Json
          situation: string | null
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          archetype?: string | null
          created_at?: string
          desire?: string | null
          email?: string | null
          id?: string
          ip?: string | null
          name?: string | null
          referrer?: string | null
          risk_flag?: boolean
          scores?: Json
          situation?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          archetype?: string | null
          created_at?: string
          desire?: string | null
          email?: string | null
          id?: string
          ip?: string | null
          name?: string | null
          referrer?: string | null
          risk_flag?: boolean
          scores?: Json
          situation?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      louvores: {
        Row: {
          audio_url: string | null
          book: string
          chapter_index: number
          created_at: string
          duration_seconds: number
          id: string
          is_bonus: boolean
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          book: string
          chapter_index?: number
          created_at?: string
          duration_seconds?: number
          id?: string
          is_bonus?: boolean
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          book?: string
          chapter_index?: number
          created_at?: string
          duration_seconds?: number
          id?: string
          is_bonus?: boolean
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_kirvano_offers: {
        Row: {
          created_at: string
          id: string
          kirvano_offer_id: string
          label: string | null
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kirvano_offer_id: string
          label?: string | null
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kirvano_offer_id?: string
          label?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_kirvano_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          anchor_price_cents: number | null
          checkout_url: string | null
          content_ref: Json
          cover_url: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          kind: string
          name: string
          offer_badge: string | null
          offer_headline: string | null
          offer_subtext: string | null
          offer_urgency: string | null
          price_cents: number
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          anchor_price_cents?: number | null
          checkout_url?: string | null
          content_ref?: Json
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
          offer_badge?: string | null
          offer_headline?: string | null
          offer_subtext?: string | null
          offer_urgency?: string | null
          price_cents?: number
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          anchor_price_cents?: number | null
          checkout_url?: string | null
          content_ref?: Json
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          offer_badge?: string | null
          offer_headline?: string | null
          offer_subtext?: string | null
          offer_urgency?: string | null
          price_cents?: number
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          archetype: string | null
          created_at: string
          desire: string | null
          email: string | null
          id: string
          lead_id: string | null
          name: string | null
          situation: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archetype?: string | null
          created_at?: string
          desire?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          name?: string | null
          situation?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archetype?: string | null
          created_at?: string
          desire?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          name?: string | null
          situation?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_responses: {
        Row: {
          answers: Json | null
          archetype: string | null
          created_at: string
          desire: string | null
          id: string
          lead_id: string | null
          situation: string | null
          user_id: string | null
        }
        Insert: {
          answers?: Json | null
          archetype?: string | null
          created_at?: string
          desire?: string | null
          id?: string
          lead_id?: string | null
          situation?: string | null
          user_id?: string | null
        }
        Update: {
          answers?: Json | null
          archetype?: string | null
          created_at?: string
          desire?: string | null
          id?: string
          lead_id?: string | null
          situation?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          id: string
          ticket_id: string
          sender_type: string
          sender_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          sender_type: string
          sender_id: string
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          sender_type?: string
          sender_id?: string
          body?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          id: string
          user_id: string
          category: string
          subject: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category: string
          subject: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          category?: string
          subject?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          request_ip: string | null
          signature: string | null
          signature_valid: boolean
          source: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          request_ip?: string | null
          signature?: string | null
          signature_valid?: boolean
          source?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          request_ip?: string | null
          signature?: string | null
          signature_valid?: boolean
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      grant_entitlement_manual: {
        Args: { _email: string; _product_id: string }
        Returns: string
      }
      has_entitlement: { Args: { _product_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
