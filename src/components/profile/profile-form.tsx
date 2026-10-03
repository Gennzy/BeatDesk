"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { compressImage } from "@/lib/image";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { SupabaseNotConfiguredError } from "@/lib/supabase/config";

export type ProfileData = {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  links: Record<string, string>;
};

const PLATFORMS = [
  { key: "beatchain", label: "BeatChain" },
  { key: "youtube", label: "YouTube" },
  { key: "vk", label: "ВК" },
  { key: "telegram", label: "Telegram" },
  { key: "instagram", label: "Instagram" },
] as const;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ProfileForm({ userId, profile }: { userId: string; profile: ProfileData }) {
  const { t } = useI18n();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [links, setLinks] = useState<Record<string, string>>(profile.links);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) return;

    const file = await compressImage(picked, 400, [0.9]);

    setAvatarError(null);

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t("profile.avatarHint"));
      return;
    }

    try {
      const supabase = createClient();
      const extension = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/avatar-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("covers")
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("covers").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch (error) {
      setAvatarError(error instanceof SupabaseNotConfiguredError ? t("auth.notConfigured") : String(error));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          username: username.trim(),
          bio: bio.trim() || null,
          links: Object.fromEntries(PLATFORMS.map((platform) => [platform.key, links[platform.key] ?? ""])),
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        })
        .eq("id", userId);

      if (error) {
        setState("error");
        return;
      }

      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center gap-6">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden border border-line bg-ink-2">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={t("profile.avatar")} className="size-full object-cover" />
          ) : (
            <span className="label text-mute">{username.slice(0, 2).toUpperCase() || "?"}</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="label text-paper">{t("profile.avatar")}</span>
          <span className="text-xs text-mute">{t("profile.avatarHint")}</span>
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleAvatar}
            />
            <Button type="button" variant="ink" size="sm" onClick={() => fileRef.current?.click()}>
              {t("profile.avatarUpload")}
            </Button>
            {avatarError ? <span className="label text-amber">{avatarError}</span> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <Field label={t("auth.username")} hint={t("auth.usernameHint")}>
          <Input
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            pattern="[A-Za-z0-9_]{3,24}"
            maxLength={24}
            required
          />
        </Field>

        <Field label={t("profile.bio")} hint={t("profile.bioHint")}>
          <Textarea name="bio" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={300} />
        </Field>
      </div>

      <div className="flex flex-col gap-6">
        <span className="label text-paper">{t("profile.links")}</span>
        <div className="grid gap-6 sm:grid-cols-2">
          {PLATFORMS.map((platform) => (
            <Field key={platform.key} label={platform.label}>
              <Input
                name={platform.key}
                value={links[platform.key] ?? ""}
                onChange={(event) => setLinks((prev) => ({ ...prev, [platform.key]: event.target.value }))}
                placeholder={t("profile.linkPlaceholder")}
                inputMode="url"
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={state === "saving"}>
          {t("profile.save")}
        </Button>
        {state === "saved" ? <span className="label text-signal">{t("profile.saved")}</span> : null}
        {state === "error" ? <span className="label text-amber">{t("profile.saveError")}</span> : null}
        <Link href={`/beatmakers/${profile.username}`} className="label text-mute underline-offset-4 hover:text-paper hover:underline">
          {t("nav.feed")}
        </Link>
      </div>
    </form>
  );
}