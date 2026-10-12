"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useI18n } from "@/lib/i18n/provider";

/**
 * Форма заявки на вывод.
 *
 * Клиентский компонент: отправка идёт по нажатию, без полной перезагрузки
 * кабинета. Баланс после успешной заявки меняется сразу — страница
 * перечитывает данные через router.refresh(), потому что уменьшение
 * баланса человек должен увидеть немедленно.
 *
 * Сумма ограничена текущим балансом ещё на клиенте: так кнопка не
 * отправляет заведомо непроходимую заявку и не заставляет человека ждать
 * серверного отказа. Проверка на сервере всё равно остаётся — клиентскую
 * можно обойти, деньги она не защищает.
 */
export function PayoutRequestForm({
  balanceMinor,
  currency = "RUB",
  minimumMinor = 1_000,
}: {
  balanceMinor: number;
  currency?: string;
  minimumMinor?: number;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const rubles = Math.floor(balanceMinor / 100);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const value = Number(amount.replace(",", ".").trim());
    const minor = Math.round(value * 100);

    if (!Number.isFinite(value) || value <= 0) {
      setError(t("payouts.badAmount"));
      return;
    }

    if (minor > balanceMinor) {
      setError(t("payouts.moreThanBalance", { balance: value }));
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? t("payouts.failed"));
        return;
      }

      setDone(true);
      setAmount("");
      router.refresh();
    } catch {
      setError(t("payouts.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (balanceMinor < minimumMinor) {
    return (
      <p className="max-w-[70ch] border-l-2 border-line pl-3 text-sm leading-relaxed text-mute">
        {t("payouts.notEnough")}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-3">
      <label htmlFor="payout-amount" className="text-sm font-semibold text-paper">
        {t("payouts.requestTitle")}
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input
          id="payout-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          min={Math.ceil(minimumMinor / 100)}
          max={rubles}
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={String(rubles)}
          className="control h-12 w-40 text-base sm:text-sm"
          disabled={busy || done}
        />
        <span className="text-sm text-mute">
          {t("payouts.available", { balance: String(rubles), currency })}
        </span>
      </div>

      {error ? <p className="label text-amber">{error}</p> : null}
      {done ? <p className="label text-signal">{t("payouts.requested")}</p> : null}

      <div>
        <button
          type="submit"
          disabled={busy || done}
          className="h-10 bg-signal px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t("payouts.sending") : t("payouts.request")}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-mute">{t("payouts.howTo")}</p>
    </form>
  );
}
