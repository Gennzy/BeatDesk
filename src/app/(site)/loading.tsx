import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-8">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-2/3 max-w-xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex flex-col overflow-hidden rounded-lg border border-line bg-ink-2">
                <Skeleton className="aspect-square rounded-none" />
                <div className="flex flex-col gap-2.5 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-28 rounded-full" />
                  <Skeleton className="h-3 w-40 rounded-full" />
                  <div className="mt-2 flex items-center gap-2">
                    <Skeleton className="h-6 w-14 rounded-full" />
                    <Skeleton className="h-6 w-14 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
