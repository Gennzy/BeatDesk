/**
 * Сервис закрыт на время разработки.
 *
 * Показывать рабочий интерфейс всем сразу опасно: любой случайный гость
 * увидит незакрытые углы, а изменения на живых данных попадут в выдачу.
 * Поэтому по умолчанию сайт закрыт заглушкой.
 *
 * Закрыт он не для всех: владелец по адресу и локальная разработка видят
 * настоящий интерфейс. Иначе нельзя было бы ни проверять правки, ни
 * прогонять e2e.
 */

const DEFAULT_OWNER_EMAIL = "gennzybeatz@gmail.com";

export const ownerEmail = () => (process.env.BEATDESK_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL).toLowerCase();

export type GateReason = "выключен" | "владелец" | "локально" | "разработка";

export type Gate = { open: boolean; reason: GateReason };

export function evaluateGate(input: {
  /** BEATDESK_GATE: строка "off" открывает сайт для всех. */
  gate?: string;
  email?: string | null;
  /** Продакшен ли это. На localhost и в preview интерфейс доступен. */
  production?: boolean;
}): Gate {
  if (input.gate?.trim().toLowerCase() === "off") return { open: true, reason: "выключен" };

  // Локально и на превью деплой инструменты должны работать целиком.
  if (input.production !== true) return { open: true, reason: "локально" };

  if ((input.email ?? "").toLowerCase() === ownerEmail()) return { open: true, reason: "владелец" };

  return { open: false, reason: "разработка" };
}
