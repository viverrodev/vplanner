import { NotFoundContent } from "@/components/ui/not-found-content";

// Shown inside the dashboard shell whenever a page calls notFound()
// (deleted project, unknown profile, …) — sidebar stays usable.
export default function DashboardNotFound() {
  return <NotFoundContent />;
}
