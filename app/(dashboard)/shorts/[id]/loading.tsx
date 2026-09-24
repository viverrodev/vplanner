import { Skeleton, SkeletonCircle, SkeletonPage } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1200px]">
      <Skeleton className="h-4 w-24 mb-6" />
      <Skeleton className="h-9 w-[520px] max-w-full mb-3" />
      <Skeleton className="h-5 w-64 mb-6" />
      <div className="flex items-center gap-4 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <SkeletonCircle className="w-8 h-8" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-96 w-full rounded-2xl" />
        <div className="space-y-6">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    </SkeletonPage>
  );
}
