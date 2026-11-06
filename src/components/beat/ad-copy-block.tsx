"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Блок рекламных текстов для бита.
 *
 * Генерирует заготовки под Meta (Facebook/Instagram) и Google Search на основе
 * метаданных бита. Человек копирует и правит под себя — это стартовый
 * каркас, а не финальный текст.
 */
export function AdCopyBlock({ title, bpm, musicalKey, tags }: { title: string; bpm: number; musicalKey: string; tags: string[] }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);

  const tagLine = tags.slice(0, 3).map((tag) => `#${tag}`).join(" ");

  const metaHeadline = `${title} Type Beat — ${bpm} BPM ${musicalKey}`;
  const metaPrimary = `${title} type beat. ${bpm} BPM, ${musicalKey}. ${tagLine}. Лицензия и эксклюзив — по ссылке.`;
  const googleHeadline = `${title} Type Beat | ${bpm} BPM`;
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

  const rows: { key: string; label: string; text: string }[] = [
    { key: "meta-headline", label: "Meta · заголовок", text: metaHeadline },
    { key: "meta-primary", label: "Meta · основной текст", text: metaPrimary },
    { key: "google-headline", label: "Google · заголовок", text: googleHeadline },
    { key: "google-description", label: "Google · описание", text: googleDescription },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label text-mute">Рекламные тексты</h2>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-1.5 border-b border-line pb-3 last:border-b-0">
            <div className="flex items-center justify-between">
              <span className="label text-mute">{row.label}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => void copy(row.key, row.text)}>
                {copied === row.key ? "Скопировано" : "Копировать"}
              </Button>
            </div>
            <p className="text-sm text-paper">{row.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}