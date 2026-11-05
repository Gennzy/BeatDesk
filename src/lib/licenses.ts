/**
 * Условия лицензии по уровням продажи.
 *
 * У каждого уровня (MP3, MP3+WAV, Track Out, Exclusive) могут быть свои условия:
 * что покупатель получает, что может делать с битом, ограничения по тиражу и
 * т.д. Пустая строка / отсутствие ключа = «стандартные условия площадки».
 */

export type LicenseTier = "mp3" | "bundle" | "trackout" | "exclusive";

export const LICENSE_TIERS: LicenseTier[] = ["mp3", "bundle", "trackout", "exclusive"];

export type LicenseTerms = Partial<Record<LicenseTier, string>>;

/** Максимальная длина условий для одного уровня. */
export const MAX_LICENSE_TERMS_LENGTH = 2000;

/**
 * Валидация условий лицензии из произвольного ввода.
 *
 * Сервер — источник истины: клиент присылает что угодно, мы приводим к
 * безопасному виду. Пустые строки отбрасываем, чтобы не хранить мусор.
 */
export function normalizeLicenseTerms(input: unknown): LicenseTerms {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const result: LicenseTerms = {};

  for (const tier of LICENSE_TIERS) {
    const raw = (input as Record<string, unknown>)[tier];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_LICENSE_TERMS_LENGTH) continue;
    result[tier] = trimmed;
  }

  return result;
}

/** Есть ли хоть какие-то условия у бита. */
export function hasLicenseTerms(terms: LicenseTerms | null | undefined): boolean {
  if (!terms) return false;
  return LICENSE_TIERS.some((tier) => {
    const value = terms[tier];
    return typeof value === "string" && value.trim().length > 0;
  });
}
