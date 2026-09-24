import { initialsFor } from "@/lib/avatar";

export function PersonAvatar({
  name,
  avatarUrl,
  color,
  className = "w-6 h-6 text-[9.5px]",
}: {
  name: string;
  avatarUrl: string | null;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`${className} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}
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
