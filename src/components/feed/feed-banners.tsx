import Link from "next/link";

import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";

/**
 * Полоса баннеров над лентой.
 *
 * Раньше на этом месте стояла одна строка подписи, и она занимала столько
 * же места, сколько баннеры у конкурентов, но рассказывала о площадке
 * меньше всего. Полоса пустого места читалась как недоделанная вёрстка.
 *
 * Баннеры здесь не рекламные. Каждый утверждает то, что верно на самом
 * деле, и ведёт туда, где это можно сделать: послушать, посмотреть
 * скидки, загрузить свой бит. Выдуманные распродажи и «срок limited» были
 * бы ровно тем обещанием, которое площадка не может выполнить.
 *
 * Ряд статичный, без карусели. Три плитки видны сразу — значит, человек
 * не ждёт, пока прокрутится баннер, и не кликает по стрелке, чтобы узнать,
 * что за этим слайдом.
 */

type Banner = {
  /** Ключи словаря: компонент серверный, перевод берёт через getT. */
  kicker: "banner.listenKicker" | "banner.licensesKicker" | "banner.sellKicker";
  title: "banner.listenTitle" | "banner.licensesTitle" | "banner.sellTitle";
  note: "banner.listenNote" | "banner.licensesNote" | "banner.sellNote";
  href: string;
  motif: "wave" | "layers" | "upload";
};

const BANNERS: Banner[] = [
  {
    kicker: "banner.listenKicker",
    title: "banner.listenTitle",
    note: "banner.listenNote",
    href: "/#feed",
    motif: "wave",
  },
  {
    kicker: "banner.licensesKicker",
    title: "banner.licensesTitle",
    note: "banner.licensesNote",
    href: "/?scope=discounted#feed",
    motif: "layers",
  },
  {
    kicker: "banner.sellKicker",
    title: "banner.sellTitle",
    note: "banner.sellNote",
    href: "/cabinet/upload",
    motif: "upload",
  },
];

/*
 * Компонент серверный: клиентский useI18n здесь нельзя, и его импорт
 * ронял всю главную страницу в «ошибку загрузки» вместо одного блока.
 * Перевод берётся на сервере — как это делает SectionHead.
 */
export async function FeedBanners() {
  const t = await getT();

  return (
    <Container>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BANNERS.map((banner) => (
          <li key={banner.href}>
            <Link
              href={banner.href}
              className="group relative flex h-full flex-col justify-between overflow-hidden rounded-panel border border-line bg-ink-2 p-6 transition-colors hover:border-line-2 focusable lg:p-7"
            >
              {/*
                Мотив рисуется под текстом, а не над ним: панель остаётся
                местом для букв, а графика просто даёт поверхности фактуру.
                Без неё плитка читается как пустая плашка.
              */}
              <Motif kind={banner.motif} />

              <span className="label relative text-mute">{t(banner.kicker)}</span>

              <span className="relative mt-3 block font-display text-xl uppercase leading-tight tracking-tight text-paper lg:text-[26px]">
                {t(banner.title)}
              </span>

              <span className="relative mt-3 block text-sm leading-relaxed text-mute">{t(banner.note)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

/**
 * Фактура плитки.
 *
 * Три разных рисунка, а не один на все: одинаковая графика на трёх
 * соседних плитках превращает полосу в одну длинную картинку, и тогда
 * непонятно, где кончается одна мысль и начинается другая.
 */
function Motif({ kind }: { kind: Banner["motif"] }) {
  const common = "pointer-events-none absolute -right-6 -top-8 h-40 w-40 opacity-[0.16] transition-transform duration-500 group-hover:scale-105";

  if (kind === "wave") {
    return (
      <svg viewBox="0 0 120 120" className={common} aria-hidden>
        {[16, 34, 22, 48, 30, 62, 26, 52, 34, 44, 24, 38, 18].map((height, index) => (
          <rect
            key={index}
            x={6 + index * 9}
            y={60 - height / 2}
            width="4"
            height={height}
            rx="2"
            fill="currentColor"
            opacity={0.45 + (index % 3) * 0.2}
            className="text-accent"
          />
        ))}
      </svg>
    );
  }

  if (kind === "layers") {
    return (
      <svg viewBox="0 0 120 120" className={common} aria-hidden>
        <rect x="14" y="16" width="74" height="74" rx="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" />
        <rect x="30" y="32" width="74" height="74" rx="8" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.65" className="text-accent" />
        <rect x="46" y="48" width="60" height="58" rx="8" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.35" className="text-accent" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 120" className={common} aria-hidden>
      <path d="M60 84V30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-accent" />
      <path d="M40 48 60 28l20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-accent" />
      <path d="M22 92h76" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-accent" />
      <path d="M34 106h52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.4" className="text-accent" />
    </svg>
  );
}
