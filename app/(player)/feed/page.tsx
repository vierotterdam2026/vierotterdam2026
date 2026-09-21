import { requirePlayerPage } from "@/lib/auth/current-user";
import { getFeed } from "@/lib/data/feed";
import { getGroup } from "@/lib/data/groups";
import { Alert } from "@/components/ui/alert";
import { SectionTitle } from "@/components/ui/card";
import { FixtureCard } from "@/components/feed/fixture-card";
import { PastSundayCard } from "@/components/feed/past-sunday-card";
import { Leaderboard } from "@/components/feed/leaderboard";
import { TopList } from "@/components/feed/top-list";

export const metadata = { title: "Feed — Sunday Football" };

export default async function FeedPage() {
  const user = await requirePlayerPage();
  const group = await getGroup();

  if (!group) {
    return (
      <main className="px-5 py-10">
        <Alert tone="warning">This football group has not been set up yet.</Alert>
      </main>
    );
  }

  const feed = await getFeed(group.id, user.player.id);

  return (
    <main className="flex flex-col gap-6 px-5 pt-8 pb-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime">{group.name}</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Feed</h1>
      </header>

      <div className="grid gap-4">
        <TopList title="Top scorers" rows={feed.topScorers} unit="goals" />
        <TopList title="Top assists" rows={feed.topAssists} unit="assists" />
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Upcoming matches — pick a result</SectionTitle>
        {feed.upcoming.length === 0 ? (
          <Alert tone="info">No matches to predict right now.</Alert>
        ) : (
          feed.upcoming.map((f) => <FixtureCard key={f.id} fixture={f} timezone={group.timezone} />)
        )}
      </section>

      {feed.pastSundays.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Past Sundays</SectionTitle>
          {feed.pastSundays.map((s) => (
            <PastSundayCard key={s.id} sunday={s} timezone={group.timezone} />
          ))}
        </section>
      ) : null}

      <Leaderboard rows={feed.leaderboard} viewerName={user.player.name} />

      {feed.results.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Recent results</SectionTitle>
          {feed.results.map((f) => (
            <FixtureCard key={f.id} fixture={f} timezone={group.timezone} />
          ))}
        </section>
      ) : null}
    </main>
  );
}
