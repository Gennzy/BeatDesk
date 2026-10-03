import type { BeatFill } from "./fields";
import { fillForm, showNotice, type FillReport } from "./filler";

export type FillMessage = { type: "beatdesk:fill"; beat: BeatFill };
export type ReportMessage = { type: "beatdesk:report"; report: FillReport };

export type OutboundMessage = FillMessage | ReportMessage;

export type InboundMessage =
  | { type: "beatdesk:ping" }
  | { type: "beatdesk:apply"; beat: BeatFill };

chrome.runtime.onMessage.addListener((message: InboundMessage, _sender, sendResponse) => {
  if (message?.type === "beatdesk:ping") {
    sendResponse({ ok: true, url: location.href });
    return false;
  }

  if (message?.type === "beatdesk:apply") {
    const report = fillForm(message.beat);
    showNotice([
      `Заполнено: ${report.filled.map((item) => item.label).join(", ") || "ничего"}`,
      report.empty.length > 0 ? `Пропущено, цена не задана: ${report.empty.map((item) => item.label).join(", ")}` : "",
      report.missing.length > 0 ? `Не нашёл на форме: ${report.missing.join(", ")}` : "",
    ]);
    sendResponse({ ok: true, report });
    return false;
  }

  return false;
});
