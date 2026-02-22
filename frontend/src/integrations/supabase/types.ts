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
      arbitrage_alerts: {
        Row: {
          id: string
          market_pair: string
          potential_profit_pct: number
          spread: number
          status: string
          timestamp: string
        }
        Insert: {
          id?: string
          market_pair: string
          potential_profit_pct: number
          spread: number
          status?: string
          timestamp?: string
        }
        Update: {
          id?: string
          market_pair?: string
          potential_profit_pct?: number
          spread?: number
          status?: string
          timestamp?: string
        }
        Relationships: []
      }
      market_metadata: {
        Row: {
          event_name: string
          kalshi_ticker: string
          market_key: string
          polymarket_token_id: string | null
          proposition_text: string | null
          resolution_date: string
          settlement_source: string
        }
        Insert: {
          event_name: string
          kalshi_ticker: string
          market_key: string
          polymarket_token_id?: string | null
          proposition_text?: string | null
          resolution_date: string
          settlement_source: string
        }
        Update: {
          event_name?: string
          kalshi_ticker?: string
          market_key?: string
          polymarket_token_id?: string | null
          proposition_text?: string | null
          resolution_date?: string
          settlement_source?: string
        }
        Relationships: []
      }
      market_relationships: {
        Row: {
          arbitrage_flag: string | null
          confidence_score: number
          correlation_strength: string | null
          created_at: string
          id: string
          impact_direction: string | null
          logic_justification: string
          logical_layer: string | null
          market_key_a: string
          market_key_b: string
          probability_a: number | null
          probability_b: number | null
          probability_spread: number | null
          relationship_type: string
          risk_alert: string | null
          vantage_insight: string | null
        }
        Insert: {
          arbitrage_flag?: string | null
          confidence_score: number
          correlation_strength?: string | null
          created_at?: string
          id?: string
          impact_direction?: string | null
          logic_justification: string
          logical_layer?: string | null
          market_key_a: string
          market_key_b: string
          probability_a?: number | null
          probability_b?: number | null
          probability_spread?: number | null
          relationship_type: string
          risk_alert?: string | null
          vantage_insight?: string | null
        }
        Update: {
          arbitrage_flag?: string | null
          confidence_score?: number
          correlation_strength?: string | null
          created_at?: string
          id?: string
          impact_direction?: string | null
          logic_justification?: string
          logical_layer?: string | null
          market_key_a?: string
          market_key_b?: string
          probability_a?: number | null
          probability_b?: number | null
          probability_spread?: number | null
          relationship_type?: string
          risk_alert?: string | null
          vantage_insight?: string | null
        }
        Relationships: []
      }
      market_signals: {
        Row: {
          bid_ask_spread_pct: number | null
          confidence_flag: string | null
          created_at: string
          event_id: string
          id: string
          liquidity_depth_usd: number | null
          liquidity_score: number
          platform: string
          price: number
          probability_pct: number | null
          proposition_name: string
          raw_payload: Json | null
          side: string
          size: number
          timestamp: string
          volume_24h: number | null
        }
        Insert: {
          bid_ask_spread_pct?: number | null
          confidence_flag?: string | null
          created_at?: string
          event_id: string
          id?: string
          liquidity_depth_usd?: number | null
          liquidity_score: number
          platform: string
          price: number
          probability_pct?: number | null
          proposition_name: string
          raw_payload?: Json | null
          side: string
          size: number
          timestamp: string
          volume_24h?: number | null
        }
        Update: {
          bid_ask_spread_pct?: number | null
          confidence_flag?: string | null
          created_at?: string
          event_id?: string
          id?: string
          liquidity_depth_usd?: number | null
          liquidity_score?: number
          platform?: string
          price?: number
          probability_pct?: number | null
          proposition_name?: string
          raw_payload?: Json | null
          side?: string
          size?: number
          timestamp?: string
          volume_24h?: number | null
        }
        Relationships: []
      }
      scenario_reports: {
        Row: {
          affected_edges: Json
          affected_nodes: string[]
          causal_chain: Json
          created_at: string
          id: string
          narrative: string | null
          query: string
          status: string
          trigger_market: string
        }
        Insert: {
          affected_edges?: Json
          affected_nodes?: string[]
          causal_chain?: Json
          created_at?: string
          id?: string
          narrative?: string | null
          query: string
          status?: string
          trigger_market: string
        }
        Update: {
          affected_edges?: Json
          affected_nodes?: string[]
          causal_chain?: Json
          created_at?: string
          id?: string
          narrative?: string | null
          query?: string
          status?: string
          trigger_market?: string
        }
        Relationships: []
      }
    }
    Views: {
      market_spreads_live: {
        Row: {
          confidence: string | null
          event_name: string | null
          kalshi_last_seen: string | null
          kalshi_pct: number | null
          liquidity_depth_usd: number | null
          market_key: string | null
          polymarket_last_seen: string | null
          polymarket_pct: number | null
          resolution_date: string | null
          settlement_source: string | null
          spread_pct: number | null
        }
        Relationships: []
      }
      my_view: {
        Row: {
          bid_ask_spread_pct: number | null
          confidence_flag: string | null
          created_at: string | null
          event_id: string | null
          id: string | null
          liquidity_depth_usd: number | null
          liquidity_score: number | null
          platform: string | null
          price: number | null
          probability_pct: number | null
          proposition_name: string | null
          raw_payload: Json | null
          side: string | null
          size: number | null
          timestamp: string | null
          volume_24h: number | null
        }
        Insert: {
          bid_ask_spread_pct?: number | null
          confidence_flag?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string | null
          liquidity_depth_usd?: number | null
          liquidity_score?: number | null
          platform?: string | null
          price?: number | null
          probability_pct?: number | null
          proposition_name?: string | null
          raw_payload?: Json | null
          side?: string | null
          size?: number | null
          timestamp?: string | null
          volume_24h?: number | null
        }
        Update: {
          bid_ask_spread_pct?: number | null
          confidence_flag?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string | null
          liquidity_depth_usd?: number | null
          liquidity_score?: number | null
          platform?: string | null
          price?: number | null
          probability_pct?: number | null
          proposition_name?: string | null
          raw_payload?: Json | null
          side?: string | null
          size?: number | null
          timestamp?: string | null
          volume_24h?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
