"use client";

import { useI18n } from "@/lib/i18n/provider";

/**
 * Почему покупка безопасна.
 *
 * Главный страх покупателя бита — отдать деньги и не получить файлы. Ответ на
 * него должен стоять на карточке, а не в справке: три обещания и под каждым
 * причина, почему оно выполняется.
 */
export function TrustBlock() {
  const { t } = useI18n();

  const items = [
    { title: t("trust.filesTitle"), note: t("trust.filesNote") },
    { title: t("trust.licenseTitle"), note: t("trust.licenseNote") },
    { title: t("trust.exclusiveTitle"), note: t("trust.exclusiveNote") },
  ];

  return (
    <section className="flex flex-col gap-3">
      <span className="label text-mute">{t("trust.title")}</span>
      <ul className="rows">
        {items.map((item) => (
          <li key={item.title} className="row flex flex-col gap-1">
            <span className="label text-paper">{item.title}</span>
            <span className="text-xs leading-snug text-mute">{item.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
