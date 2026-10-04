import type { BeatFill } from "./fields";
import { fillForm, showNotice, type FillReport } from "./filler";
/**
 * Content script собран одним файлом: отдельный чанк из общего импорта
 * его не загрузит. Поэтому конфиг площадок здесь продублирован — он
 * состоит из адресов и флагов, а дублирование дешевле поломки.
 */
type SiteId = "beatstars" | "beatchain";

const SITE_HOSTS: Record<SiteId, string[]> = {
  beatstars: ["studio.beatstars.com", "www.beatstars.com"],
  beatchain: ["beatchain.io", "www.beatchain.io"],
};

const SITE_FLAGS = {
  beatstars: { title: "BeatStars Studio", titleLimit: 60, keyAsShort: true, tagsAs: "chips" as const, currency: "USD" as const },
  beatchain: { title: "BeatChain", titleLimit: 30, keyAsShort: false, tagsAs: "text" as const, currency: "RUB" as const },
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

/** Сообщение с сайта BeatDesk: открыть форму и заполнить. */
export type ExternalMessage = {
  type: "beatdesk:open-and-fill";
  platform: "beatstars" | "beatchain" | "airbit";
  beatId: string;
};

const UPLOAD_PATHS: Record<ExternalMessage["platform"], string> = {
  beatstars: "https://studio.beatstars.com/content/tracks/uploaded",
  beatchain: "https://beatchain.io/home",
  airbit: "https://airbit.com/dashboard",
};

const SITES: Record<ExternalMessage["platform"], SiteId> = {
  beatstars: "beatstars",
  beatchain: "beatchain",
  airbit: "beatstars",
};

/**
 * Конфиг площадки того же вида, что ждёт fillForm.
 *
 * Цены заполняются, когда валюта бита совпадает с той, что ждёт форма:
 * BeatChain принимает рубли, BeatStars доллары. Раньше валюты у бита не
 * было и цены приходилось пропускать на всех маркетплейсах.
 */
function siteConfig(id: SiteId, currency: string): Parameters<typeof fillForm>[1] {
  const flags = SITE_FLAGS[id];
  const wanted = id === "beatchain" ? "RUB" : "USD";

  return { id, hosts: SITE_HOSTS[id], pricesFillable: currency === wanted, ...flags };
}

/**
 * Заполнение формы по клику на сайте BeatDesk.
 *
 * Идея: кнопка на странице публикации должна уводить на площадку уже с
 * готовыми полями. Копировать текст вручную — это ровно та рутина,
 * ради устранения которой сервис и существует.
 */
chrome.runtime.onMessageExternal.addListener((message: ExternalMessage, _sender, sendResponse) => {
  if (message?.type !== "beatdesk:open-and-fill") return false;

  void handleOpenAndFill(message)
    .then((result) => sendResponse(result))
    .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));

  return true;
});

async function handleOpenAndFill(message: ExternalMessage): Promise<{ ok: boolean; error?: string }> {
  const beat = await loadBeat(message.beatId);
  if (!beat) return { ok: false, error: "бит не найден или не публичный" };

  const url = UPLOAD_PATHS[message.platform];

  const [tab] = await chrome.tabs.query({ url: `${new URL(url).origin}/*` });
  const target = tab?.id ? tab.id : (await chrome.tabs.create({ url, active: true })).id;
  if (target === undefined) return { ok: false, error: "не удалось открыть вкладку" };

  await chrome.tabs.update(target, { active: true });

  // Форма на площадке рендерится после загрузки, поэтому подстановку
  // повторяем: первый раз может быть раньше, чем поля появились.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(700);

    try {
      await chrome.scripting.executeScript({ target: { tabId: target }, files: ["content.js"] });
      const report = await chrome.tabs.sendMessage(target, { type: "beatdesk:apply", beat });

      if (report?.ok && report.report?.filled?.length) {
        return { ok: true };
      }
    } catch {
      // вкладка ещё не готова — пробуем следующий раз
    }
  }

  return { ok: true, error: "форма не нашлась: открой её вручную" };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadBeat(beatId: string): Promise<BeatFill | null> {
  const stored = await chrome.storage.local.get("siteOrigin");
  const origin = typeof stored.siteOrigin === "string" ? stored.siteOrigin : "https://beat-desk.vercel.app";

  const response = await fetch(`${origin}/api/beats/${beatId}/fill`).catch(() => null);
  if (!response?.ok) return null;

  return (await response.json()) as BeatFill;
}

// Сайт сообщает свой адрес, чтобы расширение не гадало о нём.
chrome.runtime.onMessageExternal.addListener((message: { type?: string; origin?: string }, sender) => {
  if (message?.type === "beatdesk:hello" && sender.url) {
    void chrome.storage.local.set({ siteOrigin: new URL(sender.url).origin });
  }
  return false;
});

// Остальное поведение content script
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
