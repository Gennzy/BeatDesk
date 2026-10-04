export type SiteId = "beatstars" | "beatchain";

export type SiteConfig = {
  id: SiteId;
  title: string;
  hosts: string[];
  /** Сколько символов влезет в название на площадке. */
  titleLimit: number;
  /** Валюта цен в форме. */
  currency: "RUB" | "USD";
  /** Наши цены хранятся в рублях. На площадке в долларах ставить их нельзя. */
  pricesFillable: boolean;
  /** Поле тональности — выпадающий список со сокращениями вроде «G#m». */
  keyAsShort: boolean;
  /** Теги в BeatStars — чипы, в BeatChain — обычная строка. */
  tagsAs: "chips" | "text";
};

export const SITES: SiteConfig[] = [
  {
    id: "beatstars",
    title: "BeatStars Studio",
    hosts: ["studio.beatstars.com", "www.beatstars.com"],
    titleLimit: 60,
    currency: "USD",
    pricesFillable: false,
    keyAsShort: true,
    tagsAs: "chips",
  },
  {
    id: "beatchain",
    title: "BeatChain",
    hosts: ["beatchain.io", "www.beatchain.io"],
    titleLimit: 30,
    currency: "RUB",
    pricesFillable: true,
    keyAsShort: false,
    tagsAs: "text",
  },
];

export function detectSite(url: string): SiteConfig | null {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }

  return SITES.find((site) => site.hosts.includes(host)) ?? null;
}
