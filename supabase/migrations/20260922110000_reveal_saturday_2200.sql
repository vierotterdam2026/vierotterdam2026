-- Teams are now revealed on the Saturday evening before a Sunday game, at 22:00
-- (was: Friday 23:59). 1 day before, 22:00 group time.

alter table groups
  alter column default_teams_reveal_days_before set default 1,
  alter column default_teams_reveal_time set default '22:00';

comment on column groups.default_teams_reveal_days_before is
  'Days before the session that teams are revealed. 1 = the Saturday before a Sunday game.';

update groups
   set default_teams_reveal_days_before = 1,
       default_teams_reveal_time = '22:00';

-- Move the reveal of any Sunday whose teams are not visible yet. A reveal that
-- has already happened (including "reveal now") stays as it was.
update sessions s
   set teams_reveal_at = ((s.date - g.default_teams_reveal_days_before)
                          + g.default_teams_reveal_time) at time zone g.timezone
  from groups g
 where g.id = s.group_id
   and s.teams_reveal_at > now()
   and s.status <> 'cancelled';
