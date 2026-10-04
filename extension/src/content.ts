import type { BeatFill } from "./fields";
import { fillForm, showNotice } from "./filler";

/**
 * Content script: только заполнение формы на странице площадки.
 *
 * Собран одним файлом — отдельный чанк из общего импорта его не загрузит.
 * Поэтому конфиг площадок здесь продублирован: он состоит из адресов и
 * флагов, а дублирование дешевле поломки. Открытие вкладки и разговор с
 * сайтом живут в service worker, куда попадает внешнее сообщение.
 */
type SiteId = "beatstars" | "beatchain";

const SITE_HOSTS: Record<SiteId, string[]> = {
  beatstars: ["studio.beatstars.com", "www.beatstars.com"],
  beatchain: ["beatchain.io", "www.beatchain.io"],
};

const SITE_FLAGS = {
  beatstars: {
    title: "BeatStars Studio",
    titleLimit: 60,
    keyAsShort: true,
    tagsAs: "chips" as const,
    currency: "USD" as const,
  },
  beatchain: {
    title: "BeatChain",
    titleLimit: 30,
    keyAsShort: false,
    tagsAs: "text" as const,
    currency: "RUB" as const,
  },
};

function detectSite(url: string): SiteId | null {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }

  for (const [id, hosts] of Object.entries(SITE_HOSTS) as [SiteId, string[]][]) {
    if (hosts.includes(host)) return id;
  }

  return null;
}

type InboundMessage =
  | { type: "beatdesk:ping" }
  | { type: "beatdesk:apply"; beat: BeatFill };

/**
 * Конфиг площадки того же вида, что ждёт fillForm.
 *
 * Цены заполняются, когда валюта бита совпадает с той, что ждёт форма:
 * BeatChain принимает рубли, BeatStars доллары. Пока у бита не было своей
 * валюты, цены приходилось пропускать на всех маркетплейсах.
 */
function siteConfig(id: SiteId, currency: string): Parameters<typeof fillForm>[1] {
  const flags = SITE_FLAGS[id];
  const wanted = id === "beatchain" ? "RUB" : "USD";

  return { id, hosts: SITE_HOSTS[id], pricesFillable: currency === wanted, ...flags };
}

chrome.runtime.onMessage.addListener((message: InboundMessage, _sender, sendResponse) => {
  if (message?.type === "beatdesk:ping") {
    sendResponse({ ok: true, url: location.href });
    return false;
  }

  if (message?.type === "beatdesk:apply") {
    const site = detectSite(location.href);
    if (!site) {
      sendResponse({ ok: false, error: "Страница не похожа на BeatStars или BeatChain" });
      return false;
    }

    const report = fillForm(message.beat, siteConfig(site, message.beat.currency));
    showNotice([
      `Заполнено: ${report.filled.map((item) => item.label).join(", ") || "ничего"}`,
      report.empty.length > 0 ? `Пропущено, цена не задана: ${report.empty.map((item) => item.label).join(", ")}` : "",
      report.missing.length > 0 ? `Форма не содержит: ${report.missing.join(", ")}` : "",
    ]);

    sendResponse({ ok: true, report, site });
    return false;
  }

  return false;
});
