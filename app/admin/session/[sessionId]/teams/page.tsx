import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-user";
import { getGroup } from "@/lib/data/groups";
import { getAttendanceSummary, getConfirmedPlayersForGeneration, getSession } from "@/lib/data/sessions";
import { getTeams } from "@/lib/data/teams";
import { SESSION_STATUS_LABELS, teamsVisible } from "@/lib/sessions/state";
import { buildShareText } from "@/lib/teams/share-text";
import { summariseArrangement } from "@/lib/teams/summarise";
import { recommendTeamSizes } from "@/lib/teams/team-sizes";
import { formatDeadline, formatSessionDate } from "@/lib/time/group-time";
import { Alert } from "@/components/ui/alert";
import { SectionTitle } from "@/components/ui/card";
import { GenerateTeamsForm } from "@/components/teams/generate-teams-form";
import { PublishControls } from "@/components/teams/publish-controls";
import { RevealControls } from "@/components/teams/reveal-controls";
import { ShareTeams } from "@/components/teams/share-teams";
import { SizeBalanceNotice } from "@/components/teams/size-balance-notice";
import { TeamBalanceIndicator } from "@/components/teams/team-balance-indicator";
import { AssignLatecomers } from "@/components/teams/assign-latecomers";
import { TeamEditor } from "@/components/teams/team-editor";
import { LineupEditor } from "@/components/teams/lineup-editor";

export default async function TeamGeneratorPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  await requireAdmin();

  const group = await getGroup();
  if (!group) return <Alert tone="warning">This football group has not been set up yet.</Alert>;

  const session = await getSession(sessionId);
  if (!session) notFound();

  const [summary, teams, confirmed] = await Promise.all([
    getAttendanceSummary(session.id, group.id),
    getTeams(session.id, true),
    getConfirmedPlayersForGeneration(session.id),
  ]);

  const assignedIds = new Set(teams.flatMap((t) => t.members.map((m) => m.playerId)));
  // Somebody who signed up after the teams were built (spec §27).
  const latecomers = confirmed.filter((p) => !assignedIds.has(p.id));

  const arrangement = summariseArrangement(
    teams.map((team) => ({
      name: team.name,
      members: team.members.map((m) => ({
        assignedPosition: m.assignedPosition,
        ratingSnapshot: m.ratingSnapshot,
        preferenceRank: m.preferenceRank,
        isAvailable: m.isAvailable,
      })),
    })),
  );

  const published = teams.length > 0 && teams.every((t) => t.published);
  const signupStillOpen = session.status === "signup_open" || session.status === "draft";

  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-chalk-faint">Team generator</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight">
        {formatSessionDate(session.date, group.timezone)}
      </h1>
      <p className="mt-1 mb-6 text-chalk-dim">
        <span className="tabular font-bold text-chalk">{summary.confirmed}</span> players confirmed ·{" "}
        {SESSION_STATUS_LABELS[session.status]}
      </p>

      {signupStillOpen ? (
        <div className="mb-6">
          <Alert tone="info">
            Signup is still open, which is normal — it runs until 15:00 on game day so late changes get
            recorded. Anybody who signs up after you pick teams appears here to be slotted in.
          </Alert>
        </div>
      ) : null}

      {latecomers.length > 0 && teams.length > 0 ? (
        <div className="mb-6">
          <AssignLatecomers players={latecomers.map((p) => ({ id: p.id, name: p.name }))} teams={teams} />
        </div>
      ) : null}

      {!published ? (
        <div className="mb-8">
          <GenerateTeamsForm
            sessionId={session.id}
            confirmedCount={summary.confirmed}
            options={recommendTeamSizes(summary.confirmed)}
            hasExistingTeams={teams.length > 0}
          />
        </div>
      ) : null}

      {teams.length > 0 ? (
        <>
          <div className="mb-6">
            <TeamBalanceIndicator summary={arrangement} />
          </div>

          <SectionTitle className="mb-3">Teams — tap a player to move them</SectionTitle>

          <div className="mb-3">
            <SizeBalanceNotice balance={arrangement.sizeBalance} />
          </div>

          <TeamEditor teams={teams} />

          <div className="mt-8">
            <SectionTitle className="mb-3">Lineup — who starts on the tactics board</SectionTitle>
            <LineupEditor teams={teams} />
          </div>

          <div className="mt-8">
            <SectionTitle className="mb-3">Publish</SectionTitle>
            <PublishControls sessionId={session.id} published={published} />
          </div>

          {published ? (
            <div className="mt-8">
              <SectionTitle className="mb-3">Reveal to players</SectionTitle>
              <RevealControls
                sessionId={session.id}
                revealed={teamsVisible(session)}
                revealLabel={
                  session.teams_reveal_at ? formatDeadline(session.teams_reveal_at, group.timezone) : null
                }
              />
            </div>
          ) : null}

          <div className="mt-8">
            <SectionTitle className="mb-3">Share to Messenger</SectionTitle>
            <ShareTeams
              text={buildShareText(teams, session, {
                groupName: group.name,
                timezone: group.timezone,
                venue: session.venue?.name ?? session.venue_name_snapshot,
                notes: session.location_notes,
              })}
            />
          </div>
        </>
      ) : null}

      <p className="mt-10 text-sm">
        <Link
          href={`/admin/session/${session.id}`}
          className="font-semibold text-chalk-faint underline-offset-4 hover:underline"
        >
          ← Back to Sunday
        </Link>
      </p>
    </>
  );
}
