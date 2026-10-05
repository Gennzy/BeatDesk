import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Заглушка на время разработки.
 *
 * Показывает, что сервис скоро открывается, и ничего лишнего: ссылок на
 * разделы нет, чтобы человек не попал в недостроенный интерфейс.
 */
export function ComingSoon() {
  return (
    <div className="flex min-h-svh flex-col">
      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="flex max-w-[54ch] flex-col items-center gap-6 text-center">
          <span className="label text-mute">скоро</span>

          <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-[1.05] font-black tracking-tight text-paper uppercase">
            BeatDesk <span className="text-signal">в разработке</span>
          </h1>

          <p className="text-sm leading-relaxed text-mute">
            Сервис почти готов. Пока мы его доводим, площадки для битов закрыты — заходите позже, мы напишем.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
