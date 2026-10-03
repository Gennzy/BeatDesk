import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";

export const alt = "BeatDesk — выкладка битов без рутины";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#08080a",
          color: "#f4f4f0",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 34, letterSpacing: 6 }}>
          <div style={{ width: 20, height: 20, background: "#d8ff3e" }} />
          <div style={{ fontWeight: 700 }}>{SITE_NAME.toUpperCase()}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 }}>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05 }}>
            Один бит — все площадки
          </div>
          <div style={{ fontSize: 34, color: "#8f8f98", lineHeight: 1.3 }}>
            Название, BPM, тональность, теги, имена файлов и тексты для BeatStars, YouTube, ВК и Telegram
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, fontSize: 26, color: "#8f8f98" }}>
          <div style={{ border: "1px solid #26262b", padding: "12px 22px" }}>BeatStars</div>
          <div style={{ border: "1px solid #26262b", padding: "12px 22px" }}>Telegram</div>
          <div style={{ border: "1px solid #26262b", padding: "12px 22px" }}>YouTube</div>
          <div style={{ border: "1px solid #26262b", padding: "12px 22px" }}>ВК</div>
        </div>
      </div>
    ),
    size,
  );
}