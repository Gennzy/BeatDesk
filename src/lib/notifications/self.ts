import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Уведомление самому себе: загрузка бита, публикация на витрине.
 *
 * Пишем через service_role: уведомление получает тот же человек, который и
 * совершил действие, а политика вставки в notifications рассчитана на
 * социальные события от другого пользователя.
 *
 * Ошибка здесь не поднимается: действие уже состоялось, и невозможность
 * записать уведомление не должна превращать успешную загрузку бита в ошибку.
 */
export async function notifySelf(
  userId: string,
  kind: "beat_uploaded" | "beat_failed" | "beat_published",
  beatId: string | null,
): Promise<void> {
  try {
    await getAdminClient().rpc("notify_user", {
      p_user: userId,
      p_kind: kind,
      p_beat: beatId,
      // Ключ обязателен: уведомление о неудаче одно на бит, а битов
      // у битмейкера много, и без него они сходились бы в одно.
      p_key: beatId ? 1 : 0,
    });
  } catch {
    // молча: уведомление не пришло, само действие не отменено
  }
}