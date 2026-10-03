export type PlaybackState = {
  /** 0..1 — текущий уровень сигнала */
  level: number;
  playing: boolean;
};

type Listener = (state: PlaybackState) => void;

let state: PlaybackState = { level: 0, playing: false };
const listeners = new Set<Listener>();

/** Вызывается единым плеером: 3D-сцена в hero реагирует на уровень сигнала. */
export function emitPlayback(next: Partial<PlaybackState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
}

export function getPlayback(): PlaybackState {
  return state;
}

export function subscribePlayback(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}