import type { BeatFill } from "./fields";
import { fillForm, showNotice } from "./filler";
import { siteForBeat } from "./sites";

type InboundMessage =
  | { type: "beatdesk:ping" }
  | { type: "beatdesk:apply"; beat: BeatFill };

chrome.runtime.onMessage.addListener((message: InboundMessage, _sender, sendResponse) => {
  if (message?.type === "beatdesk:ping") {
    sendResponse({ ok: true, url: location.href });
    return false;
  }

  if (message?.type === "beatdesk:apply") {
    // Конфиг площадки считается под конкретный бит: от его валюты зависит,
    // ставить ли цены.
    const site = siteForBeat(location.href, message.beat.currency);
    if (!site) {
      sendResponse({ ok: false, error: "Страница не похожа на BeatStars или BeatChain" });
      return false;
    }

    const report = fillForm(message.beat, site, document);
    showNotice([
      `Заполнено: ${report.filled.map((item) => item.label).join(", ") || "ничего"}`,
      report.empty.length > 0
        ? `Пропущено, цена не задана: ${report.empty.map((item) => item.label).join(", ")}`
        : "",
      report.skipped.length > 0
        ? `Пропущены цены (${report.skipped[0]?.reason}): ${report.skipped.map((item) => item.label).join(", ")}`
        : "",
      report.missing.length > 0 ? `Форма не содержит: ${report.missing.join(", ")}` : "",
    ]);

    sendResponse({ ok: true, report, site: site.id });
    return false;
  }

  return false;
});
