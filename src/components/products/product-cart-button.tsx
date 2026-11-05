"use client";

import { useState } from "react";

import { useI18n } from "@/lib/i18n/provider";

export function ProductCartButton({ productId, signedIn }: { productId: string; signedIn: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <a href="/login" className="label border border-line px-3 py-2 text-paper transition-colors hover:border-line-2">
        {t("cart.signIn")}
      </a>
    );
  }

  async function add() {
    setState("busy");
    setError(null);
    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Не удалось добавить");
        setState("idle");
        return;
      }
      setState("added");
      window.dispatchEvent(new Event("beatdesk:cart"));
    } catch {
      setError("Не удалось добавить");
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void add()}
        disabled={state === "busy" || state === "added"}
        className="label border border-signal bg-signal px-3 py-2 text-ink transition-colors hover:bg-paper disabled:opacity-60"
      >
        {state === "busy" ? "Добавляем..." : state === "added" ? "В корзине" : "В корзину"}
      </button>
      {error ? <p className="label text-amber">{error}</p> : null}
    </div>
  );
}