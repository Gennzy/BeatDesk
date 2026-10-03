"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { KeyPicker } from "@/components/ui/key-picker";
import { Switch } from "@/components/ui/switch";
import type { FeedBeat } from "@/lib/feed";
import { compressImage } from "@/lib/image";
import { useI18n } from "@/lib/i18n/provider";

type Props = {
  beat: {
    id: string;
    title: string;
    artists: string[];
    bpm: number;
    musicalKey: string;
    tags: string[];
    prices: FeedBeat["prices"];
    isPublic: boolean;
    coverUrl: string | null;
  };
};

export function EditBeatForm({ beat }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [cover, setCover] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage(null);

    const form = new FormData(event.currentTarget);

    const payload = new FormData();
    payload.set("title", String(form.get("title") ?? ""));
    payload.set("typeBeat", String(form.get("typeBeat") ?? ""));
    payload.set("bpm", String(form.get("bpm") ?? ""));
    payload.set("key", String(form.get("key") ?? ""));
    payload.set("tags", String(form.get("tags") ?? ""));
    payload.set("isPublic", form.get("isPublic") === "on" ? "true" : "false");
    payload.set(
      "prices",
      JSON.stringify({
        mp3: form.get("priceMp3"),
        bundle: form.get("priceBundle"),
        exclusive: form.get("priceExclusive"),
      }),
    );

    const tags = String(form.get("tags") ?? "")
      .split(/[\s,]+/)
      .map((tag) => tag.replace(/^#/, "").trim())
      .filter(Boolean);

    payload.delete("tags");
    payload.set("tags", JSON.stringify(tags));

    if (cover) payload.set("coverFile", cover);

    try {
      const response = await fetch(`/api/beats/${beat.id}`, { method: "PATCH", body: payload });
      const data = await response.json();

      if (!response.ok) {
        setState("error");
        setMessage(data.error ?? t("edit.error"));
        return;
      }

      setState("saved");
      setMessage(t("edit.saved"));
      router.refresh();
    } catch {
      setState("error");
      setMessage(t("edit.error"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden border border-line bg-ink-2">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={URL.createObjectURL(cover)} alt="" className="size-full object-cover" />
          ) : beat.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={beat.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="label text-mute">{t("feed.noCover")}</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="label text-paper">{t("upload.cover")}</span>
          <span className="text-xs text-mute">{t("upload.coverHint")}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              setCover(file ? await compressImage(file) : null);
            }}
            className="label h-9 w-full max-w-xs cursor-pointer rounded-xs border border-line bg-ink px-3 py-2 text-mute file:mr-3 file:border-0 file:bg-signal file:px-2 file:py-1 file:text-ink"
          />
        </div>
      </div>

      <div className="grid gap-6">
        <Field label={t("upload.title_field")}>
          <Input name="title" defaultValue={beat.title} required maxLength={80} />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t("upload.typeBeat")} hint={t("upload.typeBeatHint")}>
            <Input name="typeBeat" defaultValue={beat.artists.join(", ")} placeholder="MORGAN, STANLEY" />
          </Field>
          <Field label={t("upload.bpm")}>
            <Input name="bpm" type="number" inputMode="numeric" defaultValue={beat.bpm} className="font-mono" required />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t("upload.key")}>
            <KeyPicker defaultValue={beat.musicalKey} />
          </Field>
          <Field label={t("upload.tags")} hint={t("upload.tagsHint")}>
            <Input name="tags" defaultValue={beat.tags.join(", ")} className="font-mono" />
          </Field>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Field label={t("upload.priceMp3")} optional="₽">
          <Input
            name="priceMp3"
            type="number"
            inputMode="numeric"
            defaultValue={beat.prices.mp3 ?? ""}
            className="font-mono"
          />
        </Field>
        <Field label={t("upload.priceBundle")} optional="₽">
          <Input
            name="priceBundle"
            type="number"
            inputMode="numeric"
            defaultValue={beat.prices.bundle ?? ""}
            className="font-mono"
          />
        </Field>
        <Field label={t("upload.priceExclusive")} optional="₽">
          <Input
            name="priceExclusive"
            type="number"
            inputMode="numeric"
            defaultValue={beat.prices.exclusive ?? ""}
            className="font-mono"
          />
        </Field>
      </div>

      <Switch label={t("upload.publish")} hint={t("upload.publishHint")} name="isPublic" defaultChecked={beat.isPublic} />

      {message ? <p className={state === "error" ? "label text-amber" : "label text-signal"}>{message}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={state === "saving"}>
          {state === "saving" ? t("edit.saving") : t("profile.save")}
        </Button>
        <Button type="button" variant="ink" size="lg" href={`/beats/${beat.id}`}>
          {t("share.title")}
        </Button>
      </div>
    </form>
  );
}

export function DeleteBeatButton({ beatId, redirectTo }: { beatId: string; redirectTo: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="label px-2 py-1.5 text-mute underline-offset-4 transition-colors hover:text-amber hover:underline"
      >
        {t("delete.open")}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const response = await fetch(`/api/beats/${beatId}`, { method: "DELETE" });
          setBusy(false);

          if (response.ok) {
            router.push(redirectTo);
            router.refresh();
            return;
          }

          setConfirming(false);
        }}
        className="label border border-amber/50 px-2 py-1.5 text-amber transition-colors hover:bg-amber hover:text-ink"
      >
        {busy ? t("delete.deleting") : t("delete.confirm")}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="label px-2 py-1.5 text-mute transition-colors hover:text-paper"
      >
        {t("nav.close")}
      </button>
    </div>
  );
}
