import { Icon, type IconName } from "@/components/ui/icon";
import { pluralRu } from "@/lib/plural";

/**
 * Три счётчика бита: показы, просмотры и прослушивания.
 *
 * Разделение важно: много показов и мало прослушиваний означает, что обложку
 * видят и не открывают, и это видно сразу. По одному числу прослушиваний
 * понять, работает ли бит, нельзя — нулевое бывает и у хорошего.
 */
export async function BeatStats({ plays, views, impressions }: { plays: number; views: number; impressions: number }) {
  const items: { icon: IconName; value: number; label: (n: number) => string }[] = [
    { icon: "waveform", value: plays, label: (n) => pluralRu(n, "прослушивание", "прослушивания", "прослушиваний") },
    { icon: "eye", value: views, label: (n) => pluralRu(n, "просмотр", "просмотра", "просмотров") },
    { icon: "trend", value: impressions, label: (n) => pluralRu(n, "показ", "показа", "показов") },
  ];

  return (
    <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map((item) => (
        <div key={item.icon} className="flex items-center gap-1.5">
          <dt>
            <Icon name={item.icon} className="size-3.5 text-mute" />
            <span className="sr-only">{item.label(item.value)}</span>
          </dt>
          <dd className="font-mono text-xs text-mute tabular-nums">
            {item.value} {item.label(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}