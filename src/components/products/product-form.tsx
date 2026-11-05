"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";

export function ProductForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("busy");
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: data.get("kind"),
          title: data.get("title"),
          description: data.get("description"),
          price_minor: Number(data.get("price")) * 100,
          currency: data.get("currency"),
          is_public: data.get("isPublic") === "on",
        }),
      });

      const result = (await response.json()) as { product?: { id: string }; error?: string };
      if (!response.ok || !result.product?.id) {
        setError(result.error ?? "Не удалось создать товар");
        setStatus("idle");
        return;
      }

      router.replace("/cabinet/products");
    } catch {
      setError("Не удалось создать товар");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pt-10">
      <Field label="Тип товара">
        <select name="kind" className="h-12 w-full rounded-control border border-line bg-ink-2 px-3 text-paper">
          <option value="kit">Кит (лупы, драм-кит)</option>
          <option value="preset">Пресет (вокал, инструмент)</option>
          <option value="service">Услуга (сведение, мастеринг)</option>
        </select>
      </Field>

      <Field label="Название">
        <Input name="title" required placeholder="Например: Trap Drum Kit Vol. 1" />
      </Field>

      <Field label="Описание">
        <Textarea name="description" placeholder="Что входит, форматы, условия..." />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Цена">
          <Input name="price" type="number" inputMode="numeric" placeholder="1000" required />
        </Field>
        <Field label="Валюта">
          <select name="currency" className="h-12 w-full rounded-control border border-line bg-ink-2 px-3 text-paper">
            <option value="RUB">RUB (₽)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-3">
        <input type="checkbox" name="isPublic" className="size-4" />
        <span className="text-sm text-paper">Опубликовать в каталоге</span>
      </label>

      {error ? <p className="label text-amber">{error}</p> : null}

      <Button type="submit" disabled={status === "busy"}>
        {status === "busy" ? "Создаём..." : "Создать товар"}
      </Button>
    </form>
  );
}