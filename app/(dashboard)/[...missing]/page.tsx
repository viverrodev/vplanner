import { notFound } from "next/navigation";

// Any URL that matches no real page lands here, so it renders the 404
// INSIDE the dashboard shell (with the sidebar) rather than a bare page.
// Real routes always take precedence over this catch-all.
export default function MissingPage() {
  notFound();
}
