"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

type SavedAd = { title: string; variants: string[]; savedAt: string };

/**
 * Блок рекламных текстов для бита.
 *
 * Генерирует несколько вариантов заголовков и основных текстов под Meta
 * (Facebook/Instagram) и Google Search на основе метаданных бита. Варианты
 * можно сохранить в локальную библиотеку — они не теряются при перезагрузке.
 */
export function AdCopyBlock({ title, bpm, musicalKey, tags }: { title: string; bpm: number; musicalKey: string; tags: string[] }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const tagLine = tags.slice(0, 3).map((tag) => `#${tag}`).join(" ");

  const metaHeadlines = [
    `${title} Type Beat — ${bpm} BPM ${musicalKey}`,
    `${title} Type Beat | ${bpm} BPM ${musicalKey} Instrumental`,
    `New ${title} Type Beat — ${bpm} BPM`,
  ];
  const metaPrimary = `${title} type beat. ${bpm} BPM, ${musicalKey}. ${tagLine}. Лицензия и эксклюзив — по ссылке.`;
  const googleHeadlines = [
    `${title} Type Beat | ${bpm} BPM`,
    `${title} Beat — ${bpm} BPM ${musicalKey}`,
    `Buy ${title} Type Beat`,
  ];
  const googleDescription = `Купить бит ${title}: ${bpm} BPM, ${musicalKey}. Лицензия и эксклюзив. Скачать сразу после оплаты.`;

  const allVariants = [...metaHeadlines, metaPrimary, ...googleHeadlines, googleDescription];

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  function saveToLibrary() {
    try {
      const raw = window.localStorage.getItem("beatdesk:ad-library");
      const library: SavedAd[] = raw ? (JSON.parse(raw) as SavedAd[]) : [];
      library.unshift({ title, variants: allVariants, savedAt: new Date().toISOString() });
      // Держим не больше 20 записей, чтобы не раздувать хранилище.
      window.localStorage.setItem("beatdesk:ad-library", JSON.stringify(library.slice(0, 20)));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // ignore
    }
  }

  const sections: { label: string; items: { key: string; text: string }[] }[] = [
    {
      label: "Meta · заголовки",
      items: metaHeadlines.map((text, index) => ({ key: `meta-h-${index}`, text })),
    },
    { label: "Meta · основной текст", items: [{ key: "meta-primary", text: metaPrimary }] },
    {
      label: "Google · заголовки",
      items: googleHeadlines.map((text, index) => ({ key: `google-h-${index}`, text })),
    },
    { label: "Google · описание", items: [{ key: "google-desc", text: googleDescription }] },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="label text-mute">Рекламные тексты</h2>
        <Button type="button" size="sm" variant="ink" onClick={saveToLibrary}>
          {saved ? "Сохранено" : "В библиотеку"}
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <div key={section.label} className="flex flex-col gap-2">
            <span className="label text-mute">{section.label}</span>
            {section.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-b-0">
                <p className="min-w-0 flex-1 text-sm text-paper">{item.text}</p>
                <Button type="button" size="sm" variant="ghost" onClick={() => void copy(item.key, item.text)}>
                  {copied === item.key ? "Скопировано" : "Копировать"}
                </Button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}