import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";


export const alt = "BeatDesk · маркетплейс битов";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function logoDataUrl(): Promise<string> {
  const file = await readFile(path.join(process.cwd(), "public", "brand", "beatdesk-mark-180.png"));

  return `data:image/png;base64,${file.toString("base64")}`;
}

export default async function OpengraphImage() {
  const logo = await logoDataUrl();

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
          // Цвета — токены сайта вручную: OG-кадр рисуется без CSS,
          // var() здесь не работает. ink #050505, paper #e9e7e1, mute #9a9a96.
          background: "#050505",
          color: "#e9e7e1",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={72} height={72} alt="" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 }}>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05 }}>
            Маркетплейс битов
          </div>
          <div style={{ fontSize: 34, color: "#9a9a96", lineHeight: 1.3 }}>
            Цены по лицензиям, мастер и стемы после оплаты. Публикация в Telegram, ВК и YouTube — одним нажатием
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, fontSize: 26, color: "#9a9a96" }}>
          <div style={{ border: "1px solid #2c2c2c", padding: "12px 22px" }}>Telegram</div>
          <div style={{ border: "1px solid #2c2c2c", padding: "12px 22px" }}>YouTube</div>
          <div style={{ border: "1px solid #2c2c2c", padding: "12px 22px" }}>ВК</div>
        </div>
      </div>
    ),
    size,
  );
}