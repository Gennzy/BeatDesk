/**
 * Разбор и сборка параметров ленты.
 *
 * Отдельный модуль без "use client", потому что разбор нужен и клиенту
 * (панель фильтров), и серверу (страница рисует первую страницу ленты).
 * В компоненте с директивой сервер вызвать такую функцию не может.
 */

/**
 * Область ленты.
 *
 * "all" — витрина площадки. "following" — биты тех, на кого подписан
 * человек. "liked" — те, что понравились.
 *
 * Личные вкладки и есть тот цикл, из-за которого возвращаются: подписался,
 * увидел новое, отреагировал, получил уведомление. Без них площадка остаётся
 * витриной, за которой не следишь.
 */
export type FeedScope = "all" | "following" | "liked";

export type FeedFilterState = {
  scope: FeedScope;
  sort: "top" | "new" | "popular";
  query: string;
  key: string;
  bpmMin: string;
  bpmMax: string;
};

export const EMPTY_FILTERS: FeedFilterState = {
  scope: "all",
  sort: "top",
  query: "",
  key: "",
  bpmMin: "",
  bpmMax: "",
};

/**
 * Сортировка из адреса. Значение приходит от клиента, поэтому берём только
 * известные: иначе в запрос уйдёт строка, на которую нет сортировки, и
 * человек получит ленту без объяснения, почему она вдруг другая.
 */
function parseSort(raw: string | null): FeedFilterState["sort"] {
  return raw === "new" || raw === "popular" ? raw : "top";
}

function parseScope(raw: string | null): FeedScope {
  return raw === "following" || raw === "liked" ? raw : "all";
}

/** Число из адреса: пустое или мусорное значение отбрасывается. */
function parseNumber(raw: string | null): string {
  if (!raw) return "";
  const value = Number(raw);
  return Number.isFinite(value) ? raw : "";
}

export function readFilters(params: URLSearchParams): FeedFilterState {
  return {
    scope: parseScope(params.get("view")),
    sort: parseSort(params.get("sort")),
    query: params.get("q") ?? "",
    key: params.get("key") ?? "",
    bpmMin: parseNumber(params.get("bpmMin")),
    bpmMax: parseNumber(params.get("bpmMax")),
  };
}

/** Параметры в адрес. Сортировка по умолчанию в ссылку не попадает. */
export function filtersToParams(filters: FeedFilterState): string {
  const params = new URLSearchParams();
  if (filters.scope !== "all") params.set("view", filters.scope);
  if (filters.sort !== "top") params.set("sort", filters.sort);
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.key) params.set("key", filters.key);
  if (filters.bpmMin) params.set("bpmMin", filters.bpmMin);
  if (filters.bpmMax) params.set("bpmMax", filters.bpmMax);
  return params.toString();
}

/** Фильтры страницы → параметры запроса к базе. */
export function toFeedFilters(filters: FeedFilterState) {
  const bpm = (value: string) => {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    scope: filters.scope,
    sort: filters.sort,
    query: filters.query.trim() || undefined,
    key: filters.key || undefined,
    bpmMin: bpm(filters.bpmMin),
    bpmMax: bpm(filters.bpmMax),
  };
}