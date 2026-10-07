import type { Platform } from "./registry";

/**
 * Подключена ли площадка по-настоящему.
 *
 * Раньше считалось, что площадка подключена, если в базе есть строка. Но
 * строка создаётся и пустой: кнопка «подключить» для YouTube честно
 * отвечала «данные подключения не сохранены», а интерфейс показывал
 * «подключено». Так выглядит работающий сервис, который ничего не делает.
 *
 * Строка без секрета — это не подключение, а черновик.
 */

export type ConnectionRow = {
  platform: string;
  hasToken: boolean;
  label: string | null;
  meta: Record<string, unknown> | null;
};

/** Нужен ли секрет, чтобы площадка считалась подключённой. */
export function needsSecret(platform: Pick<Platform, "auth">): boolean {
  return platform.auth === "token" || platform.auth === "oauth";
}

export function isConnected(platform: Pick<Platform, "auth">, row: ConnectionRow | undefined): boolean {
  if (!row) return false;

  return !needsSecret(platform) || row.hasToken;
}

/** Почему площадка кажется подключённой, но не работает. */
export function connectionProblem(
  platform: Pick<Platform, "auth">,
  row: ConnectionRow | undefined,
): "нет строки" | "нет секрета" | null {
  if (!row) return null;
  if (needsSecret(platform) && !row.hasToken) return "нет секрета";

  return null;
}
