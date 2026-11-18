-- Payment requests: "please pay EUR 2.50 for the pitch", shown to each player in
-- the app with a link to the organiser's own payment page (Tikkie, bunq.me ...).
--
-- The app never touches money. It shows an amount and a link, and keeps track of
-- who says they have paid. It cannot see a bank account, so "paid" is a claim
-- until an organiser confirms it; who marked a share tells the two apart.
--
-- Same model as the rest of the schema: the browser gets nothing, every read and
-- write goes through a server action holding the service-role key, which only
-- ever shows a player their own share.

create type payment_status as enum ('requested', 'paid', 'waived');

create table payment_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  -- The Sunday this is for, when there is one.
  session_id uuid references sessions (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  -- What each person pays, in whole cents. Money is never a float.
  amount_cents integer not null check (amount_cents between 10 and 100000),
  payment_url text not null check (payment_url ~ '^https://[^[:space:]]+$' and char_length(payment_url) <= 500),
  -- The last day the link works, in group time. Null when it does not lapse.
  expires_on date,
  created_by uuid references players (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Set when the organiser is done with it; players stop seeing it.
  closed_at timestamptz
);

create index payment_requests_group_idx on payment_requests (group_id, created_at desc);

create table payment_shares (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references payment_requests (id) on delete cascade,
  -- RESTRICT, like the feed's ledgers: a stray delete of a player who owes or has
  -- paid money fails loudly instead of quietly erasing the record.
  player_id uuid not null references players (id) on delete restrict,
  status payment_status not null default 'requested',
  paid_at timestamptz,
  -- Who last changed it. The player themself means they reported it; anyone else
  -- is an organiser confirming it.
  marked_by uuid references players (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, player_id),
  -- A paid share has a time it was paid, and nothing else does.
  check ((status = 'paid') = (paid_at is not null))
);

create index payment_shares_player_idx on payment_shares (player_id);

create trigger payment_shares_set_updated_at before update on payment_shares
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: nothing for the browser
-- ---------------------------------------------------------------------------

alter table payment_requests enable row level security;
alter table payment_shares enable row level security;

-- Hosted Supabase gives anon/authenticated table-wide privileges on new tables;
-- the revoke in the RLS migration only covered tables that existed then.
revoke all on payment_requests, payment_shares from anon, authenticated;

-- No grants and no policies. Who owes what is not for other players to read.
