"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { MUSICAL_KEYS } from "@/lib/keys";
import { pluralEn, pluralRu } from "@/lib/plural";

export type FeedFilterState = {
  sort: "new" | "popular";
  query: string;
  key: string;
  bpmMin: string;
  bpmMax: string;
};

export const EMPTY_FILTERS: FeedFilterState = { sort: "new", query: "", key: "", bpmMin: "", bpmMax: "" };

function readFilters(params: URLSearchParams): FeedFilterState {
  return {
    sort: params.get("sort") === "popular" ? "popular" : "new",
    query: params.get("q") ?? "",
    key: params.get("key") ?? "",
    bpmMin: params.get("bpmMin") ?? "",
    bpmMax: params.get("bpmMax") ?? "",
  };
}

export function filtersToParams(filters: FeedFilterState): string {
  const params = new URLSearchParams();
  if (filters.sort !== "new") params.set("sort", filters.sort);
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.key) params.set("key", filters.key);
  if (filters.bpmMin) params.set("bpmMin", filters.bpmMin);
  if (filters.bpmMax) params.set("bpmMax", filters.bpmMax);
  return params.toString();
}

/** Ключ по URL: смена фильтров пересоздаёт панель, поэтому состояние не рассинхронизируется. */
export function FeedFiltersBar({ resultCount }: { resultCount: number }) {
  const searchParams = useSearchParams();
  return <FiltersBar key={searchParams.toString()} search={searchParams.toString()} resultCount={resultCount} />;
}

/**
 * Панель каталога.
 *
 * Раньше она стояла рамкой на весь блок и на телефоне разваливалась на три
 * строки, отодвигая первый бит за экран. Теперь это липкая полоса без рамки:
 * сортировка и поиск всегда под рукой при прокрутке, а тонкие фильтры
 * раскрываются вниз и не занимают место, пока ими не пользуются.
 */
function FiltersBar({ search, resultCount }: { search: string; resultCount: number }) {
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
    filters.sort !== "new" ||
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
          {(["new", "popular"] as const).map((sort) => (
            <button
              key={sort}
              type="button"
              onClick={() => apply({ ...filters, sort })}
              aria-pressed={filters.sort === sort}
              className={cn(
                "label h-9 px-3 transition-colors",
                filters.sort === sort ? "bg-signal text-ink" : "text-mute hover:text-paper",
              )}
            >
              {sort === "new" ? t("feed.new") : t("feed.popular")}
            </button>
          ))}
        </div>

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

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            id="feed-search"
            scale="sm"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply(filters);
            }}
            placeholder={t("feed.search")}
            aria-label={t("feed.search")}
            className="font-mono"
          />

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={t("feed.filters")}
            className="label h-9 shrink-0 border border-line px-3 text-mute transition-colors hover:border-line-2 hover:text-paper"
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