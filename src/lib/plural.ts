/** Русские окончания: 1 бит, 2 бита, 5 битов. */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function pluralEn(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}