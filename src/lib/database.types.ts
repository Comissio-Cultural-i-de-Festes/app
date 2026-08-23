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
      attendances: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          entry_photo_url: string | null
          estado: string
          event_id: string
          exit_photo_url: string | null
          id: string
          pagado: boolean
          prev_estado: string | null
          user_id: string
          was_registered: boolean | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          entry_photo_url?: string | null
          estado?: string
          event_id: string
          exit_photo_url?: string | null
          id?: string
          pagado?: boolean
          prev_estado?: string | null
          user_id: string
          was_registered?: boolean | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          entry_photo_url?: string | null
          estado?: string
          event_id?: string
          exit_photo_url?: string | null
          id?: string
          pagado?: boolean
          prev_estado?: string | null
          user_id?: string
          was_registered?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "attendances_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          accio: string
          actor_id: string | null
          created_at: string
          detall: Json | null
          id: string
          target_id: string | null
        }
        Insert: {
          accio: string
          actor_id?: string | null
          created_at?: string
          detall?: Json | null
          id?: string
          target_id?: string | null
        }
        Update: {
          accio?: string
          actor_id?: string | null
          created_at?: string
          detall?: Json | null
          id?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_content: {
        Row: {
          cos: Json | null
          event_id: string
          id: string
          ordre: number
          tipus: string
          titol: string | null
          visible_from: string | null
        }
        Insert: {
          cos?: Json | null
          event_id: string
          id?: string
          ordre?: number
          tipus: string
          titol?: string | null
          visible_from?: string | null
        }
        Update: {
          cos?: Json | null
          event_id?: string
          id?: string
          ordre?: number
          tipus?: string
          titol?: string | null
          visible_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_content_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_content_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
        ]
      }
      event_details: {
        Row: {
          cover_url: string | null
          descripcion: string | null
          ends_at: string | null
          event_id: string
          transport_info: string | null
          ubicacion: string | null
        }
        Insert: {
          cover_url?: string | null
          descripcion?: string | null
          ends_at?: string | null
          event_id: string
          transport_info?: string | null
          ubicacion?: string | null
        }
        Update: {
          cover_url?: string | null
          descripcion?: string | null
          ends_at?: string | null
          event_id?: string
          transport_info?: string | null
          ubicacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          cal_confirmacio: boolean
          created_at: string
          created_by: string | null
          id: string
          plazas: number | null
          precio_cents: number
          published: boolean
          puntos: number
          reveal_at: string | null
          starts_at: string
          teaser: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          cal_confirmacio?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          plazas?: number | null
          precio_cents?: number
          published?: boolean
          puntos?: number
          reveal_at?: string | null
          starts_at: string
          teaser?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          cal_confirmacio?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          plazas?: number | null
          precio_cents?: number
          published?: boolean
          puntos?: number
          reveal_at?: string | null
          starts_at?: string
          teaser?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      graus: {
        Row: {
          escola: string
          id: string
          nom: string
          ordre: number
        }
        Insert: {
          escola: string
          id?: string
          nom: string
          ordre?: number
        }
        Update: {
          escola?: string
          id?: string
          nom?: string
          ordre?: number
        }
        Relationships: []
      }
      invite_uses: {
        Row: {
          created_at: string
          invite_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invite_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          invite_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_uses_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_uses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          codi: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_usos: number | null
          revoked: boolean
        }
        Insert: {
          codi: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_usos?: number | null
          revoked?: boolean
        }
        Update: {
          codi?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_usos?: number | null
          revoked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      point_values: {
        Row: {
          clau: string
          mena: string
          ordre: number
          punts: number
        }
        Insert: {
          clau: string
          mena: string
          ordre?: number
          punts: number
        }
        Update: {
          clau?: string
          mena?: string
          ordre?: number
          punts?: number
        }
        Relationships: []
      }
      points_log: {
        Row: {
          client_request_id: string | null
          created_at: string
          event_id: string | null
          granted_by: string | null
          id: string
          motivo: string
          nota: string | null
          puntos: number
          user_id: string
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          event_id?: string | null
          granted_by?: string | null
          id?: string
          motivo: string
          nota?: string | null
          puntos: number
          user_id: string
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          event_id?: string | null
          granted_by?: string | null
          id?: string
          motivo?: string
          nota?: string | null
          puntos?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_log_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_contact: {
        Row: {
          correu: string | null
          id: string
          telefon: string | null
        }
        Insert: {
          correu?: string | null
          id: string
          telefon?: string | null
        }
        Update: {
          correu?: string | null
          id?: string
          telefon?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_contact_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_secret: {
        Row: {
          id: string
          qr_token: string
          rotated_at: string | null
        }
        Insert: {
          id: string
          qr_token?: string
          rotated_at?: string | null
        }
        Update: {
          id?: string
          qr_token?: string
          rotated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_secret_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          curs: number | null
          escola: string | null
          estat: string
          grau: string | null
          hide_from_ranking: boolean
          id: string
          nombre: string
          role: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          curs?: number | null
          escola?: string | null
          estat?: string
          grau?: string | null
          hide_from_ranking?: boolean
          id: string
          nombre: string
          role?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          curs?: number | null
          escola?: string | null
          estat?: string
          grau?: string | null
          hide_from_ranking?: boolean
          id?: string
          nombre?: string
          role?: string
        }
        Relationships: []
      }
      proposal_votes: {
        Row: {
          created_at: string
          proposal_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          proposal_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          proposal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          created_at: string
          descripcio: string | null
          estat: string
          event_id: string | null
          id: string
          titol: string
          user_id: string
          vots: number
        }
        Insert: {
          created_at?: string
          descripcio?: string | null
          estat?: string
          event_id?: string | null
          id?: string
          titol: string
          user_id: string
          vots?: number
        }
        Update: {
          created_at?: string
          descripcio?: string | null
          estat?: string
          event_id?: string | null
          id?: string
          titol?: string
          user_id?: string
          vots?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_periods: {
        Row: {
          codi: string
          ends_at: string | null
          etiqueta: string | null
          mena: string
          ordre: number
          starts_at: string | null
        }
        Insert: {
          codi: string
          ends_at?: string | null
          etiqueta?: string | null
          mena?: string
          ordre?: number
          starts_at?: string | null
        }
        Update: {
          codi?: string
          ends_at?: string | null
          etiqueta?: string | null
          mena?: string
          ordre?: number
          starts_at?: string | null
        }
        Relationships: []
      }
      ride_seats: {
        Row: {
          created_at: string
          ride_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ride_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          ride_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_seats_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_seats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rides: {
        Row: {
          created_at: string
          driver_id: string
          event_id: string
          hora_sortida: string | null
          id: string
          notes: string | null
          origen: string
          places: number
          sentit: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          event_id: string
          hora_sortida?: string | null
          id?: string
          notes?: string | null
          origen: string
          places: number
          sentit: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          event_id?: string
          hora_sortida?: string | null
          id?: string
          notes?: string | null
          origen?: string
          places?: number
          sentit?: string
        }
        Relationships: [
          {
            foreignKeyName: "rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      events_public: {
        Row: {
          cal_confirmacio: boolean | null
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          ends_at: string | null
          id: string | null
          plazas: number | null
          precio_cents: number | null
          published: boolean | null
          puntos: number | null
          reveal_at: string | null
          revelat: boolean | null
          starts_at: string | null
          teaser: string | null
          tipo: string | null
          titulo: string | null
          transport_info: string | null
          ubicacion: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking: {
        Row: {
          avatar_url: string | null
          escola: string | null
          nombre: string | null
          posicio: number | null
          punts: number | null
          user_id: string | null
        }
        Relationships: []
      }
      ranking_escoles: {
        Row: {
          escola: string | null
          esdeveniments: number | null
          membres: number | null
          posicio: number | null
          punts_per_membre: number | null
          punts_totals: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_create_invite: {
        Args: { p_expires_at?: string; p_max_usos?: number }
        Returns: {
          codi: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_usos: number | null
          revoked: boolean
        }
        SetofOptions: {
          from: "*"
          to: "invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_decide_attendance: {
        Args: { p_accepta: boolean; p_event_id: string; p_user_id: string }
        Returns: Json
      }
      admin_delete_event: { Args: { p_event_id: string }; Returns: undefined }
      admin_delete_grau: { Args: { p_id: string }; Returns: undefined }
      admin_revoke_invite: { Args: { p_id: string }; Returns: undefined }
      admin_save_event: {
        Args: {
          p_cal_confirmacio?: boolean
          p_cover_url?: string
          p_descripcion?: string
          p_ends_at?: string
          p_id?: string
          p_plazas?: number
          p_precio_cents?: number
          p_published?: boolean
          p_puntos?: number
          p_reveal_at?: string
          p_starts_at: string
          p_teaser?: string
          p_tipo: string
          p_titulo: string
          p_transport_info?: string
          p_ubicacion?: string
        }
        Returns: string
      }
      admin_save_grau: {
        Args: {
          p_escola: string
          p_id?: string
          p_nom: string
          p_ordre?: number
        }
        Returns: string
      }
      admin_save_periods: { Args: { p_periods: Json }; Returns: undefined }
      admin_set_member_estat: {
        Args: { p_estat: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_member_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_paid: {
        Args: { p_attendance_id: string; p_pagado: boolean }
        Returns: undefined
      }
      admin_set_point_value: {
        Args: {
          p_clau: string
          p_mena: string
          p_ordre?: number
          p_punts: number
        }
        Returns: undefined
      }
      admin_set_published: {
        Args: { p_event_id: string; p_published: boolean }
        Returns: undefined
      }
      admin_undo_checkin: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: undefined
      }
      award_points: {
        Args: {
          p_event_id: string
          p_motivo: string
          p_nota?: string
          p_puntos: number
          p_user_id: string
        }
        Returns: string
      }
      check_in: {
        Args: {
          p_client_request_id?: string
          p_entry_photo_url?: string
          p_event_id: string
          p_qr_token?: string
          p_user_id?: string
        }
        Returns: Json
      }
      checkin_roster: {
        Args: { p_event_id: string }
        Returns: {
          checked_in: boolean
          curs: number
          escola: string
          estado: string
          nombre: string
          pagado: boolean
          token_sha256: string
          user_id: string
        }[]
      }
      claim_first_owner: { Args: never; Returns: undefined }
      invite_preview: { Args: { p_codi: string }; Returns: Json }
      junta_home: { Args: never; Returns: Json }
      my_qr: { Args: never; Returns: string }
      ranking_escoles_period: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          escola: string
          esdeveniments: number
          membres: number
          posicio: number
          punts_per_membre: number
          punts_totals: number
        }[]
      }
      ranking_period: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          avatar_url: string
          escola: string
          nombre: string
          posicio: number
          punts: number
          user_id: string
        }[]
      }
      redeem_invite: { Args: { p_codi: string }; Returns: Json }
      rotate_qr_token: { Args: never; Returns: string }
      set_attendance: {
        Args: { p_estado: string; p_event_id: string }
        Returns: Json
      }
      waitlist_position: { Args: { p_event_id: string }; Returns: number }
      waitlist_size: { Args: { p_event_id: string }; Returns: number }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

