export type SiteId = "beatstars" | "beatchain";

export type SiteConfig = {
  id: SiteId;
  title: string;
  hosts: string[];
  /** Сколько символов влезет в название на площадке. */
  titleLimit: number;
  /** Валюта цен в форме площадки. */
  currency: "RUB" | "USD";
  /** Ставятся ли цены: валюта бита должна совпасть с валютой формы. */
  pricesFillable: boolean;
  /** Поле тональности — выпадающий список со сокращениями вроде «G#m». */
  keyAsShort: boolean;
  /** Теги в BeatStars — чипы, в BeatChain — обычная строка. */
  tagsAs: "chips" | "text";
};

/**
 * Что о площадке знать независимо от бита.
 *
 * `pricesFillable` здесь не задан: он зависит от валюты конкретного бита
 * и вычисляется в siteForBeat. Раньше он был зашит в конфиг площадки, и
 * бит в долларах на BeatChain молча остался бы без цены.
 */
const SITE_FACTS: Omit<SiteConfig, "pricesFillable">[] = [
  {
    id: "beatstars",
    title: "BeatStars Studio",
    hosts: ["studio.beatstars.com", "www.beatstars.com"],
    titleLimit: 60,
    currency: "USD",
    keyAsShort: true,
    tagsAs: "chips",
  },
  {
    id: "beatchain",
    title: "BeatChain",
    hosts: ["beatchain.io", "www.beatchain.io"],
    titleLimit: 30,
    currency: "RUB",
    keyAsShort: false,
    tagsAs: "text",
  },
];

export const SITES: SiteConfig[] = SITE_FACTS.map((site) => ({ ...site, pricesFillable: false }));

export function detectSite(url: string): SiteConfig | null {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }

  return SITES.find((site) => site.hosts.includes(host)) ?? null;
}

/**
 * Конфиг площадки под конкретный бит.
 *
 * Цены заполняются только когда валюта бита совпадает с той, что ждёт
 * форма: BeatStars показывает доллары, BeatChain рубли. Поставить 500 ₽ в
 * поле `$25.00` — значит назначить треку неверную цену, а такие треки
 * площадки отправляют на переделку. Конвертации нет намеренно: у трека
 * цена должна быть той, которую поставил автор.
 */
export function siteForBeat(url: string, currency: string): SiteConfig | null {
  const site = detectSite(url);
  if (!site) return null;

  return { ...site, pricesFillable: currency === site.currency };
}

/** Текст отчёта: почему цены не поставились. */
export function priceSkipReason(beatCurrency: string, site: SiteConfig): string {
  return `валюта бита ${beatCurrency}, а форма ждёт ${site.currency}`;
}
