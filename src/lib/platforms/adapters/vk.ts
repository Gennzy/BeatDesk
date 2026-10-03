import type { PublishPayload, PublishResult } from "../payload";

const API_VERSION = "5.199";
const VK_MESSAGE_LIMIT = 4096;

export type PlatformConnection = {
  accessToken?: string | null;
  meta?: Record<string, string | number | null>;
};

/** Пост в сообщество ВК: текст со ссылкой на бит. */
export async function publishToVk(
  connection: PlatformConnection,
  payload: PublishPayload,
): Promise<PublishResult> {
  const token = connection.accessToken;
  const groupId = connection.meta?.groupId;

  if (!token || !groupId) {
    return { ok: false, error: "Нет токена или ID сообщества" };
  }

  const response = await fetch(`https://api.vk.com/method/wall.post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: token,
      v: API_VERSION,
      owner_id: -Math.abs(Number(groupId)),
      message: payload.message.slice(0, VK_MESSAGE_LIMIT),
    }),
  });

  const data = (await response.json()) as { response?: { post_id?: number }; error?: { error_msg?: string } };

  if (data.error || !data.response) {
    return { ok: false, error: data.error?.error_msg ?? "ВК не принял пост" };
  }

  const wall = `https://vk.com/wall${Math.abs(Number(groupId))}_${data.response.post_id}`;

  return { ok: true, externalUrl: wall, detail: { postId: data.response.post_id } };
}
