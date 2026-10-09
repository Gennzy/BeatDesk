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
 * Жанр обязателен, поэтому пустого варианта в списке нет: предложить
 * «без жанра» и тут же запретить его — значит заставить человека выбрать
 * и снять выбор, чтобы получить отказ. Список без «Другого» тут не
 * годится — это честная категория для бита, который ни в один жанр не
 * ложится, и она остаётся.
 */
export function GenreSelect({ name, value }: { name: string; value: GenreSlug | null }) {
  const { t } = useI18n();

  return (
    <Field label={t("genre.label")} hint={t("genre.hint")} required>
      <Select name={name} defaultValue={value ?? ""} required>
        {/*
          Пустая первая строка — не «жанр не выбран», а напоминание
          выбрать. Она не имеет значения и не выбирается: без неё список
          начинался бы с Трейпа, и человек отправлял бы бит трейповым,
          даже не думая об этом.
        */}
        <option value="" disabled>
          {t("genre.pick")}
        </option>
        {GENRE_SLUGS.map((slug) => (
          <option key={slug} value={slug}>
            {t(`genre.${slug}` as "genre.trap")}
          </option>
        ))}
      </Select>
    </Field>
  );
}