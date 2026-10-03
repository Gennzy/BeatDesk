import type { PlatformConnection } from "./vk";
import type { PublishPayload, PublishResult } from "../payload";

/** Пост в канал Discord через webhook: embed со ссылкой на бит. */
export async function publishToDiscord(
  connection: PlatformConnection,
  payload: PublishPayload,
): Promise<PublishResult> {
  const webhookUrl = connection.meta?.webhookUrl ? String(connection.meta.webhookUrl) : null;

  if (!webhookUrl || !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    return { ok: false, error: "Некорректный webhook URL" };
  }

  const embed = {
    title: payload.beat.title,
    url: payload.beatUrl,
    description: payload.message.replace(payload.beatUrl, "").trim(),
    color: 0xd8ff3e,
    fields: [
      { name: "BPM", value: String(payload.beat.bpm), inline: true },
      { name: "Тональность", value: payload.beat.musicalKey, inline: true },
      ...(payload.beat.tags.length > 0
        ? [{ name: "Теги", value: payload.beat.tags.map((tag) => `#${tag}`).join(" "), inline: false }]
        : []),
    ],
    ...(payload.coverUrl ? { thumbnail: { url: payload.coverUrl } } : {}),
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "BeatDesk", embeds: [embed] }),
  });

  if (!response.ok) {
    return { ok: false, error: `Discord ответил ${response.status}` };
  }

  return { ok: true, detail: { embed: embed.title } };
}
