import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VPlanner",
  description: "Content production management for your team.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
