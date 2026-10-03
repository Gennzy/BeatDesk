import type { BeatFill } from "./fields";
import type { FillReport } from "./filler";

const urlInput = document.getElementById("url") as HTMLInputElement;
const loadButton = document.getElementById("load") as HTMLButtonElement;
const fillButton = document.getElementById("fill") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLDivElement;
const beatBox = document.getElementById("beat") as HTMLDListElement;

let beat: BeatFill | null = null;

/** Из ссылки на бит достаём адрес сайта и id: /beats/<uuid> */
function parseBeatUrl(input: string): { origin: string; id: string } | null {
  try {
    const url = new URL(input.trim());
    const match = url.pathname.match(/\/beats\/([0-9a-f-]{36})\/?$/i);
    if (!match?.[1]) return null;
    return { origin: url.origin, id: match[1] };
  } catch {
    return null;
  }
}

function setStatus(text: string, tone: "idle" | "ok" | "err" = "idle"): void {
  status.textContent = text;
  status.className = `status ${tone === "idle" ? "" : tone}`.trim();
}

function renderBeat(data: BeatFill): void {
  beatBox.replaceChildren();
  const rows: [string, string][] = [
    ["Название", data.title],
    ["BPM", String(data.bpm)],
    ["Тональность", data.key],
    ["Теги", data.hashtags || "—"],
    ["Цены", data.priceLine || "не заданы"],
  ];

  for (const [name, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = name;
    const dd = document.createElement("dd");
    dd.textContent = value;
    beatBox.append(dt, dd);
  }
}

loadButton.addEventListener("click", async () => {
  const parsed = parseBeatUrl(urlInput.value);
  if (!parsed) {
    setStatus("Нужна ссылка вида /beats/<id>", "err");
    return;
  }

  loadButton.disabled = true;
  setStatus("Загружаю бит…");

  try {
    const response = await fetch(`${parsed.origin}/api/beats/${parsed.id}/fill`);
    const data = (await response.json()) as BeatFill & { error?: string };

    if (!response.ok) {
      setStatus(data.error ?? "Не удалось загрузить бит", "err");
      return;
    }

    beat = data;
    renderBeat(data);
    fillButton.disabled = false;
    setStatus("Бит загружен. Открой форму на маркетплейсе и жми «Заполнить».", "ok");
  } catch {
    setStatus("Сайт BeatDesk недоступен", "err");
  } finally {
    loadButton.disabled = false;
  }
});

fillButton.addEventListener("click", async () => {
  if (!beat) return;

  fillButton.disabled = true;
  setStatus("Заполняю…");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus("Не вижу вкладку", "err");
      return;
    }

    const supported = /beatstars\.com|beatchain\.io/.test(tab.url ?? "");
    if (!supported) {
      setStatus("Открой Studio BeatStars или beatchain.io — сейчас открыта другая страница", "err");
      return;
    }

    let response: { report?: FillReport } | undefined;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: "beatdesk:apply", beat });
    } catch {
      // content script ещё не загружен — внедряем разово
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      response = await chrome.tabs.sendMessage(tab.id, { type: "beatdesk:apply", beat });
    }

    const report = response?.report;
    if (!report) {
      setStatus("Форма не ответила. Обнови страницу и попробуй снова.", "err");
      return;
    }

    const parts = [`Заполнено: ${report.filled.map((item) => item.label).join(", ") || "ничего"}`];
    if (report.empty.length > 0) {
      parts.push(`Пропущено, цена не задана: ${report.empty.map((item) => item.label).join(", ")}`);
    }
    if (report.missing.length > 0) {
      parts.push(`Форма не содержит: ${report.missing.join(", ")}`);
    }

    setStatus(parts.join(" · "), report.filled.length > 0 ? "ok" : "err");
  } catch {
    setStatus("Не получилось достучаться до формы", "err");
  } finally {
    fillButton.disabled = false;
  }
});
