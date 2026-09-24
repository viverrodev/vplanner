"use client";

import { compressImage, IMAGE_PRESETS, safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateAvatar } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { initialsFor } from "@/lib/avatar";

export function AvatarUploader({
  userId,
  avatarUrl,
  displayName,
  color,
}: {
  userId: string;
  avatarUrl: string | null;
  displayName: string;
  color: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(original: File | undefined) {
    if (!original) return;
    if (!original.type.startsWith("image/")) {
      toast.error("Only image files are allowed.");
      return;
    }
    if (original.size > 25 * 1024 * 1024) {
      toast.error("Keep it under 25MB.");
      return;
    }
    setBusy(true);

    const file = await compressImage(original, IMAGE_PRESETS.avatar);
    const path = `${userId}/avatar-${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type });
    if (uploadError) {
      toast.error("Upload failed.");
      setBusy(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const result = await updateAvatar(data.publicUrl);
    setBusy(false);
    if (result?.error) toast.error(result.error);
    else {
      toast.success("Profile picture updated");
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0 overflow-hidden"
        style={{ background: color }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initialsFor(displayName)
        )}
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-line/15 px-3.5 py-2 text-[12.5px] font-semibold text-ink-soft hover:border-amber hover:text-amber transition-colors disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Change photo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
