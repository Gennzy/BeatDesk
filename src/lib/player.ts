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
};

export function trackFromBeat(beat: FeedBeat): PlayerTrack | null {
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
  };
}