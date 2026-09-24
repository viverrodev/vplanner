import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1720px]">
      <div className="flex items-start justify-between gap-6 mb-7 flex-wrap">
        <div>
          <Skeleton className="h-10 w-80 max-w-[70vw] mb-3" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-12 w-40 rounded-xl" />
      </div>
      <div className="flex gap-1.5 mb-7 flex-wrap">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-16 rounded-full" />
        ))}
      </div>
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line/10 bg-surface overflow-hidden">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="p-4 space-y-2">
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
