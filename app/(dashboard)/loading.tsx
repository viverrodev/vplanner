import { Skeleton, SkeletonCard, SkeletonPage } from "@/components/ui/skeleton";

// Fallback for any dashboard route without its own loading.tsx.
export default function Loading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-9 w-64 mb-3" />
      <Skeleton className="h-4 w-40 mb-10" />
      <SkeletonCard>
        <Skeleton className="h-4 w-1/2 mb-3" />
        <Skeleton className="h-3 w-3/4 mb-2" />
        <Skeleton className="h-3 w-2/3" />
      </SkeletonCard>
    </SkeletonPage>
  );
}
