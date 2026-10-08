"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { MUSICAL_KEYS } from "@/lib/keys";
import { pluralEn, pluralRu } from "@/lib/plural";
import { EMPTY_FILTERS, filtersToParams, readFilters, type FeedFilterState } from "@/lib/feed-filters";

export type { FeedFilterState };
export { filtersToParams, readFilters };

/** Ключ по URL: смена фильтров пересоздаёт панель, поэтому состояние не рассинхронизируется. */
export function FeedFiltersBar({ resultCount, loggedIn }: { resultCount: number; loggedIn: boolean }) {
  const searchParams = useSearchParams();
  return (
    <FiltersBar
      key={searchParams.toString()}
      search={searchParams.toString()}
      resultCount={resultCount}
      loggedIn={loggedIn}
    />
  );
}

/**
 * Панель каталога.
 *
 * Раньше она стояла рамкой на весь блок и на телефоне разваливалась на три
 * строки, отодвигая первый бит за экран. Теперь это липкая полоса без рамки:
 * сортировка и поиск всегда под рукой при прокрутке, а тонкие фильтры
 * раскрываются вниз и не занимают место, пока ими не пользуются.
 */
function FiltersBar({ search, resultCount, loggedIn }: { search: string; resultCount: number; loggedIn: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [filters, setFilters] = useState<FeedFilterState>(() => readFilters(new URLSearchParams(search)));
  const [open, setOpen] = useState(false);

  function apply(next: FeedFilterState) {
    setFilters(next);
    const query = filtersToParams(next);
    router.push(query ? `/?${query}#feed` : "/#feed");
    router.refresh();
  }

  const active =
    filters.sort !== "top" ||
    Boolean(filters.query.trim() || filters.key || filters.bpmMin || filters.bpmMax);

  const count =
    locale === "ru"
      ? `${resultCount} ${pluralRu(resultCount, "бит", "бита", "битов")}`
      : `${resultCount} ${pluralEn(resultCount, "beat", "beats")}`;

  return (
    <div className="sticky top-[4.5rem] z-20 -mx-4 border-b border-line bg-ink/90 px-4 backdrop-blur-md sm:mx-0 sm:px-0">
      <div className="flex flex-wrap items-center gap-2 py-3">
        {/*
          Сортировка двумя способами: на широком экране сегменты читаются
          взглядом, на телефоне они отбирали у поиска половину строки и
          оставляли поле шириной с три буквы. Там отдаём приоритет поиску.
        */}
        <div className="hidden shrink-0 items-center sm:flex">
          {(["top", "new", "popular"] as const).map((sort) => (
            <button
              key={sort}
              type="button"
              onClick={() => apply({ ...filters, sort })}
              aria-pressed={filters.sort === sort}
              className="tab"
            >
              {t(`feed.sort${sort[0].toUpperCase()}${sort.slice(1)}` as "feed.sortTop")}
            </button>
          ))}
        </div>

        {/*
          Область ленты живёт слева от сортировки, а не в выпадающем списке:
          переключение между «всё» и «подписки» — это главное действие на
          панели, и прятать его в селект значит сделать его второстепенным.
        */}
        {loggedIn ? (
          <div className="flex items-center gap-1 border-l border-line pl-3">
            {(["all", "following", "liked"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => apply({ ...filters, scope })}
                aria-pressed={filters.scope === scope}
                className="tab"
              >
                {t(`feed.scope${scope[0].toUpperCase()}${scope.slice(1)}` as "feed.scopeAll")}
              </button>
            ))}
          </div>
        ) : null}

        <div className="sm:hidden">
          <Select
            value={filters.sort}
            onChange={(event) => apply({ ...filters, sort: event.target.value as FeedFilterState["sort"] })}
            aria-label={t("feed.sort")}
            className="control-sm label w-auto shrink-0 text-mute"
          >
            <option value="new">{t("feed.new")}</option>
            <option value="popular">{t("feed.popular")}</option>
          </Select>
        </div>

        {/*
          Поиска здесь нет: он стоит в шапке по центру. Два одинаковых поля на
          одном экране читались как ошибка, а не как удобство.
        */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={t("feed.filters")}
            className={cn(
              "label h-9 shrink-0 rounded-pill border px-3.5 transition-colors",
              open ? "border-line-2 bg-ink-3 text-paper" : "border-line text-mute hover:border-line-2 hover:text-paper",
            )}
          >
            {t("feed.filters")}
            {active ? <span className="text-signal"> ·</span> : null}
          </button>
        </div>

        {active ? (
          <button
            type="button"
            onClick={() => apply(EMPTY_FILTERS)}
            className="label h-9 shrink-0 px-2 text-mute underline-offset-4 hover:text-paper hover:underline"
          >
            {t("feed.reset")}
          </button>
        ) : null}

        <span className="label ml-auto hidden shrink-0 text-mute sm:inline">{count}</span>
      </div>

      {open ? (
        <div className="flex flex-wrap items-end gap-3 pb-4">
          <label className="flex flex-col gap-1.5">
            <span className="label text-paper">{t("feed.key")}</span>
            <Select
              value={filters.key}
              onChange={(event) => apply({ ...filters, key: event.target.value })}
              className="control-sm"
            >
              <option value="">{t("feed.anyKey")}</option>
              {MUSICAL_KEYS.map((musicalKey) => (
                <option key={musicalKey} value={musicalKey}>
                  {musicalKey}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="label text-paper">{t("feed.bpmMin")}</span>
            <Input
              type="number"
              inputMode="numeric"
              scale="sm"
              value={filters.bpmMin}
              onChange={(event) => setFilters({ ...filters, bpmMin: event.target.value })}
              onBlur={() => apply(filters)}
              placeholder="40"
              aria-label={t("feed.bpmMin")}
              className="w-24 font-mono"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="label text-paper">{t("feed.bpmMax")}</span>
            <Input
              type="number"
              inputMode="numeric"
              scale="sm"
              value={filters.bpmMax}
              onChange={(event) => setFilters({ ...filters, bpmMax: event.target.value })}
              onBlur={() => apply(filters)}
              placeholder="300"
              aria-label={t("feed.bpmMax")}
              className="w-24 font-mono"
            />
          </label>

          <span className="label ml-auto text-mute sm:hidden">{count}</span>
        </div>
      ) : null}
    </div>
  );
}