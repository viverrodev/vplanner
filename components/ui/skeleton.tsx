/**
 * Loading placeholders. Used by every route's loading.tsx so navigation
 * shows the page's shape IMMEDIATELY while the server fetches data,
 * instead of freezing on the old page.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton rounded-md ${className}`} />;
}

export function SkeletonCircle({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton rounded-full flex-shrink-0 ${className}`} />;
}

/** Page wrapper matching the real pages' padding/width. */
export function SkeletonPage({
  children,
  width = "max-w-3xl",
}: {
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`px-4 sm:px-10 py-5 sm:py-9 w-full ${width} mx-auto`}
    >
      {children}
    </div>
  );
}

export function SkeletonCard({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line/10 bg-surface p-6 ${className}`}>{children}</div>
  );
}

/** A row with an avatar and two text lines — members, comments, etc. */
export function SkeletonPersonRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-line/10 last:border-none">
      <SkeletonCircle className="w-8 h-8" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    </div>
  );
}
