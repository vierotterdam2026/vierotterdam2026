import type { PositionCode } from "@/lib/teams/positions";
import type { SessionStatus } from "@/lib/sessions/state";

export type MemberRole = "player" | "scorekeeper" | "admin";
export type SignupStatus = "confirmed" | "maybe" | "declined";
export type MatchStatus = "scheduled" | "in_progress" | "paused" | "completed" | "cancelled";
export type MatchEventType = "goal";
export type FixtureStatus = "scheduled" | "finished" | "postponed" | "cancelled";
export type PredictionPick = "home" | "draw" | "away";
export type PlayerStat = "goal" | "assist";

/** Compact stand-in for `supabase gen types`: Insert requires only what the DB does. */
type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type FixtureRow = {
  id: string;
  group_id: string;
  home_team: string;
  away_team: string;
  competition: string | null;
  kickoff_at: string;
  status: FixtureStatus;
  home_goals: number | null;
  away_goals: number | null;
  external_source: string | null;
  external_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type FixturePredictionRow = {
  id: string;
  fixture_id: string;
  player_id: string;
  pick: PredictionPick;
  created_at: string;
  updated_at: string;
}

export type PlayerStatAdjustmentRow = {
  id: string;
  group_id: string;
  player_id: string;
  stat: PlayerStat;
  delta: number;
  reason: string;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
}

export type GroupRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  timezone: string;
  default_start_time: string;
  default_end_time: string;
  default_signup_close_days_after: number;
  default_teams_reveal_days_before: number;
  default_teams_reveal_time: string;
  default_signup_deadline_time: string;
  default_venue_id: string | null;
  default_max_players: number | null;
  team_colours: string[];
  created_at: string;
  updated_at: string;
}

export type PlayerRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
  auth_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PlayerCredentialRow = {
  player_id: string;
  pin_hash: string;
  failed_attempts: number;
  locked_until: string | null;
  updated_at: string;
}

export type GroupMemberRow = {
  id: string;
  group_id: string;
  player_id: string;
  role: MemberRole;
  is_active: boolean;
  joined_at: string;
}

export type PlayerPositionRow = {
  id: string;
  player_id: string;
  position: PositionCode;
  preference_rank: number;
  self_rating: number;
  calculated_rating: number | null;
  effective_rating: number;
  created_at: string;
  updated_at: string;
}

export type PlayerAttributesRow = {
  player_id: string;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  overall: number;
  created_at: string;
  updated_at: string;
}

export type VenueRow = {
  id: string;
  group_id: string;
  name: string;
  address: string | null;
  maps_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SessionRow = {
  id: string;
  group_id: string;
  date: string;
  start_time: string;
  end_time: string;
  venue_id: string | null;
  location_override: string | null;
  location_notes: string | null;
  venue_name_snapshot: string | null;
  venue_address_snapshot: string | null;
  venue_notes_snapshot: string | null;
  signup_deadline: string;
  teams_reveal_at: string | null;
  status: SessionStatus;
  note: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SignupRow = {
  id: string;
  session_id: string;
  player_id: string;
  status: SignupStatus;
  created_at: string;
  updated_at: string;
}

export type TeamRow = {
  id: string;
  session_id: string;
  name: string;
  colour: string;
  display_order: number;
  published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TeamMemberRow = {
  id: string;
  team_id: string;
  session_id: string;
  player_id: string;
  assigned_position: PositionCode;
  position_rating_snapshot: number | null;
  preference_rank_snapshot: number | null;
  /** The attributes the player was picked with; null if they had none. Never sent to the browser. */
  attributes_snapshot: Record<string, number> | null;
  is_available: boolean;
  lineup_slot: number | null;
  created_at: string;
}

export type MatchRow = {
  id: string;
  session_id: string;
  team_a_id: string;
  team_b_id: string;
  status: MatchStatus;
  scheduled_order: number;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  timer_elapsed_seconds: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MatchEventRow = {
  id: string;
  match_id: string;
  session_id: string;
  event_type: MatchEventType;
  team_id: string;
  player_id: string | null;
  assist_player_id: string | null;
  match_second: number | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type Database = {
  public: {
    Tables: {
      groups: Table<GroupRow, "name" | "slug">;
      players: Table<PlayerRow, "name">;
      player_credentials: Table<PlayerCredentialRow, "player_id" | "pin_hash">;
      group_members: Table<GroupMemberRow, "group_id" | "player_id">;
      player_positions: {
        Row: PlayerPositionRow;
        // effective_rating is generated by the database, never written.
        Insert: Partial<Omit<PlayerPositionRow, "effective_rating">> &
          Pick<PlayerPositionRow, "player_id" | "position" | "preference_rank" | "self_rating">;
        Update: Partial<Omit<PlayerPositionRow, "effective_rating">>;
        Relationships: [];
      };
      player_attributes: {
        Row: PlayerAttributesRow;
        // overall is generated by the database, never written.
        Insert: Partial<Omit<PlayerAttributesRow, "overall">> &
          Pick<PlayerAttributesRow, "player_id" | "pace" | "shooting" | "passing" | "dribbling" | "defending" | "physical">;
        Update: Partial<Omit<PlayerAttributesRow, "overall">>;
        Relationships: [];
      };
      venues: Table<VenueRow, "group_id" | "name">;
      sessions: Table<SessionRow, "group_id" | "date" | "start_time" | "end_time" | "signup_deadline">;
      signups: Table<SignupRow, "session_id" | "player_id" | "status">;
      teams: Table<TeamRow, "session_id" | "name" | "colour" | "display_order">;
      team_members: Table<TeamMemberRow, "team_id" | "session_id" | "player_id" | "assigned_position">;
      matches: Table<MatchRow, "session_id" | "team_a_id" | "team_b_id" | "scheduled_order">;
      match_events: Table<MatchEventRow, "match_id" | "session_id" | "team_id">;
      fixtures: Table<FixtureRow, "group_id" | "home_team" | "away_team" | "kickoff_at">;
      fixture_predictions: Table<FixturePredictionRow, "fixture_id" | "player_id" | "pick">;
      player_stat_adjustments: Table<PlayerStatAdjustmentRow, "group_id" | "player_id" | "stat" | "delta" | "reason">;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      position_code: PositionCode;
      member_role: MemberRole;
      session_status: SessionStatus;
      signup_status: SignupStatus;
      match_status: MatchStatus;
      match_event_type: MatchEventType;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
