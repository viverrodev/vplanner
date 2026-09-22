"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VIEW_MODE_COOKIE } from "@/lib/view-mode";

export async function setViewMode(formData: FormData) {
  const mode = String(formData.get("mode") ?? "grid");
  const stage = String(formData.get("stage") ?? "");

  const cookieStore = await cookies();
  cookieStore.set(VIEW_MODE_COOKIE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  redirect(`/videos${stage ? `?stage=${stage}` : ""}`);
}
