/**
 * Список артистов, с которыми работал битмейкер.
 *
 * Разбор строки в список живёт здесь, а не в форме: правила нужны и при
 * сохранении, и при чтении, и разойтись они не должны.
 */

/** Сколько артистов показываем в профиле. */
export const COLLABORATOR_LIMIT = 12;

/**
 * Разобрать то, что битмейкер набрал руками.
 *
 * Принимаем и запятую, и перенос строки: в это поле вводят по-разному, и
 * молча выбрасывать половину введённого нельзя.
 */
export function parseCollaborators(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input)
    ? input
    : (input ?? "").split(/[\n,;]+/);

  const seen = new Set<string>();
  const names: string[] = [];

  for (const item of raw) {
    const name = item.trim().replace(/\s+/g, " ");

    // Два символа — это опечатка, а не артист: в профиль такое попадать не
    // должно, иначе строка быстро засорится.
    if (name.length < 2 || name.length > 40) continue;

    const key = name.toLowerCase();

    // Один и тот же артист с разным регистром — это всё равно один артист.
    if (seen.has(key)) continue;

    seen.add(key);
    names.push(name);
  }

  return names.slice(0, COLLABORATOR_LIMIT);
}

/** Подсказка для поля: сколько можно и в каком виде. */
export const collaboratorsHint = `До ${COLLABORATOR_LIMIT} имён, через запятую или каждое с новой строки`;
