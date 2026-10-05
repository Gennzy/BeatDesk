import type { TelegramMessage } from "./telegram-client";

/**
 * Проверки по тому, что Telegram реально вернул, а не по флагу успеха.
 *
 * Публичная отправка аудио отвечает `ok: true` даже тогда, когда обложка
 * не подошла: картинка молча выбрасывается, и пост уходит без лица. Проверять
 * `ok` — значит считать сломанный пост удачным.
 *
 * Два признака удачного поста: обложка применилась и название в плеере то,
 * которое мы задали, а не имя файла из хранилища.
 */

/** Применилась ли обложка: Telegram возвращает её в ответе, если всё в порядке. */
export function coverApplied(message: TelegramMessage | undefined): boolean {
  return Boolean(message?.audio?.thumbnail);
}

/** Совпало ли название в плеере с названием бита. */
export function titleApplied(message: TelegramMessage | undefined, expected: string): boolean {
  const actual = message?.audio?.title?.trim().toLowerCase();
  const wanted = expected.trim().toLowerCase();

  if (!actual) return false;

  return actual === wanted || actual.startsWith(wanted);
}

/**
 * Что делать с постом, раз Telegram это принял.
 *
 * `done` — всё на месте, пост не трогаем.
 * `cover` — принято без картинки: возвращаем обложку в альбом.
 * `coverAndTitle` — принято без обложки и с чужим названием.
 *
 * Раньше тут стоял только флаг успеха, и молчаливо кривой пост уезжал в
 * канал как годный.
 */
export function inspectPost(message: TelegramMessage | undefined, expected: string): "done" | "cover" | "coverAndTitle" {
  const cover = coverApplied(message);
  const named = titleApplied(message, expected);

  if (cover && named) return "done";

  return cover ? "cover" : "coverAndTitle";
}
