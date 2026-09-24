"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SHORTS_VIEW_COOKIE } from "@/modules/short-videos/lib/view-mode";

export async function setShortsViewMode(formData: FormData) {
  const mode = String(formData.get("mode") ?? "table") === "grid" ? "grid" : "table";
  const qs = String(formData.get("qs") ?? "");

  const cookieStore = await cookies();
  cookieStore.set(SHORTS_VIEW_COOKIE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const params = new URLSearchParams(qs);
  params.delete("view");
  redirect(`/shorts${params.toString() ? `?${params}` : ""}`);
}
