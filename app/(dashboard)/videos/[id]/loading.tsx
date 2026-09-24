import { Skeleton, SkeletonCircle, SkeletonPage } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1400px]">
      <Skeleton className="h-4 w-24 mb-6" />
      <Skeleton className="h-10 w-[640px] max-w-full mb-3" />
      <Skeleton className="h-4 w-48 mb-5" />
      <div className="flex gap-2 mb-8">
        <Skeleton className="h-10 w-44 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      <div className="flex items-center gap-3 mb-10 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-2">
              <SkeletonCircle className="w-9 h-9" />
              <Skeleton className="h-2.5 w-12" />
            </div>
            {i < 6 && <Skeleton className="h-0.5 w-10 hidden sm:block" />}
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </SkeletonPage>
  );
}
