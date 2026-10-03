export const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export const MUSICAL_KEYS = [
  ...PITCH_CLASSES.map((note) => `${note} minor`),
  ...PITCH_CLASSES.map((note) => `${note} major`),
];