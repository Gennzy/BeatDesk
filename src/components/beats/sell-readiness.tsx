"use client";

import { TIERS, type TierId } from "@/lib/audio/delivery-rules";
import { checkPackage } from "@/lib/audio/hygiene";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Готовность к продаже, прямо в форме.
 *
 * Показывается рядом с полями цен, а не после сохранения: человек ставит
 * цену на Track Out, и в ту же секунду видит, что дорожек в бите нет.
 * Проверка после сохранения бесполезна — цена уже на витрине.
 *
 * Здесь только состав бита: какие файлы в нём лежат и что за это обещают.
 * Формат файлов и сверка ключа с темпом живут в выходном контроле целиком
 * и требуют разбора аудио, поэтому их здесь нет.
 */

type Props = {
  /** Цены, как их видит формала прямо сейчас. */
  prices: Record<TierId, number | null>;
  title: string;
  tags: string[];
  /** Какие файлы в бите: роли, а не имена. */
  roles: string[];
};

/** Цена считается выставленной, если она больше нуля. */
const sold = (value: number | null | undefined): boolean => typeof value === "number" && value > 0;

/** Чего не хватает уровню, словами для человека. */
const MISSING: Record<string, string> = {
  mp3: "превью в MP3",
  wav: "мастер в WAV",
  stems: "архив со стемами",
};

export function SellReadiness({ prices, title, tags, roles }: Props) {
  const { t } = useI18n();

  const tiers = TIERS.filter((tier) => sold(prices[tier.id])).map((tier) => tier.id);
  const present = new Set(roles);

  const findings = checkPackage(tiers, {
    title,
    tags,
    files: roles.map((role) => ({ name: role, role: role as "wav" | "mp3" | "stems" | "artwork" | "other" })),
  });

  const blockers = findings.filter((item) => item.severity === "block");
  const warnings = findings.filter((item) => item.severity === "warn" && !item.id.startsWith("tier."));
  const artwork = roles.includes("artwork");

  return (
    <section className="flex flex-col gap-4">
      {/* Заголовок тем же стилем, что и остальные разделы формы: блок был
          единственным, кто остался на старой мелкой подписи. */}
      <div className="flex items-center gap-3">
        <span aria-hidden className="size-1.5 shrink-0 bg-signal" />
        <span className="text-sm font-semibold uppercase tracking-wider text-paper">
          {t("readiness.title")}
        </span>
      </div>

      {tiers.length === 0 ? (
        <p className="max-w-[62ch] rounded-panel border border-line bg-ink-3 px-4 py-3 text-sm leading-relaxed text-mute">
          {t("readiness.noTiers")}
        </p>
      ) : (
        /* Строки уровней лежат на ink-3 — как поля ввода. Раньше они были
           ink-2, то есть темнее формы вокруг, и проверка читалась отдельным
           вложенным абзацем, а не частью той же работы. */
        <ul className="flex flex-col gap-2">
          {TIERS.filter((tier) => sold(prices[tier.id])).map((tier) => {
            // Недостающие файлы считаем сами: правило уровня и состав бита —
            // единственные два источника, и спорить им не о чем.
            const lacking = (Object.keys(tier.requires) as string[]).filter(
              (role) => tier.requires[role as keyof typeof tier.requires] && !present.has(role),
            );

            return (
              <li
                key={tier.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md bg-ink-3 px-4 py-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-paper">{tier.label}</span>
                  <span className="text-sm text-mute">{tier.delivers}</span>
                </span>
                <span
                  className={
                    lacking.length === 0
                      ? "flex items-center gap-2 text-sm font-semibold text-signal"
                      : "flex items-center gap-2 text-sm font-semibold text-amber"
                  }
                >
                  {lacking.length === 0 ? <Tick /> : <Cross />}
                  {lacking.length === 0
                    ? t("readiness.ready")
                    : `${t("readiness.missing")} ${lacking.map((role) => MISSING[role]).join(", ")}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Дальше то, что в уровень не помещается: обложка и замечания
          выходного контроля. Каждому пункту маркер — иначе три строки
          подряд читались как один абзац. */}
      {(!artwork && tiers.length > 0) || warnings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {!artwork && tiers.length > 0 ? (
            <li className="flex items-start gap-2 text-sm leading-relaxed text-amber">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber" />
              {t("readiness.noCover")}
            </li>
          ) : null}
          {warnings.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm leading-relaxed text-mute">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-mute/60" />
              {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      {blockers.length > 0 ? (
        <p className="max-w-[70ch] rounded-md bg-amber/10 px-4 py-3 text-sm leading-relaxed text-amber">
          {t("readiness.blockedHint")}
        </p>
      ) : null}
    </section>
  );
}

/** Галочка: уровень продаётся, все файлы на месте. */
function Tick() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden>
      <path
        d="M1.5 6.5 4.5 9.5 10.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Крест: цена выставлена, а файлов для этого уровня нет. */
function Cross() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden>
      <path
        d="M2 2l8 8M10 2l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
