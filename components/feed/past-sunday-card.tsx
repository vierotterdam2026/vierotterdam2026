import type { PastSunday } from "@/lib/data/feed";
import { formatSessionDate } from "@/lib/time/group-time";
import { Card, CardBody } from "@/components/ui/card";

export function PastSundayCard({ sunday, timezone }: { sunday: PastSunday; timezone: string }) {
  const cancelled = sunday.status === "cancelled";
  const date = formatSessionDate(sunday.date, timezone);

  return (
    <Card>
      <CardBody className="pt-4">
        <p className="text-xs font-semibold text-chalk-faint">Sunday recap</p>
        <p className="mt-1 text-lg font-black tracking-tight">{date} has passed</p>
        <p className="mt-1 text-sm text-chalk-dim">
          {cancelled
            ? "This Sunday was cancelled."
            : `${sunday.confirmed} ${sunday.confirmed === 1 ? "player" : "players"} signed up.`}
        </p>
      </CardBody>
    </Card>
  );
}
