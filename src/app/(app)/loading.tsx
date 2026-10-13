import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-5 w-80" />
      <Skeleton className="mt-8 h-64 w-full rounded-xl" />
    </div>
  );
}
