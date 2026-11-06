"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Блок рекламных текстов для бита.
 *
 * Генерирует несколько вариантов заголовков и основных текстов под Meta
 * (Facebook/Instagram) и Google Search на основе метаданных бита. Человек
 * копирует и правит под себя — это стартовый каркас, а не финальный текст.
 */
export function AdCopyBlock({ title, bpm, musicalKey, tags }: { title: string; bpm: number; musicalKey: string; tags: string[] }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);

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

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
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
      <h2 className="label text-mute">Рекламные тексты</h2>
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