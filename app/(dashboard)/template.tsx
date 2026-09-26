/**
 * Re-mounts on every navigation inside the dashboard, so each page gets
 * a soft rise-in (off when the user or their device turns motion off).
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-page">{children}</div>;
}
