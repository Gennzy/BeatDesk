/**
 * Ролик бита на YouTube.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ ЭТО НУЖНО
 *
 * Битмейкер выкладывает ролик через Pulse, и он лежит в pulse_jobs. Покупатель
 * об этом не знает: он слышит превью и решает по звуку, хотя мог бы посмотреть
 * ролик — и это главный аргумент продажи.
 *
 * Поэтому у бита появляется два режима: звук и видео. Переключение — как на
 * Spotify, где у трека бывает видео, но слушать его всё равно можно.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ЗДЕСЬ ВООБЩЕ НЕТ
 *
 * Ролик лежит на YouTube, и мы его не переделываем: ни своей заливки, ни
 * своего плеера. Нам нужен только адрес, который можно вставить в iframe.
 * Свой плеер видео означал бы вторую реализацию воспроизведения, а это ровно
 * то, из-за чего половина проектов и разваливается.
 */

/** Номер ролика из ссылки на YouTube. */
export function youtubeIdOf(url: string | null | undefined): string | null {
  if (!url) return null;

  const raw = url.trim();

  if (!raw) return null;

  // Короткая ссылка youtu.be/ID
  const short = raw.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (short) return short[1];

  // Обычная ссылка с параметром v
  const withV = raw.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (withV) return withV[1];

  // Ссылка на встраивание
  const embed = raw.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
  if (embed) return embed[1];

  // Голый номер
  const bare = raw.match(/^([A-Za-z0-9_-]{11})$/);
  if (bare) return bare[1];

  return null;
}

/**
 * Адрес для встраивания ролика.
 *
 * youtube-nocookie вместо youtube: он не ставит cookie, пока человек не
 * нажмёт «Смотреть на YouTube», и не даёт ролику следить за посетителями
 * площадки. Для площадки битов это заметная мелочь, а менять нечего.
 */
export function youtubeEmbedUrl(videoId: string, { autoplay = false } = {}): string {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    ...(autoplay ? { autoplay: "1", mute: "1" } : {}),
  });

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/** Ссылка «смотреть на YouTube» для кнопки рядом с плеером. */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
