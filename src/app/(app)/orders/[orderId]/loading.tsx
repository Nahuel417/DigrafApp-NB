import { Skeleton } from "@/components/ui/skeleton";

export default function OrderDetailLoading() {
  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </header>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </main>
  );
}
