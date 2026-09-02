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
          checkin_dist_m: number | null
          checkin_lat: number | null
          checkin_lng: number | null
          checkin_precisio_m: number | null
          checkin_via: string | null
          created_at: string
          entry_photo_url: string | null
          estado: string
          event_id: string
          exit_photo_at: string | null
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
          checkin_dist_m?: number | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          checkin_precisio_m?: number | null
          checkin_via?: string | null
          created_at?: string
          entry_photo_url?: string | null
          estado?: string
          event_id: string
          exit_photo_at?: string | null
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
          checkin_dist_m?: number | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          checkin_precisio_m?: number | null
          checkin_via?: string | null
          created_at?: string
          entry_photo_url?: string | null
          estado?: string
          event_id?: string
          exit_photo_at?: string | null
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
      badges: {
        Row: {
          codi: string
          earned_at: string
          event_id: string | null
          seen_at: string | null
          user_id: string
        }
        Insert: {
          codi: string
          earned_at?: string
          event_id?: string | null
          seen_at?: string | null
          user_id: string
        }
        Update: {
          codi?: string
          earned_at?: string
          event_id?: string | null
          seen_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "badges_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badges_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badges_user_id_fkey"
            columns: ["user_id"]
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
      event_interest: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_interest_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_interest_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_interest_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_photos: {
        Row: {
          created_at: string
          event_id: string
          hidden_at: string | null
          hidden_by: string | null
          id: string
          path: string
          thumb_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          path: string
          thumb_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          path?: string
          thumb_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_photos_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_title: {
        Row: {
          event_id: string
          titulo: string
        }
        Insert: {
          event_id: string
          titulo: string
        }
        Update: {
          event_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_title_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_title_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          avisat_at: string | null
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
          te_cotxes: boolean
          teaser: string | null
          tipo: string
        }
        Insert: {
          avisat_at?: string | null
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
          te_cotxes?: boolean
          teaser?: string | null
          tipo: string
        }
        Update: {
          avisat_at?: string | null
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
          te_cotxes?: boolean
          teaser?: string | null
          tipo?: string
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
      gimcana_enviaments: {
        Row: {
          client_request_id: string | null
          created_at: string
          equip_id: string
          estat: string
          id: string
          motiu: string | null
          path: string
          prova_id: string
          user_id: string
          validat_a: string | null
          validat_per: string | null
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          equip_id: string
          estat?: string
          id?: string
          motiu?: string | null
          path: string
          prova_id: string
          user_id: string
          validat_a?: string | null
          validat_per?: string | null
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          equip_id?: string
          estat?: string
          id?: string
          motiu?: string | null
          path?: string
          prova_id?: string
          user_id?: string
          validat_a?: string | null
          validat_per?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gimcana_enviaments_equip_id_fkey"
            columns: ["equip_id"]
            isOneToOne: false
            referencedRelation: "gimcana_equips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gimcana_enviaments_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "gimcana_proves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gimcana_enviaments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gimcana_enviaments_validat_per_fkey"
            columns: ["validat_per"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gimcana_equips: {
        Row: {
          escola: string | null
          gimcana_id: string
          id: string
          nom: string | null
          ordre: number
        }
        Insert: {
          escola?: string | null
          gimcana_id: string
          id?: string
          nom?: string | null
          ordre?: number
        }
        Update: {
          escola?: string | null
          gimcana_id?: string
          id?: string
          nom?: string | null
          ordre?: number
        }
        Relationships: [
          {
            foreignKeyName: "gimcana_equips_gimcana_id_fkey"
            columns: ["gimcana_id"]
            isOneToOne: false
            referencedRelation: "gimcanes"
            referencedColumns: ["id"]
          },
        ]
      }
      gimcana_membres: {
        Row: {
          created_at: string
          equip_id: string
          gimcana_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          equip_id: string
          gimcana_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          equip_id?: string
          gimcana_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gimcana_membres_equip_id_fkey"
            columns: ["equip_id"]
            isOneToOne: false
            referencedRelation: "gimcana_equips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gimcana_membres_gimcana_id_fkey"
            columns: ["gimcana_id"]
            isOneToOne: false
            referencedRelation: "gimcanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gimcana_membres_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gimcana_proves: {
        Row: {
          created_at: string
          descripcio: string | null
          gimcana_id: string
          id: string
          ordre: number
          punts: number
          titol: string
        }
        Insert: {
          created_at?: string
          descripcio?: string | null
          gimcana_id: string
          id?: string
          ordre?: number
          punts?: number
          titol: string
        }
        Update: {
          created_at?: string
          descripcio?: string | null
          gimcana_id?: string
          id?: string
          ordre?: number
          punts?: number
          titol?: string
        }
        Relationships: [
          {
            foreignKeyName: "gimcana_proves_gimcana_id_fkey"
            columns: ["gimcana_id"]
            isOneToOne: false
            referencedRelation: "gimcanes"
            referencedColumns: ["id"]
          },
        ]
      }
      gimcanes: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          mena_equips: string
          topall_equip: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          mena_equips?: string
          topall_equip?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          mena_equips?: string
          topall_equip?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gimcanes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gimcanes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gimcanes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events_public"
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
      photo_reports: {
        Row: {
          created_at: string
          id: string
          motiu: string
          photo_id: string
          resolt_at: string | null
          resolt_per: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          motiu: string
          photo_id: string
          resolt_at?: string | null
          resolt_per?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          motiu?: string
          photo_id?: string
          resolt_at?: string | null
          resolt_per?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_reports_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "event_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_reports_resolt_per_fkey"
            columns: ["resolt_per"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_reports_user_id_fkey"
            columns: ["user_id"]
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
          decided_at: string | null
          decided_by: string | null
          descripcio: string | null
          estat: string
          event_id: string | null
          id: string
          nota_junta: string | null
          titol: string
          user_id: string
          vots: number
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          descripcio?: string | null
          estat?: string
          event_id?: string | null
          id?: string
          nota_junta?: string | null
          titol: string
          user_id: string
          vots?: number
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          descripcio?: string | null
          estat?: string
          event_id?: string | null
          id?: string
          nota_junta?: string | null
          titol?: string
          user_id?: string
          vots?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      push_subscription: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscription_user_id_fkey"
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
          convidat_per: string | null
          created_at: string
          estat: string
          ride_id: string
          user_id: string
        }
        Insert: {
          convidat_per?: string | null
          created_at?: string
          estat?: string
          ride_id: string
          user_id: string
        }
        Update: {
          convidat_per?: string | null
          created_at?: string
          estat?: string
          ride_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_seats_convidat_per_fkey"
            columns: ["convidat_per"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          te_cotxes: boolean | null
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
      admin_checkins: {
        Args: { p_event_id: string }
        Returns: {
          avatar_url: string
          checked_in_at: string
          checkin_dist_m: number
          checkin_precisio_m: number
          checkin_via: string
          nombre: string
          pagado: boolean
          user_id: string
          was_registered: boolean
        }[]
      }
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
      admin_dashboard: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      admin_decide_attendance: {
        Args: { p_accepta: boolean; p_event_id: string; p_user_id: string }
        Returns: Json
      }
      admin_decide_photo: {
        Args: { p_despenja: boolean; p_photo_id: string }
        Returns: Json
      }
      admin_decide_proposal: {
        Args: {
          p_accepta: boolean
          p_event_id?: string
          p_id: string
          p_nota?: string
        }
        Returns: Json
      }
      admin_decide_prova: {
        Args: { p_enviament_id: string; p_motiu?: string; p_val: boolean }
        Returns: Json
      }
      admin_delete_event: { Args: { p_event_id: string }; Returns: undefined }
      admin_delete_grau: { Args: { p_id: string }; Returns: undefined }
      admin_event_geo: {
        Args: { p_event_id: string }
        Returns: {
          lat: number
          lng: number
          radi_m: number
        }[]
      }
      admin_gimcana_queue: {
        Args: { p_event_id: string }
        Returns: {
          a_la_cua: number
          equip: string
          escola: string
          id: string
          path: string
          prova: string
          punts: number
          quan: string
          qui: string
        }[]
      }
      admin_reported_photos: {
        Args: never
        Returns: {
          despenjada: boolean
          event_id: string
          motiu: string
          path: string
          photo_id: string
          pujada_per: string
          quantes: number
          thumb_path: string
          titol: string
        }[]
      }
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
          p_te_cotxes?: boolean
          p_teaser?: string
          p_tipo: string
          p_titulo: string
          p_transport_info?: string
          p_ubicacion?: string
        }
        Returns: string
      }
      admin_save_geo: {
        Args: {
          p_event_id: string
          p_lat?: number
          p_lng?: number
          p_radi_m?: number
        }
        Returns: Json
      }
      admin_save_gimcana: {
        Args: {
          p_event_id: string
          p_mena_equips: string
          p_proves: Json
          p_topall?: number
        }
        Returns: Json
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
      admin_save_teams: {
        Args: { p_gimcana_id: string; p_noms: string[] }
        Returns: Json
      }
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
      admin_shuffle_teams: {
        Args: { p_gimcana_id: string; p_quants: number }
        Returns: Json
      }
      admin_transfer_owner: { Args: { p_user_id: string }; Returns: undefined }
      admin_undo_checkin: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: undefined
      }
      admin_undo_prova: { Args: { p_enviament_id: string }; Returns: Json }
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
      badge_holders: {
        Args: never
        Returns: {
          cares: string[]
          codi: string
          quants: number
          total: number
        }[]
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
      check_in_here: {
        Args: {
          p_client_request_id?: string
          p_event_id: string
          p_lat: number
          p_lng: number
          p_precisio_m?: number
          p_taken_at?: string
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
      clear_exit_photo: { Args: { p_event_id: string }; Returns: Json }
      event_interest_size: { Args: { p_event_id: string }; Returns: number }
      event_photo_count: {
        Args: { p_event_id: string }
        Returns: {
          persones: number
          quantes: number
        }[]
      }
      event_photos: {
        Args: { p_event_id: string }
        Returns: {
          created_at: string
          denunciada: boolean
          id: string
          meva: boolean
          nom: string
          path: string
          thumb_path: string
          user_id: string
        }[]
      }
      gimcana_for_event: { Args: { p_event_id: string }; Returns: Json }
      gimcana_scoreboard: {
        Args: { p_gimcana_id: string }
        Returns: {
          equip_id: string
          escola: string
          meu: boolean
          nom: string
          proves: number
          punts: number
        }[]
      }
      gimcana_teams: {
        Args: { p_gimcana_id: string }
        Returns: {
          escola: string
          id: string
          meu: boolean
          nom: string
          quants: number
        }[]
      }
      invite_preview: { Args: { p_codi: string }; Returns: Json }
      invite_to_ride: {
        Args: { p_ride_id: string; p_user_id: string }
        Returns: Json
      }
      join_ride: { Args: { p_ride_id: string }; Returns: Json }
      junta_home: { Args: never; Returns: Json }
      mark_badges_seen: { Args: never; Returns: number }
      my_badges: {
        Args: never
        Returns: {
          codi: string
          earned_at: string
          event_id: string
          nova: boolean
          starts_at: string
          titol: string
        }[]
      }
      my_event_interest: { Args: { p_event_id: string }; Returns: boolean }
      my_photos: {
        Args: never
        Returns: {
          checked_in_at: string
          entry_photo_url: string
          event_id: string
          exit_photo_at: string
          exit_photo_url: string
          starts_at: string
          titulo: string
        }[]
      }
      my_qr: { Args: never; Returns: string }
      my_revealed_interests: { Args: never; Returns: string[] }
      my_streak: { Args: never; Returns: Json }
      pick_team: { Args: { p_equip_id: string }; Returns: Json }
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
      report_photo: {
        Args: { p_motiu: string; p_photo_id: string }
        Returns: Json
      }
      ride_candidates: {
        Args: { p_ride_id: string }
        Returns: {
          avatar_url: string
          nombre: string
          user_id: string
        }[]
      }
      ride_phones: {
        Args: { p_ride_id: string }
        Returns: {
          nombre: string
          telefon: string
          user_id: string
        }[]
      }
      rotate_qr_token: { Args: never; Returns: string }
      set_attendance: {
        Args: { p_estado: string; p_event_id: string }
        Returns: Json
      }
      set_entry_photo: {
        Args: { p_event_id: string; p_path: string }
        Returns: Json
      }
      set_event_interest: {
        Args: { p_event_id: string; p_vol: boolean }
        Returns: Json
      }
      set_exit_photo: {
        Args: { p_event_id: string; p_path: string }
        Returns: Json
      }
      submit_prova: {
        Args: {
          p_client_request_id?: string
          p_path: string
          p_prova_id: string
        }
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

