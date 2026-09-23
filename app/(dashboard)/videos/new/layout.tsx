import type { Metadata } from "next";

export const metadata: Metadata = { title: "New video idea" };

export default function NewVideoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
