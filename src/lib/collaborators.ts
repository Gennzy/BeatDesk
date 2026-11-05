/**
 * Соавторы бита и разделение доходов.
 *
 * Доля указывается в базисных пунктах (bps): 10000 = 100%. Так деление
 * не теряет копейки: сумма долей всегда ровно 10000, и при продаже
 * amount_minor * share_bps / 10000 даёт целые копейки без дробей.
 */

export type Collaborator = {
  /** ID профиля соавтора. */
  user_id: string;
  /** Доля в bps: 10000 = 100%. */
  share_bps: number;
};

export const TOTAL_SHARE_BPS = 10000;

/** Валидация списка соавторов. Возвращает нормализованный список или ошибку. */
export function normalizeCollaborators(input: unknown): { ok: true; value: Collaborator[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Соавторы заданы неверно" };

  const result: Collaborator[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (!item || typeof item !== "object") return { ok: false, error: "Соавторы заданы неверно" };
    const rec = item as Record<string, unknown>;

    const userId = typeof rec.user_id === "string" ? rec.user_id.trim() : "";
    if (!userId) return { ok: false, error: "У соавтора нет идентификатора" };
    if (seen.has(userId)) return { ok: false, error: "Соавтор указан дважды" };
    seen.add(userId);

    const share = rec.share_bps;
    if (typeof share !== "number" || !Number.isInteger(share) || share < 0 || share > TOTAL_SHARE_BPS) {
      return { ok: false, error: "Доля соавтора задана неверно" };
    }
    result.push({ user_id: userId, share_bps: share });
  }

  const total = result.reduce((sum, c) => sum + c.share_bps, 0);
  if (result.length > 0 && total !== TOTAL_SHARE_BPS) {
    return { ok: false, error: "Доли соавторов должны в сумме давать 100%" };
  }

  return { ok: true, value: result };
}

/** Есть ли соавторы у бита. */
export function hasCollaborators(list: Collaborator[] | null | undefined): boolean {
  return Array.isArray(list) && list.length > 0;
}