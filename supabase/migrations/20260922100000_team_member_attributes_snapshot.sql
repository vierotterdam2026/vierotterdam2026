-- The attributes a player was picked with, frozen when teams are generated, so
-- old Sundays never change when a player re-rates. Null for players who had
-- not rated themselves. Deliberately not granted to anon: ratings stay private.
alter table team_members
  add column attributes_snapshot jsonb;
