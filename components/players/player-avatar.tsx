const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
  xxl: "size-32 text-4xl",
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

export function PlayerAvatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars come from Supabase Storage at unknown hosts
      <img
        src={avatarUrl}
        alt=""
        className={`${SIZES[size]} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full
        bg-pitch-700 font-bold text-chalk-dim`}
    >
      {initials(name)}
    </span>
  );
}
