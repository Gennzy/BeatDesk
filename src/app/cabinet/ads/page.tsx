"use client";

import { useEffect, useState } from "react";

import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

type SavedAd = { title: string; variants: string[]; savedAt: string };

export default function CabinetAdsPage() {
  const [items, setItems] = useState<SavedAd[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("beatdesk:ad-library");
      setItems(raw ? (JSON.parse(raw) as SavedAd[]) : []);
    } catch {
      setItems([]);
    }
  }, []);

  function clear() {
    window.localStorage.removeItem("beatdesk:ad-library");
    setItems([]);
  }

  return (
    <section className="py-10 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line py-8">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-section font-semibold text-paper uppercase">Библиотека рекламы</h1>
            {items.length > 0 ? (
              <Button type="button" size="sm" variant="ghost" onClick={clear}>
                Очистить
              </Button>
            ) : null}
          </div>
          <p className="label text-mute">Сохранённые наборы рекламных текстов для ваших битов.</p>
        </div>

        {items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-mute">Пока пусто. Сохраните тексты со страницы бита.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 pt-10">
            {items.map((item, index) => (
              <div key={index} className="panel flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-paper">{item.title}</h2>
                  <span className="label text-mute">{new Date(item.savedAt).toLocaleDateString("ru-RU")}</span>
                </div>
                <ul className="flex flex-col gap-2">
                  {item.variants.map((variant, vIndex) => (
                    <li key={vIndex} className="text-sm text-mute">{variant}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}