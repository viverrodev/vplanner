import { Skeleton, SkeletonCard, SkeletonCircle, SkeletonPage } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage width="max-w-2xl">
      <div className="space-y-6">
        <SkeletonCard className="sm:p-8">
          <div className="flex items-center gap-5">
            <SkeletonCircle className="w-20 h-20" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-full mt-6 mb-2" />
          <Skeleton className="h-3.5 w-2/3" />
        </SkeletonCard>
        <SkeletonCard>
          <Skeleton className="h-3 w-20 mb-4" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </SkeletonCard>
      </div>
    </SkeletonPage>
  );
}
