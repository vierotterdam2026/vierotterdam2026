-- Final schedule: signup closes at 15:00 on the day of the game, and teams are
-- revealed at 21:00 on the Saturday before. Group time. Supersedes the 22:00
-- reveal from 20260922110000_reveal_saturday_2200.sql.

alter table groups
  alter column default_signup_close_days_after set default 0,
  alter column default_signup_deadline_time set default '15:00',
  alter column default_teams_reveal_days_before set default 1,
  alter column default_teams_reveal_time set default '21:00';

comment on column groups.default_signup_close_days_after is
  'Days after the session date that signup closes. 0 = the day of the game.';

update groups
   set default_signup_close_days_after = 0,
       default_signup_deadline_time = '15:00',
       default_teams_reveal_days_before = 1,
       default_teams_reveal_time = '21:00';

-- Sundays still to be played: a signup deadline that has not passed yet moves
-- to the new time.
update sessions s
   set signup_deadline = ((s.date + g.default_signup_close_days_after)
                          + g.default_signup_deadline_time) at time zone g.timezone
  from groups g
 where g.id = s.group_id
   and s.status <> 'cancelled'
   and s.date >= current_date;

-- Reveals that have not happened yet move to Saturday 21:00. One that already
-- happened (including "reveal now") stays as it was.
update sessions s
   set teams_reveal_at = ((s.date - g.default_teams_reveal_days_before)
                          + g.default_teams_reveal_time) at time zone g.timezone
  from groups g
 where g.id = s.group_id
   and s.teams_reveal_at > now()
   and s.status <> 'cancelled';
