import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-8">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-2/3 max-w-xl" />
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col overflow-hidden rounded-md border border-line bg-ink-2">
                <Skeleton className="aspect-square rounded-none" />
                <div className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
