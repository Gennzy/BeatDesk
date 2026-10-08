"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, SupabaseNotConfiguredError } from "@/lib/supabase/config";

type Mode = "signIn" | "signUp";
type Status = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "checkEmail" };

function translateAuthError(message: string, t: (key: TranslationKey) => string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) return t("auth.errorCredentials");
  if (normalized.includes("already registered")) return t("auth.errorUserExists");
  if (normalized.includes("password should be")) return t("auth.errorPasswordShort");
  if (normalized.includes("email not confirmed")) return t("auth.errorEmailNotConfirmed");
  if (normalized.includes("rate limit") || normalized.includes("too many")) return t("auth.errorRateLimit");
  return `${t("auth.errorGeneric")}: ${message}`;
}

export function AuthForm({ nextPath = "/" }: { nextPath?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const configured = isSupabaseConfigured;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "loading" });

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const username = String(form.get("username") ?? "").trim();

    try {
      const supabase = createClient();

      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setStatus({ kind: "error", message: translateAuthError(error.message, t) });
          return;
        }
        router.replace(nextPath);
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) {
        setStatus({ kind: "error", message: translateAuthError(error.message, t) });
        return;
      }

      if (data.session) {
        router.replace("/profile");
        router.refresh();
        return;
      }

      setStatus({ kind: "checkEmail" });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof SupabaseNotConfiguredError ? t("auth.notConfigured") : String(error),
      });
    }
  }

  async function handleGoogle() {
    setStatus({ kind: "loading" });

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setStatus({ kind: "error", message: translateAuthError(error.message, t) });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof SupabaseNotConfiguredError ? t("auth.notConfigured") : String(error),
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex border border-line">
        {(["signIn", "signUp"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setMode(item);
              setStatus({ kind: "idle" });
            }}
            aria-pressed={mode === item}
            className={
              mode === item
                ? "label h-9 flex-1 bg-signal text-ink"
                : "label h-9 flex-1 text-mute transition-colors hover:text-paper"
            }
          >
            {t(`auth.${item}` as "auth.signIn" | "auth.signUp")}
          </button>
        ))}
      </div>

      {mode === "signUp" ? (
        <Field label={t("auth.username")} hint={t("auth.usernameHint")}>
          <Input name="username" placeholder="nvmble" autoComplete="username" required />
        </Field>
      ) : null}

      <Field label={t("login.email")}>
        <Input type="email" name="email" placeholder="you@studio.ru" autoComplete="email" required />
      </Field>

      <Field label={t("login.password")}>
        <Input
          type="password"
          name="password"
          placeholder="••••••••"
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          minLength={6}
          required
        />
      </Field>

      {status.kind === "error" ? <p className="label leading-relaxed text-amber">{status.message}</p> : null}
      {status.kind === "checkEmail" ? <p className="label leading-relaxed text-paper">{t("auth.checkEmail")}</p> : null}

      <Button type="submit" size="lg" disabled={status.kind === "loading" || !configured}>
        {t(`auth.${mode}` as "auth.signIn" | "auth.signUp")}
      </Button>

      <div className="flex items-center gap-4">
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="label text-mute">{t("login.or")}</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>

      <Button type="button" variant="ink" size="lg" onClick={handleGoogle} disabled={!configured}>
        <svg viewBox="0 0 18 18" aria-hidden className="size-4">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.34A9 9 0 0 0 9 18Z"
          />
          <path fill="#FBBC05" d="M3.95 10.71a5.4 5.4 0 0 1 0-3.42V4.95H.96a9 9 0 0 0 0 8.1l2.99-2.34Z" />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l2.99 2.34C4.66 5.16 6.65 3.58 9 3.58Z"
          />
        </svg>
        {t("login.google")}
      </Button>

      {!configured ? <p className="label leading-relaxed text-amber">{t("auth.notConfigured")}</p> : null}

      <p className="text-sm text-mute">
        {mode === "signIn" ? t("login.noAccount") : t("login.hasAccount")}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setStatus({ kind: "idle" });
          }}
          className="text-paper underline-offset-4 hover:underline"
        >
          {mode === "signIn" ? t("login.toSignup") : t("login.toLogin")}
        </button>
      </p>

      <Link href="/" className="label text-mute underline-offset-4 hover:text-paper hover:underline">
        ← {t("nav.feed")}
      </Link>
    </form>
  );
}