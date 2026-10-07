"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import { MUSICAL_KEYS } from "@/lib/keys";

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

function FiltersBar({ search, resultCount }: { search: string; resultCount: number }) {
  const { t } = useI18n();
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

  return (
    <div className="flex flex-col gap-4 border border-line bg-ink-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex">
          {(["new", "popular"] as const).map((sort) => (
            <button
              key={sort}
              type="button"
              onClick={() => apply({ ...filters, sort })}
              aria-pressed={filters.sort === sort}
              className={
                filters.sort === sort
                  ? "label h-8 px-3 bg-signal text-ink"
                  : "label h-8 px-3 text-mute transition-colors hover:text-paper"
              }
            >
              {sort === "new" ? t("feed.new") : t("feed.popular")}
            </button>
          ))}
        </div>

        <input
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") apply(filters);
          }}
          placeholder={t("feed.search")}
          className="h-8 min-w-40 flex-1 rounded-xs border border-line bg-ink px-3 text-base font-mono text-paper placeholder:text-mute/60 sm:max-w-xs sm:text-sm"
        />

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="label h-8 border border-line px-3 text-mute transition-colors hover:border-line-2 hover:text-paper"
        >
          {t("feed.filters")}
          {active ? " ·" : ""}
        </button>

        {active ? (
          <button
            type="button"
            onClick={() => apply(EMPTY_FILTERS)}
            className="label h-8 px-2 text-mute underline-offset-4 hover:text-paper hover:underline"
          >
            {t("feed.reset")}
          </button>
        ) : null}

        <span className="label ml-auto text-mute">{resultCount}</span>
      </div>

      {open ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <label className="flex flex-col gap-1.5">
            <span className="label text-paper">{t("feed.key")}</span>
            <select
              value={filters.key}
              onChange={(event) => apply({ ...filters, key: event.target.value })}
              className="h-9 cursor-pointer rounded-xs border border-line bg-ink px-3 text-sm text-paper"
            >
              <option value="">{t("feed.anyKey")}</option>
              {MUSICAL_KEYS.map((musicalKey) => (
                <option key={musicalKey} value={musicalKey}>
                  {musicalKey}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="label text-paper">{t("feed.bpmMin")}</span>
            <input
              type="number"
              inputMode="numeric"
              value={filters.bpmMin}
              onChange={(event) => setFilters({ ...filters, bpmMin: event.target.value })}
              onBlur={() => apply(filters)}
              placeholder="40"
              className="h-9 w-24 rounded-xs border border-line bg-ink px-3 font-mono text-sm text-paper"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="label text-paper">{t("feed.bpmMax")}</span>
            <input
              type="number"
              inputMode="numeric"
              value={filters.bpmMax}
              onChange={(event) => setFilters({ ...filters, bpmMax: event.target.value })}
              onBlur={() => apply(filters)}
              placeholder="300"
              className="h-9 w-24 rounded-xs border border-line bg-ink px-3 font-mono text-sm text-paper"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}