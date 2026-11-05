"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";

type Product = {
  id: string;
  kind: "kit" | "preset" | "service";
  title: string;
  description: string;
  price_minor: number;
  currency: string;
  is_public: boolean;
};

export function ProductForm({ product }: { product?: Product }) {
  const { t } = useI18n();
  const router = useRouter();
  const isEdit = Boolean(product);
  const [status, setStatus] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("busy");
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);

    const url = isEdit ? `/api/products/${product!.id}` : "/api/products";
    const method = isEdit ? "PATCH" : "POST";

    const formData = new FormData();
    formData.set("kind", String(data.get("kind") ?? ""));
    formData.set("title", String(data.get("title") ?? ""));
    formData.set("description", String(data.get("description") ?? ""));
    formData.set("price_minor", String(Number(data.get("price")) * 100));
    formData.set("currency", String(data.get("currency") ?? "RUB"));
    formData.set("is_public", data.get("isPublic") === "on" ? "true" : "false");
    const cover = data.get("coverFile");
    if (cover instanceof File && cover.size > 0) formData.set("coverFile", cover);

    try {
      const response = await fetch(url, {
        method,
        body: formData,
      });

      const result = (await response.json()) as { product?: { id: string }; error?: string; ok?: boolean };
      if (!response.ok) {
        setError(result.error ?? "Не удалось сохранить товар");
        setStatus("idle");
        return;
      }

      router.replace("/cabinet/products");
      router.refresh();
    } catch {
      setError("Не удалось сохранить товар");
      setStatus("idle");
    }
  }

  async function handleDelete() {
    if (!product) return;
    if (!confirm("Удалить товар?")) return;
    setStatus("busy");
    try {
      const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setError(result.error ?? "Не удалось удалить");
        setStatus("idle");
        return;
      }
      router.replace("/cabinet/products");
      router.refresh();
    } catch {
      setError("Не удалось удалить");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pt-10">
      <Field label="Тип товара">
        <select name="kind" defaultValue={product?.kind ?? "kit"} className="h-12 w-full rounded-control border border-line bg-ink-2 px-3 text-paper">
          <option value="kit">Кит (лупы, драм-кит)</option>
          <option value="preset">Пресет (вокал, инструмент)</option>
          <option value="service">Услуга (сведение, мастеринг)</option>
        </select>
      </Field>

      <Field label="Название">
        <Input name="title" required placeholder="Например: Trap Drum Kit Vol. 1" defaultValue={product?.title ?? ""} />
      </Field>

      <Field label="Описание">
        <Textarea name="description" placeholder="Что входит, форматы, условия..." defaultValue={product?.description ?? ""} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Цена">
          <Input name="price" type="number" inputMode="numeric" placeholder="1000" required defaultValue={product ? (product.price_minor / 100).toFixed(0) : ""} />
        </Field>
        <Field label="Валюта">
          <select name="currency" defaultValue={product?.currency ?? "RUB"} className="h-12 w-full rounded-control border border-line bg-ink-2 px-3 text-paper">
            <option value="RUB">RUB (₽)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-3">
        <input type="checkbox" name="isPublic" defaultChecked={product?.is_public ?? false} className="size-4" />
        <span className="text-sm text-paper">Опубликовать в каталоге</span>
      </label>

      <Field label="Обложка">
        <Input name="coverFile" type="file" accept="image/jpeg,image/png,image/webp" />
      </Field>

      {error ? <p className="label text-amber">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "busy"}>
          {status === "busy" ? "Сохраняем..." : isEdit ? "Сохранить" : "Создать товар"}
        </Button>
        {isEdit ? (
          <Button type="button" variant="ghost" onClick={() => void handleDelete()} disabled={status === "busy"}>
            Удалить
          </Button>
        ) : null}
      </div>
    </form>
  );
}