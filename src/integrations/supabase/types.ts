export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      companies: {
        Row: {
          careers_url: string | null;
          category: string;
          created_at: string;
          created_by: string | null;
          hq: string | null;
          id: string;
          name: string;
          website: string | null;
        };
        Insert: {
          careers_url?: string | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          hq?: string | null;
          id?: string;
          name: string;
          website?: string | null;
        };
        Update: {
          careers_url?: string | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          hq?: string | null;
          id?: string;
          name?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          applied_at: string | null;
          closed_at: string | null;
          company_id: string;
          description: string | null;
          experience: string | null;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          location: string | null;
          matched_skills: string[] | null;
          missing_skills: string[] | null;
          score: number | null;
          score_summary: string | null;
          status: string;
          title: string;
          url: string;
          user_id: string;
        };
        Insert: {
          applied_at?: string | null;
          closed_at?: string | null;
          company_id: string;
          description?: string | null;
          experience?: string | null;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          location?: string | null;
          matched_skills?: string[] | null;
          missing_skills?: string[] | null;
          score?: number | null;
          score_summary?: string | null;
          status?: string;
          title: string;
          url: string;
          user_id: string;
        };
        Update: {
          applied_at?: string | null;
          closed_at?: string | null;
          company_id?: string;
          description?: string | null;
          experience?: string | null;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          location?: string | null;
          matched_skills?: string[] | null;
          missing_skills?: string[] | null;
          score?: number | null;
          score_summary?: string | null;
          status?: string;
          title?: string;
          url?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      tracked_companies: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          last_checked_at: string | null;
          last_error: string | null;
          user_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          last_checked_at?: string | null;
          last_error?: string | null;
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          last_checked_at?: string | null;
          last_error?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracked_companies_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          last_scheduled_slot: string | null;
          paused_reason: string | null;
          resume_text: string;
          role_keywords: string[];
          running_until: string | null;
          schedule_enabled: boolean;
          schedule_hours: number[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          last_scheduled_slot?: string | null;
          paused_reason?: string | null;
          resume_text?: string;
          role_keywords?: string[];
          running_until?: string | null;
          schedule_enabled?: boolean;
          schedule_hours?: number[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          last_scheduled_slot?: string | null;
          paused_reason?: string | null;
          resume_text?: string;
          role_keywords?: string[];
          running_until?: string | null;
          schedule_enabled?: boolean;
          schedule_hours?: number[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
