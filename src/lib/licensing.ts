/**
 * Лицензии и что покупатель получает.
 *
 * Track Out — это не отдельный формат, а те же стемы: бит, разложенный по
 * дорожкам. Покупатель получает файлы дорожек и может их свести сам, поэтому
 * лицензия на этот уровень строже, чем на MP3: слепить из стемов свой трек
 * и продавать его напрямую нельзя.
 *
 * Порядок уровней не произвольный: каждый следующий включает предыдущий и
 * добавляет права. Отсюда растут и цены — их проверяет validatePrices.
 */

export type TierId = "mp3" | "wav" | "trackout" | "exclusive";

export type Tier = {
  id: TierId;
  /** Название уровня так, как его видит покупатель. */
  label: string;
  /** Что лежит в архиве покупки. */
  files: string[];
  /** Что покупатель вправе делать с покупкой. */
  rights: string[];
  /** Что делать нельзя, даже купив. */
  forbidden: string[];
  /** Права переходят ли к покупателю. */
  transferable: boolean;
  /** Включает все уровни ниже себя. */
  includes: TierId[];
};

export const TIERS: Record<TierId, Tier> = {
  mp3: {
    id: "mp3",
    label: "MP3",
    files: ["MP3 с тегами"],
    rights: ["Свободно выпускать трек на стриминговых площадках", "Использовать в клипах и соцсетях"],
    forbidden: ["Перепродавать сам файл", "Распространять исходник WAV или стемы"],
    transferable: false,
    includes: [],
  },
  wav: {
    id: "wav",
    label: "WAV",
    files: ["WAV без потерь", "MP3 с тегами"],
    rights: ["Всё, что доступно в MP3", "Сводить и переводить трек для студии"],
    forbidden: ["Перепродавать сам файл", "Распространять исходник WAV"],
    transferable: false,
    includes: ["mp3"],
  },
  trackout: {
    id: "trackout",
    label: "Track Out (стемы)",
    files: ["Дорожки WAV по одной на голос", "WAV без потерь", "MP3 с тегами"],
    rights: [
      "Всё, что доступно в WAV",
      "Сводить стемы в любую версию трека",
      "Менять тональность и темп под себя",
    ],
    forbidden: [
      "Выкладывать пересведённые стемы как свой трек",
      "Продавать стемы и исходники дальше",
      "Распространять дорожки целиком",
    ],
    transferable: false,
    includes: ["mp3", "wav"],
  },
  exclusive: {
    id: "exclusive",
    label: "Эксклюзив",
    files: ["Все файлы, включая стемы", "Проект DAW"],
    rights: [
      "Всё, что доступно в Track Out",
      "Права на запись и сведение",
      "Шаблоны для студии",
    ],
    forbidden: ["Перепродажа исходников и проекта"],
    transferable: true,
    includes: ["mp3", "wav", "trackout"],
  },
};

/** Уровни по возрастанию прав — в этом порядке сравниваются цены. */
export const TIER_ORDER: TierId[] = ["mp3", "wav", "trackout", "exclusive"];

/** Что видит покупатель: разбор лицензии на человеческом языке. */
export function licenseText(id: TierId): string {
  const tier = TIERS[id];

  return [
    `<b>${tier.label}</b>`,
    "",
    `<b>В архиве:</b> ${tier.files.join(", ")}`,
    "",
    "<b>Можно:</b>",
    ...tier.rights.map((right) => `— ${right}`),
    "",
    "<b>Нельзя:</b>",
    ...tier.forbidden.map((rule) => `— ${rule}`),
    "",
    tier.transferable ? "Права переходят к покупателю." : "Права остаются у автора.",
  ].join("\n");
}

/** Все уровни, что входят в выбранный, включая его самого. */
export function grantedTiers(id: TierId): TierId[] {
  return [id, ...TIERS[id].includes];
}

/** Уровни, которые входят в один, но не в другой. */
export function difference(from: TierId, to: TierId): string[] {
  const granted = new Set(grantedTiers(to));
  const source = new Set(grantedTiers(from));

  return [...granted].filter((tier) => !source.has(tier)).map((tier) => TIERS[tier].label);
}
