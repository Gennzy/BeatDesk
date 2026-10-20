import type { FeedBeat } from "@/lib/feed";

export type PlayerTrack = {
  id: string;
  title: string;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  audioUrl: string;
  bpm: number;
  musicalKey: string;
  /**
   * Ролик бита на YouTube, если он выложен через Pulse.
   *
   * Ссылка целиком, а не номер: номер — внутреннее дело YouTube, и плеер
   * не должен знать, как он устроен. Разбирать ссылку будут те, кто её
   * встраивает.
   */
  videoUrl: string | null;
};

/**
 * Собирает трек для плеера.
 *
 * Ролик приходит отдельным аргументом, а не полем бита: он лежит не в бите,
 * а в задаче публикации, и в общий список битов его тащить незачем — там
 * появилась бы лишняя колонка и лишняя выборка на каждую карточку ленты.
 */
export function trackFromBeat(beat: FeedBeat, videoUrl: string | null = null): PlayerTrack | null {
  if (!beat.mp3Url) return null;

  return {
    id: beat.id,
    title: beat.title,
    username: beat.username,
    avatarUrl: beat.avatarUrl,
    coverUrl: beat.coverUrl,
    audioUrl: beat.mp3Url,
    bpm: beat.bpm,
    musicalKey: beat.musicalKey,
    videoUrl,
  };
}