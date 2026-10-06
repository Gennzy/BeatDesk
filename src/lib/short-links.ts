import { randomBytes } from "node:crypto";

/**
 * Короткие ссылки: код и адрес.
 *
 * Код берётся из криптографически стойкого генератора, а не из счётчика:
 * счётчик выдаёт подряд идущие коды, и тот, кто видит две ссылки, знает
 * будущую.
 */

/** Длина кода: 7 символов base32 даёт около 34 млрд вариантов. */
export const CODE_LENGTH = 7;

/** Ранг и бит, чтобы адрес читался и его можно было надиктовать. */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * Проверка кода.
 *
 * Проверяем и набор символов, и длину: код попадает в путь запроса, и без
 * проверки в таблицу уехала бы чушь от руки.
 */
export function isCode(value: unknown): value is string {
  if (typeof value !== "string") return false;

  return /^[0-9abcdefghjkmnpqrstvwxyz]{6,10}$/.test(value);
}

/** Новый код. */
export function newCode(length = CODE_LENGTH): string {
  const bytes = randomBytes(length);

  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += ALPHABET[bytes[index]! % ALPHABET.length];
  }

  return code;
}

/**
 * Куда ведёт ссылка.
 *
 * Только наши пути: иначе через короткую ссылку можно было бы сделать
 * подмену на чужой сайт, а человек решит, что его привели к нам.
 */
export function isSafeTarget(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const path = value.trim();
  if (!path.startsWith("/")) return false;
  // Двойной слэш — это уже попытка уйти на другой адрес.
  if (path.startsWith("//")) return false;
  if (path.length > 300) return false;

  return true;
}

/** Привести путь к каноничному виду: без слеша в конце. */
export function normalizeTarget(path: string): string {
  const trimmed = path.trim();

  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

/** Адрес для показа человеку. */
export function shortUrl(code: string, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/s/${code}`;
}