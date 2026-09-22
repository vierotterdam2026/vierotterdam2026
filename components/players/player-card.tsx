import { ATTRIBUTE_KEYS, ATTRIBUTE_SHORT, type Attributes } from "@/lib/players/attributes";
import { POSITION_LABELS, type PositionCode } from "@/lib/teams/positions";
import { PlayerAvatar } from "./player-avatar";

/**
 * A FIFA-style card: overall and main position top left, the other positions
 * top right, the picture, then the six attributes. Private ratings, so it is
 * only ever rendered for the player themself.
 */
export function PlayerCard({
  name,
  avatarUrl,
  positions,
  attributes,
}: {
  name: string;
  avatarUrl: string | null;
  /** In order of preference: the first is the main position. */
  positions: PositionCode[];
  attributes: (Attributes & { overall: number }) | null;
}) {
  const [main, ...others] = positions;

  return (
    <section
      aria-label={`${name}'s card`}
      className="mx-auto w-full max-w-xs overflow-hidden rounded-3xl border-2 border-lime bg-gradient-to-b from-pitch-700 via-pitch-800 to-pitch-900 p-5 shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-left">
          <p className="text-5xl font-black leading-none tabular-nums text-lime">{attributes?.overall ?? "—"}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-chalk-faint">Overall</p>
          {main ? (
            <p className="mt-2 text-xl font-black leading-none text-chalk" title={POSITION_LABELS[main]}>
              {main}
            </p>
          ) : (
            <p className="mt-2 text-xs text-chalk-faint">No position</p>
          )}
        </div>

        <div className="text-right">
          {others.length > 0 ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-chalk-faint">Alternate Positions</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {others.map((position) => (
                  <li key={position} className="text-lg font-black leading-tight text-chalk-dim" title={POSITION_LABELS[position]}>
                    {position}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-col items-center">
        <div className="rounded-full ring-4 ring-lime/60">
          <PlayerAvatar name={name} avatarUrl={avatarUrl} size="xxl" />
        </div>
        <p className="mt-3 max-w-full truncate text-xl font-black uppercase tracking-wide">{name}</p>
      </div>

      <div className="mt-3 border-t border-lime/40 pt-3">
        {attributes ? (
          <ul className="grid grid-cols-3 gap-y-2 text-center">
            {ATTRIBUTE_KEYS.map((key) => (
              <li key={key}>
                <span className="block text-2xl font-black leading-none tabular-nums text-chalk">{attributes[key]}</span>
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-chalk-faint">
                  {ATTRIBUTE_SHORT[key]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-xs text-chalk-faint">Set your ratings below to fill in your card.</p>
        )}
      </div>
    </section>
  );
}
