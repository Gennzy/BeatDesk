import type { BeatFill } from "./fields";
import { fillForm, showNotice, type FillReport } from "./filler";
import { detectSite } from "./sites";

export type InboundMessage =
  | { type: "beatdesk:ping" }
  | { type: "beatdesk:apply"; beat: BeatFill };

export type Response = { ok: true; report: FillReport; site: string } | { ok: false; error: string };

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

    const report = fillForm(message.beat, site);

    showNotice([
      `Заполнено: ${report.filled.map((item) => item.label).join(", ") || "ничего"}`,
      report.empty.length > 0 ? `Пропущено, цена не задана: ${report.empty.map((item) => item.label).join(", ")}` : "",
      report.missing.length > 0 ? `Форма не содержит: ${report.missing.join(", ")}` : "",
      report.skipped.length > 0 ? `Пропущено намеренно: ${report.skipped.map((item) => item.label).join(", ")}` : "",
    ]);

    sendResponse({ ok: true, report, site: site.id });
    return false;
  }

  return false;
});
