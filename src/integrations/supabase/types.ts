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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      create_projects: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number | null
          thumb_locked: boolean
          thumb_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          slug: string
          sort_order?: number | null
          thumb_locked?: boolean
          thumb_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
          thumb_locked?: boolean
          thumb_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      generations: {
        Row: {
          aspect_ratio: string
          create_project_id: string | null
          created_at: string
          error: string | null
          height: number | null
          id: string
          image_url: string | null
          liked: boolean
          model: string
          project_id: string | null
          prompt: string
          quality: string
          status: string
          width: number | null
        }
        Insert: {
          aspect_ratio?: string
          create_project_id?: string | null
          created_at?: string
          error?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          liked?: boolean
          model: string
          project_id?: string | null
          prompt: string
          quality?: string
          status?: string
          width?: number | null
        }
        Update: {
          aspect_ratio?: string
          create_project_id?: string | null
          created_at?: string
          error?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          liked?: boolean
          model?: string
          project_id?: string | null
          prompt?: string
          quality?: string
          status?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_create_project_fk"
            columns: ["create_project_id"]
            isOneToOne: false
            referencedRelation: "create_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "create_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ms_avatars: {
        Row: {
          created_at: string
          description: string | null
          gender: string | null
          id: string
          is_builtin: boolean
          name: string
          public_url: string | null
          storage_path: string | null
          user_id: string | null
          voice_id: string | null
          voice_sample_url: string | null
          voice_status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          gender?: string | null
          id?: string
          is_builtin?: boolean
          name: string
          public_url?: string | null
          storage_path?: string | null
          user_id?: string | null
          voice_id?: string | null
          voice_sample_url?: string | null
          voice_status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          gender?: string | null
          id?: string
          is_builtin?: boolean
          name?: string
          public_url?: string | null
          storage_path?: string | null
          user_id?: string | null
          voice_id?: string | null
          voice_sample_url?: string | null
          voice_status?: string
        }
        Relationships: []
      }
      ms_generations: {
        Row: {
          aspect: string | null
          avatar_id: string | null
          create_project_id: string | null
          created_at: string
          duration_seconds: number | null
          error: string | null
          fal_request_id: string | null
          fallback_attempted: boolean
          format: string | null
          id: string
          keyframe_path: string | null
          keyframe_url: string | null
          liked: boolean
          product_id: string | null
          project_id: string | null
          prompt: string
          provider: string | null
          provider_endpoint: string | null
          reference_paths: string[] | null
          resolution: string | null
          script: Json | null
          script_persona: string | null
          script_text: string | null
          stage: string
          status: string
          surface: string | null
          thumb_url: string | null
          updated_at: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          aspect?: string | null
          avatar_id?: string | null
          create_project_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          fal_request_id?: string | null
          fallback_attempted?: boolean
          format?: string | null
          id?: string
          keyframe_path?: string | null
          keyframe_url?: string | null
          liked?: boolean
          product_id?: string | null
          project_id?: string | null
          prompt: string
          provider?: string | null
          provider_endpoint?: string | null
          reference_paths?: string[] | null
          resolution?: string | null
          script?: Json | null
          script_persona?: string | null
          script_text?: string | null
          stage?: string
          status?: string
          surface?: string | null
          thumb_url?: string | null
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          aspect?: string | null
          avatar_id?: string | null
          create_project_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          fal_request_id?: string | null
          fallback_attempted?: boolean
          format?: string | null
          id?: string
          keyframe_path?: string | null
          keyframe_url?: string | null
          liked?: boolean
          product_id?: string | null
          project_id?: string | null
          prompt?: string
          provider?: string | null
          provider_endpoint?: string | null
          reference_paths?: string[] | null
          resolution?: string | null
          script?: Json | null
          script_persona?: string | null
          script_text?: string | null
          stage?: string
          status?: string
          surface?: string | null
          thumb_url?: string | null
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ms_generations_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "ms_avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ms_generations_create_project_fk"
            columns: ["create_project_id"]
            isOneToOne: false
            referencedRelation: "create_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ms_generations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ms_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ms_generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ms_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ms_product_images: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          storage_path: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          storage_path: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          storage_path?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ms_product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ms_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ms_products: {
        Row: {
          brand_color: string | null
          created_at: string
          description: string | null
          error: string | null
          id: string
          name: string
          source_url: string | null
          status: string
          updated_at: string
          user_id: string | null
          vision_analysis: Json | null
        }
        Insert: {
          brand_color?: string | null
          created_at?: string
          description?: string | null
          error?: string | null
          id?: string
          name?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vision_analysis?: Json | null
        }
        Update: {
          brand_color?: string | null
          created_at?: string
          description?: string | null
          error?: string | null
          id?: string
          name?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vision_analysis?: Json | null
        }
        Relationships: []
      }
      ms_projects: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          thumb_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          slug: string
          thumb_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          thumb_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      spaces_edges: {
        Row: {
          created_at: string
          edge_id: string
          id: string
          project_id: string
          source_handle: string | null
          source_node: string
          target_handle: string | null
          target_node: string
        }
        Insert: {
          created_at?: string
          edge_id: string
          id?: string
          project_id: string
          source_handle?: string | null
          source_node: string
          target_handle?: string | null
          target_node: string
        }
        Update: {
          created_at?: string
          edge_id?: string
          id?: string
          project_id?: string
          source_handle?: string | null
          source_node?: string
          target_handle?: string | null
          target_node?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_edges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "spaces_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces_history: {
        Row: {
          content_url: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          model: string | null
          node_id: string | null
          project_id: string
          prompt: string | null
        }
        Insert: {
          content_url?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          node_id?: string | null
          project_id: string
          prompt?: string | null
        }
        Update: {
          content_url?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          node_id?: string | null
          project_id?: string
          prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spaces_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "spaces_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces_nodes: {
        Row: {
          created_at: string
          id: string
          node_data: Json
          node_id: string
          node_type: string
          position_x: number
          position_y: number
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          node_data?: Json
          node_id: string
          node_type: string
          position_x?: number
          position_y?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          node_data?: Json
          node_id?: string
          node_type?: string
          position_x?: number
          position_y?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_nodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "spaces_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces_projects: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      video_generations: {
        Row: {
          aspect_ratio: string
          create_project_id: string | null
          created_at: string
          duration: string
          error: string | null
          id: string
          liked: boolean
          mode: string
          model: string
          project_id: string | null
          prompt: string
          provider: string | null
          reference_images: string[] | null
          resolution: string | null
          response_url: string | null
          stage: string | null
          status: string
          status_url: string | null
          task_id: string | null
          thumbnail_url: string | null
          video_url: string | null
        }
        Insert: {
          aspect_ratio?: string
          create_project_id?: string | null
          created_at?: string
          duration?: string
          error?: string | null
          id?: string
          liked?: boolean
          mode?: string
          model: string
          project_id?: string | null
          prompt?: string
          provider?: string | null
          reference_images?: string[] | null
          resolution?: string | null
          response_url?: string | null
          stage?: string | null
          status?: string
          status_url?: string | null
          task_id?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
        }
        Update: {
          aspect_ratio?: string
          create_project_id?: string | null
          created_at?: string
          duration?: string
          error?: string | null
          id?: string
          liked?: boolean
          mode?: string
          model?: string
          project_id?: string | null
          prompt?: string
          provider?: string | null
          reference_images?: string[] | null
          resolution?: string | null
          response_url?: string | null
          stage?: string | null
          status?: string
          status_url?: string | null
          task_id?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_generations_create_project_fk"
            columns: ["create_project_id"]
            isOneToOne: false
            referencedRelation: "create_projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
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
