"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Оформление корзины.
 *
 * Позиции уходят одним запросом и одним заказом. Отправлять их по очереди
 * было бы быстрее написать, но хуже: при сбое на третьем бите первые два
 * уже оплачены, а человек видит ошибку и не понимает, что произошло.
 *
 * Корзина чистится только после подтверждения от сервера. Стирать её
 * optimistically значит показать пустую корзину человеку, чей заказ не
 * создался.
 */
/**
 * Позиция для оформления — намеренно уже, чем позиция корзины.
 *
 * Страница перечитывает корзину с сервера и собирает только то, что нужно
 * для отправки: обложка, продавец и зачёркнутая цена нужны в списке, но не
 * нужны здесь. Требовать лишнее — значит заставлять страницу добывать поля,
 * которые никто не прочитает.
 */
export type CheckoutItem = { beatId: string; tierKey: string | null };

export function CheckoutPanel({ items, label }: { items: CheckoutItem[]; label: Record<string, string> }) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("busy");
    setError(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({ beatId: item.beatId, tier: item.tierKey })),
          email,
        }),
      });

      const data = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;

      if (!response.ok || !data?.id) {
        setError(data?.error ?? label.error);
        setStatus("error");
        return;
      }

      /*
       * Корзина очищается после создания заказа, а не раньше: пока
       * сервер не подтвердил, позиции ещё нужны человеку, чтобы он мог
       * повторить попытку.
       */
      await Promise.all(items.map((item) => fetch(`/api/cart/${item.beatId}`, { method: "DELETE" })));

      router.push(`/orders/${data.id}`);
    } catch {
      setError(label.error);
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="label text-paper">{label.email}</span>
        <Input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@studio.ru"
          autoComplete="email"
        />
        <span className="text-xs leading-relaxed text-mute">{label.emailHint}</span>
      </label>

      {error ? <p className="label leading-relaxed text-amber">{error}</p> : null}

      <Button type="submit" size="lg" disabled={status === "busy" || items.length === 0} className="sm:w-fit">
        {status === "busy" ? label.busy : label.submit}
      </Button>

      <p className="text-xs leading-relaxed text-mute">{label.note}</p>
      <span className="sr-only">{t("cart.title")}</span>
    </form>
  );
}