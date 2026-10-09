"use client";

import { GENRE_SLUGS, type GenreSlug } from "@/lib/beat-validation";
import { useI18n } from "@/lib/i18n/provider";
import { Field, Select } from "@/components/ui/input";

/**
 * Выбор жанра.
 *
 * Список закрытый, а не свободный ввод: по жанру фильтруют, и свободная
 * строка размножает «Трэп», «TRAP» и «трап» тремя разными значениями,
 * после чего фильтр молча делится на пустые вкладки. Новая категория
 * добавляется миграцией — тогда её видно и здесь.
 *
 * Пустое значение означает «без жанра», а не «первый в списке»: бит может
 * оказаться вне жанров, и притворяться, что он трейповый, хуже, чем
 * оставить его непричисленным.
 */
export function GenreSelect({ name, value }: { name: string; value: GenreSlug | null }) {
  const { t, locale } = useI18n();

  return (
    <Field label={t("genre.label")} hint={t("genre.hint")} optional={t("discount.optional")}>
      <Select name={name} defaultValue={value ?? ""}>
        <option value="">{t("genre.any")}</option>
        {GENRE_SLUGS.map((slug) => (
          <option key={slug} value={slug}>
            {t(`genre.${slug}` as "genre.trap")}
          </option>
        ))}
      </Select>
    </Field>
  );
}