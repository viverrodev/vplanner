import { Skeleton, SkeletonCard, SkeletonPage, SkeletonPersonRow } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="w-14 h-14 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
        <SkeletonCard>
          <Skeleton className="h-3 w-28 mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonPersonRow key={i} />
          ))}
        </SkeletonCard>
        <SkeletonCard>
          <Skeleton className="h-3 w-24 mb-4" />
          <Skeleton className="h-10 w-full" />
        </SkeletonCard>
      </div>
    </SkeletonPage>
  );
}
