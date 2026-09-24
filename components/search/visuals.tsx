import { initialsFor } from "@/lib/avatar";

type TeamLike = { name: string; color: string; logo_url: string | null };

export function TeamBadge({ team, size = "w-8 h-8 text-[10.5px]" }: { team: TeamLike; size?: string }) {
  return (
    <span
      className={`${size} rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}
      style={{ background: team.color }}
    >
      {team.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" src={team.logo_url} alt="" className="w-full h-full object-cover" />
      ) : (
        team.name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

export function PersonAvatar({
  name,
  avatarUrl,
  color,
  size = "w-8 h-8 text-[11px]",
}: {
  name: string;
  avatarUrl: string | null;
  color: string;
  size?: string;
}) {
  return (
    <span
      className={`${size} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}
      style={{ background: color }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        initialsFor(name)
      )}
    </span>
  );
}

export function ProjectThumb({ url, color }: { url: string | null; color: string }) {
  return (
    <span
      className="w-14 h-8 rounded-md flex-shrink-0 overflow-hidden border border-line/10"
      style={
        url
          ? undefined
          : { background: `linear-gradient(135deg, color-mix(in srgb, ${color} 35%, transparent), color-mix(in srgb, ${color} 8%, transparent))` }
      }
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" src={url} alt="" className="w-full h-full object-cover" />
      )}
    </span>
  );
}

/** Vertical 9:16 tile for shorts, tinted by stage. */
export function ShortThumb({ color }: { color: string }) {
  return (
    <span
      className="w-14 h-8 rounded-md flex-shrink-0 flex items-center justify-center border border-line/10"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <span
        className="w-[14px] h-[24px] rounded-[3px] border-[1.5px] flex items-center justify-center"
        style={{ borderColor: color }}
      >
        <span
          className="w-0 h-0 border-y-[3.5px] border-y-transparent border-l-[5px]"
          style={{ borderLeftColor: color }}
        />
      </span>
    </span>
  );
}
