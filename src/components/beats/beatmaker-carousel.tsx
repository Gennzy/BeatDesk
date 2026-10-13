"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import { useMediaQuery } from "@/hooks/use-media-query";
import { pluralRu } from "@/lib/plural";

/**
 * Конвейер продавцов.
 *
 * Лента круглых аватаров, которая ползёт вбок; тот, кто в центре, крупнее
 * всех и раскрывается в квадрат с именем и числами. Остальные уходят в
 * стороны и мельчают.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ МАСШТАБ ОТ РАССТОЯНИЯ, А НЕ НАСТОЯЩИЙ 3D
 *
 * Круги в прототипе не повёрнуты: они просто разного размера, и глубина
 * читается по уменьшению. Настоящий translateZ дал бы то же самое ценой
 * композитинга каждого кадра на лишнем слое. Здесь достаточно transform с
 * масштабом: выглядит так же, а пересчитывается на четыре умножения.
 *
 * ---------------------------------------------------------------------------
 * ПРО ОДИН ПРОДАВЦА
 *
 * На площадке может быть один продавец, и тогда «лента» — это одна
 * плитка по центру. Это правда, а не поломка: пустые места по бокам от
 * одного круга читались бы как «здесь должны быть ещё, но не загрузились».
 * Позиция стартует так, чтобы при одном продавце он стоял в центре, и
 * лента не прокручивается вхолостую.
 * ---------------------------------------------------------------------------
 */

type Maker = {
  username: string;
  avatarUrl: string | null;
  beatsOnSale: number;
  plays: number;
  followerCount: number;
};

/** Расстояние между соседями на экране, в долях ширины плитки. */
const STEP = 0.34;

/** Скорость: плиток в секунду. */
const SPEED = 0.22;

export function BeatmakerCarousel({ makers }: { makers: Maker[] }) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);

  // Позиция с дробной частью: между целыми она и создаёт движение.
  const [position, setPosition] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const count = makers.length;

  /**
   * Двигаем позицию сами, а не полагаемся на CSS-анимацию.
   *
   * По CSS нельзя остановить ленту в нужном месте и нельзя знать, какой
   * плитке сейчас принадлежит центр: браузер считает это внутри себя. Чтобы
   * раскрывать центральную плитку и останавливать её на наведении, позицией
   * приходится владеть нам.
   */
  const step = useCallback(
    (delta: number) => {
      setPosition((value) => {
        if (count <= 1) return 0;
        // Зацикливаем, чтобы полоса не ползла в минус вечность.
        const next = value + delta;
        return ((next % count) + count) % count;
      });
    },
    [count],
  );

  useEffect(() => {
    // При одном продавце гонять пустую ленту незачем, а при включённом
    // «меньше движения» — тем более: человек просил её не видеть.
    if (paused || reduceMotion || count <= 1) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;

      // Ограничиваем шаг: после сворачивания вкладки дельта огромна, и без
      // ограничения лента перепрыгнула бы сразу через полкруга.
      setPosition((value) => ((value + Math.min(delta, 0.1) * SPEED) % count + count) % count);

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [paused, reduceMotion, count]);

  /**
   * Разметка плиток считается на каждое движение, а не на рендер слайдера:
   * элементы не меняются, меняются только их трансформации.
   */
  const items = useMemo(() => {
    if (count === 0) return [];

    // Ряд повторяется дважды, чтобы лента переходила через край бесшовно.
    return [...makers, ...makers].map((maker, index) => {
      const raw = index - position;
      // Приводим к диапазону [-count, count): ближайшее копие всегда впереди.
      const offset = ((raw % count) + count) % count;
      const signed = offset > count / 2 ? offset - count : offset;

      return { maker, offset: signed, key: `${maker.username}-${index}` };
    });
  }, [makers, position, count]);

  if (count === 0) return null;

  return (
    <section
      className="flex flex-col gap-8"
      aria-label={t("beatmakers.carouselLabel")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className={`relative w-full ${count > 1 ? "h-[340px] sm:h-[400px]" : "h-[300px]"}`}
        role="group"
        aria-roledescription="карусель"
      >
        {items.map(({ maker, offset, key }) => {
          const distance = Math.abs(offset);
          const centred = distance < 0.5;

          // Круг тем дальше от центра, чем мельче. Дальше VISIBLE не рисуем.
          const scale = Math.max(0, 1 - distance * 0.26);
          const opacity = Math.max(0, 1 - distance * 0.34);

          if (scale <= 0.02) return null;

          return (
            <Link
              key={key}
              href={`/beatmakers/${maker.username}`}
              tabIndex={centred ? 0 : -1}
              aria-hidden={centred ? undefined : true}
              className="group absolute top-1/2 left-1/2 block"
              style={{
                width: "260px",
                height: "260px",
                marginLeft: "-130px",
                marginTop: "-130px",
                transform: `translate3d(${offset * STEP * 100}%, 0, 0) scale(${scale})`,
                opacity,
                transition: "opacity var(--duration-base) var(--ease-out)",
                zIndex: 10 - Math.round(distance * 10),
                pointerEvents: distance > 1.5 ? "none" : undefined,
              }}
            >
              <div
                className={
                  centred
                    ? "size-full overflow-hidden rounded-2xl border border-line bg-ink-3"
                    : "size-full overflow-hidden rounded-full border border-line bg-ink-3"
                }
                style={{ transition: "border-radius var(--duration-slow) var(--ease-out), transform var(--duration-slow) var(--ease-out)" }}
              >
                {maker.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={maker.avatarUrl}
                    alt={centred ? maker.username : ""}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="grid size-full place-items-center font-display text-4xl text-mute">
                    {maker.username.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {centred ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/95 to-transparent p-4 pt-14">
                  <p className="truncate text-sm font-semibold text-paper">{maker.username}</p>
                  <p className="mt-1 text-xs leading-snug text-mute">
                    {maker.beatsOnSale}{" "}
                    {pluralRu(maker.beatsOnSale, "бит", "бита", "битов")}
                    <br />
                    {maker.plays}{" "}
                    {pluralRu(maker.plays, "прослушивание", "прослушивания", "прослушиваний")}
                    <br />
                    {maker.followerCount}{" "}
                    {pluralRu(maker.followerCount, "подписчик", "подписчика", "подписчиков")}
                  </p>
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>

      {/*
        Управление показываем только когда есть что листать. При одном
        продавце стрелки водили бы по пустоте.
      */}
      {count > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            className="chip chip-hover"
            aria-label={t("beatmakers.prev")}
          >
            ←
          </button>
          <span className="h-px w-24 bg-line" aria-hidden />
          <button
            type="button"
            onClick={() => step(1)}
            className="chip chip-hover"
            aria-label={t("beatmakers.next")}
          >
            →
          </button>
        </div>
      ) : null}
    </section>
  );
}