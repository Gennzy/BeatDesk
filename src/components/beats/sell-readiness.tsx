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
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex items-center gap-3">
        <span aria-hidden className="size-1.5 bg-signal" />
        <span className="label text-mute">{t("readiness.title")}</span>
      </div>

      {tiers.length === 0 ? (
        <p className="max-w-[62ch] text-sub text-mute">{t("readiness.noTiers")}</p>
      ) : (
        <ul className="flex flex-col gap-px">
          {TIERS.filter((tier) => sold(prices[tier.id])).map((tier) => {
            // Недостающие файлы считаем сами: правило уровня и состав бита —
            // единственные два источника, и спорить им не о чем.
            const lacking = (Object.keys(tier.requires) as string[]).filter(
              (role) => tier.requires[role as keyof typeof tier.requires] && !present.has(role),
            );

            return (
              <li
                key={tier.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink-2 px-4 py-3"
              >
                <span className="flex flex-col gap-1">
                  <span className="label text-paper">{tier.label}</span>
                  <span className="text-xs text-mute">{tier.delivers}</span>
                </span>
                {lacking.length === 0 ? (
                  <span className="label text-signal">{t("readiness.ready")}</span>
                ) : (
                  <span className="label text-amber">
                    {t("readiness.missing")} {lacking.map((role) => MISSING[role]).join(", ")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!artwork && tiers.length > 0 ? (
        <p className="max-w-[62ch] text-xs text-amber">
          {t("readiness.noCover")}
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {warnings.map((item) => (
            <li key={item.id} className="max-w-[70ch] text-xs text-mute">
              {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      {blockers.length > 0 ? (
        <p className="max-w-[70ch] text-xs text-amber">{t("readiness.blockedHint")}</p>
      ) : null}
    </section>
  );
}
