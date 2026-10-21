/**
 * Сверка находки с нашими покупателями.
 *
 * ---------------------------------------------------------------------------
 * ГЛАВНОЕ ОТЛИЧИЕ
 *
 * Wavesmatch отвечает на вопрос «кто использовал твой бит». У них нет списка
 * покупателей, и это понятно: они чужие.
 *
 * У нас список есть. Каждая покупка и каждое бесплатное скачивание записано
 * с отпечатком выданного файла. Поэтому мы отвечаем на вопрос, на который
 * они ответить не могут: «этот релиз сделал человек, который у нас скачал
 * твой бит 12 марта бесплатно».
 *
 * Это и есть то, за что платят: не «где-то use», а «вот кто и когда».
 *
 * ---------------------------------------------------------------------------
 * ЧЕСТНОЕ ОГРАНИЧЕНИЕ
 *
 * Совпадение отпечатков означает «файл очень похож», а не «это тот самый
 * файл». Отпечаток намеренно грубый: он переживает пережатие, но и
 * похожие биты могут дать высокое совпадение. Поэтому находка — это повод
 * для разговора с артистом, а не приговор, и в отчёте это сказано прямо.
 */

/** Запись журнала: кто и когда брал файл. */
export type DownloadRecord = {
  userId: string;
  /** Отпечаток выданного файла. */
  envelope: string;
  createdAt: string;
  /** Имя для показа: ник или почта. */
  label: string;
};

/** Находка на площадке. */
export type FoundRelease = {
  platform: string;
  title: string | null;
  artist: string | null;
  url: string | null;
  confidence: number;
  /** Отпечаток совпавшего файла, если движок его вернул. */
  envelope: string | null;
};

/** Кто находки соответствует нашему журналу. */
export type Suspect = {
  userId: string;
  label: string;
  /** Когда брал. */
  createdAt: string;
  /** Насколько похожи отпечатки, 0..1. */
  match: number;
};

/**
 * Порог, с которого совпадение считается находкой.
 *
 * Тот же, что и для находок на площадках: ниже — это «похоже», а не «тот
 * самый файл».
 */
export const SUSPECT_THRESHOLD = 0.85;

/**
 * Кто из наших покупателей мог слить этот релиз.
 *
 * Сравнивается отпечаток находки с отпечатками всех, кто брал бит. Совпало —
 * вот и подозреваемый, с датой и процентом.
 */
export function findSuspects(
  found: FoundRelease,
  downloads: DownloadRecord[],
  threshold = SUSPECT_THRESHOLD,
): Suspect[] {
  if (!found.envelope) return [];

  const suspects: Suspect[] = [];

  for (const download of downloads) {
    const match = compareEnvelopes(found.envelope, download.envelope);

    if (match >= threshold) {
      suspects.push({
        userId: download.userId,
        label: download.label,
        createdAt: download.createdAt,
        match,
      });
    }
  }

  return suspects.sort((a, b) => b.match - a.match);
}

/**
 * Сравнение двух отпечатков, 0..1.
 *
 * Считается доля совпавших окон. Отпечатки разной длины сравниваются по
 * общему началу.
 */
export function compareEnvelopes(a: string, b: string): number {
  if (!a || !b) return 0;

  const first = decode(a);
  const second = decode(b);

  if (first.length === 0 || second.length === 0) return 0;

  const windows = Math.floor(Math.min(first.length, second.length) / 2);

  if (windows === 0) return 0;

  let same = 0;

  for (let w = 0; w < windows; w++) {
    const levelA = first[w * 2];
    const levelB = second[w * 2];
    const toneA = first[w * 2 + 1];
    const toneB = second[w * 2 + 1];

    if (Math.abs(levelA - levelB) <= 1 && Math.abs(toneA - toneB) <= 2) same += 1;
  }

  return same / windows;
}

/** Распаковка отпечатка из строки. */
function decode(value: string): Uint8Array {
  try {
    const raw = atob(value);
    const out = new Uint8Array(raw.length);

    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);

    return out;
  } catch {
    return new Uint8Array(0);
  }
}
