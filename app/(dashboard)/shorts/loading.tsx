import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1500px]">
      <div className="flex items-start justify-between gap-6 mb-7 flex-wrap">
        <div>
          <Skeleton className="h-10 w-72 mb-3" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-lg" />
        ))}
      </div>
      <div className="rounded-xl border border-line/10 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-line/10 first:border-t-0">
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-4 flex-1 max-w-md" />
            <Skeleton className="h-4 w-24 hidden md:block" />
            <Skeleton className="h-6 w-28 hidden md:block rounded-full" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
