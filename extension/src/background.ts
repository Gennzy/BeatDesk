import type { BeatFill } from "./fields";

/**
 * Service worker: единственное место, куда доходит сообщение с сайта.
 *
 * Раньше эта логика жила в content script, и flow не мог сработать в принципе:
 * сообщение с веб-страницы приходит только в background, а `chrome.tabs` и
 * `chrome.scripting` в content script недоступны.
 */

type Platform = "beatstars" | "beatchain";

/** Что сайт может прислать расширению. */
type ExternalMessage = {
  type: "beatdesk:open-and-fill";
  platform: Platform;
  beatId: string;
};

type Incoming = ExternalMessage | { type: "beatdesk:hello" };

const UPLOAD_PATHS: Record<Platform, string> = {
  beatstars: "https://studio.beatstars.com/content/tracks/uploaded",
  beatchain: "https://beatchain.io/home",
};

const DEFAULT_SITE_ORIGIN = "https://beat-desk.vercel.app";

let siteOrigin = DEFAULT_SITE_ORIGIN;

async function rememberOrigin(url: string | undefined): Promise<void> {
  if (!url) return;
  try {
    const origin = new URL(url).origin;
    if (origin === siteOrigin) return;
    siteOrigin = origin;
    await chrome.storage.local.set({ siteOrigin: origin });
  } catch {
    // адрес не разобрали — остаёмся на прошлом
  }
}

chrome.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
  const typed = (message ?? {}) as Partial<Incoming>;

  if (typed?.type === "beatdesk:hello") {
    void rememberOrigin(sender.url).then(() => sendResponse({ ok: true }));
    return false;
  }

  if (typed?.type !== "beatdesk:open-and-fill") return false;

  const platform = typed.platform;
  const beatId = typeof typed.beatId === "string" ? typed.beatId : "";

  if (!platform || !(platform in UPLOAD_PATHS) || !beatId) {
    sendResponse({ ok: false, error: "Неизвестная площадка или бит" });
    return false;
  }

  void start(platform, beatId, sender.url)
    .then((result) => sendResponse(result))
    .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));

  return true;
});

/**
 * Открывает вкладку площадки и отвечает сразу, не дожидаясь формы.
 *
 * Форма на площадке рендерится секунды, а сообщение с сайта живёт недолго:
 * держать порт открытым на весь цикл заполнения ненадёжно — service worker
 * могут выгрузить. Подстановка продолжается сама, а отчёт о ней content script
 * показывает прямо на странице площадки.
 */
async function start(
  platform: Platform,
  beatId: string,
  fromUrl: string | undefined,
): Promise<{ ok: boolean; error?: string }> {
  await rememberOrigin(fromUrl);

  const beat = await loadBeat(beatId);
  if (!beat) return { ok: false, error: "Бит не найден или не публичный" };

  const url = UPLOAD_PATHS[platform];
  const tabId = await ensureTab(url);
  if (tabId === undefined) return { ok: false, error: "Не удалось открыть вкладку" };

  void fillWhenReady(tabId, beat);

  return { ok: true };
}

/** Находит уже открытую вкладку площадки или создаёт новую и делает её активной. */
async function ensureTab(url: string): Promise<number | undefined> {
  const origin = new URL(url).origin;

  const existing = await chrome.tabs.query({ url: `${origin}/*` }).catch(() => []);
  const tabId = existing[0]?.id ?? (await chrome.tabs.create({ url, active: true })).id;

  if (tabId === undefined) return undefined;

  await chrome.tabs.update(tabId, { active: true }).catch(() => undefined);

  return tabId;
}

/**
 * Подстановка с повторами: первый заход обычно прилетает раньше, чем
 * форма отрисовалась. Каждая попытка заново внедряет content script —
 * на SPA-навигации он мог не попасть в документ.
 */
async function fillWhenReady(tabId: number, beat: BeatFill): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await wait(800);

    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      const report = (await chrome.tabs.sendMessage(tabId, { type: "beatdesk:apply", beat })) as
        | { ok?: boolean; report?: { filled?: unknown[] } }
        | undefined;

      if (report?.ok && report.report?.filled?.length) return;
    } catch {
      // вкладка ещё грузится — пробуем следующий раз
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadBeat(beatId: string): Promise<BeatFill | null> {
  const stored = (await chrome.storage.local.get("siteOrigin").catch(() => null)) as
    | { siteOrigin?: unknown }
    | null;
  const origin = typeof stored?.siteOrigin === "string" ? stored.siteOrigin : siteOrigin;

  const response = await fetch(`${origin}/api/beats/${encodeURIComponent(beatId)}/fill`).catch(() => null);
  if (!response?.ok) return null;

  return (await response.json()) as BeatFill;
}
