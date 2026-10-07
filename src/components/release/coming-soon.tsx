import { SiteFooter } from "@/components/layout/site-footer";
import type { SessionUser } from "@/lib/supabase/user";

/**
 * Заглушка на время разработки.
 *
 * Показывает, что сервис скоро открывается, и ничего лишнего: ссылок на
 * разделы нет, чтобы человек не попал в недостроенный интерфейс.
 */
export function ComingSoon({ user }: { user: SessionUser | null }) {
  return (
    <div className="flex min-h-svh flex-col">
      {/*
       * Отступ снизу раньше стоял pb-24, и на телефоне он отодвигал текст от
       * верха, оставляя под ним пустоту в пол-экрана: футер уезжал за первый
       * экран, а заголовок стоял у шапки.
       */}
      <main className="flex flex-1 items-center justify-center px-6 py-16 sm:py-20">
        <div className="flex max-w-[54ch] flex-col items-center gap-5 text-center sm:gap-6">
          <span className="label text-mute">скоро</span>

          {/*
           * Нижняя граница 1.6rem, а не 2rem: на экране 375px «BeatDesk» в
           * жирном дисплейном начертании не влезал в ширину и обрезался по
           * краям. Длинные слова переносим, а не обрезаем.
           */}
          <h1 className="font-display text-[clamp(1.6rem,7.5vw,3.5rem)] leading-[1.05] font-black tracking-tight break-words text-paper uppercase">
            BeatDesk <span className="text-signal">в разработке</span>
          </h1>

          <p className="text-sm leading-relaxed text-mute">
            Сервис почти готов. Пока мы его доводим, площадки для битов закрыты — заходите позже, мы напишем.
          </p>
        </div>
      </main>

      <SiteFooter user={user} />
    </div>
  );
}
