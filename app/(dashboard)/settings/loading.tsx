import { Skeleton, SkeletonCard, SkeletonCircle, SkeletonPage } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage width="max-w-2xl">
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <SkeletonCard>
          <div className="flex items-center gap-4 mb-6">
            <SkeletonCircle className="w-16 h-16" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </SkeletonCard>
        <SkeletonCard>
          <Skeleton className="h-3 w-24 mb-4" />
          <Skeleton className="h-12 w-full mb-2" />
          <Skeleton className="h-12 w-full" />
        </SkeletonCard>
      </div>
    </SkeletonPage>
  );
}
