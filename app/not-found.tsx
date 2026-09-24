import type { Metadata } from "next";
import { NotFoundContent } from "@/components/ui/not-found-content";

export const metadata: Metadata = { title: "Page not found" };

// Root fallback (outside the dashboard shell).
export default function NotFound() {
  return <NotFoundContent inShell={false} />;
}
