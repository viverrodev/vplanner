import { FacebookIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "@/components/ui/platform-icons";
import type { Platform } from "../lib/constants";

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  switch (platform) {
    case "youtube":
      return <YouTubeIcon className={className} />;
    case "instagram":
      return <InstagramIcon className={className} />;
    case "facebook":
      return <FacebookIcon className={className} />;
    case "tiktok":
      return <TikTokIcon className={className} />;
  }
}
