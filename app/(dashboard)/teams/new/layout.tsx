import type { Metadata } from "next";

export const metadata: Metadata = { title: "New team" };

export default function NewTeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
