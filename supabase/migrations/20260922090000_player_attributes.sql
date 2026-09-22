-- FIFA-style self-ratings: six attributes on a 1-99 scale plus an overall.
-- Private like player_positions: no grants and no policies, so only server
-- actions (the player themself, and admins) can read or write them.

create table player_attributes (
  player_id uuid primary key references players (id) on delete cascade,
  pace smallint not null check (pace between 1 and 99),
  shooting smallint not null check (shooting between 1 and 99),
  passing smallint not null check (passing between 1 and 99),
  dribbling smallint not null check (dribbling between 1 and 99),
  defending smallint not null check (defending between 1 and 99),
  physical smallint not null check (physical between 1 and 99),
  -- Plain average of the six, rounded. Never entered by hand.
  overall smallint generated always as (
    round((pace + shooting + passing + dribbling + defending + physical)::numeric / 6)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger player_attributes_set_updated_at before update on player_attributes
  for each row execute function set_updated_at();

alter table player_attributes enable row level security;
revoke all on player_attributes from anon, authenticated;
