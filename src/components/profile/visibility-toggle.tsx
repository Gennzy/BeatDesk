"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";

export function VisibilityToggle({ beatId, initialPublic }: { beatId: string; initialPublic: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !isPublic;
    setIsPublic(next);
    setBusy(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("beats").update({ is_public: next }).eq("id", beatId);
      if (error) setIsPublic(!next);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={isPublic}
      title={t("profile.visibility")}
      className={
        isPublic
          ? "label border border-signal/40 bg-signal/10 px-2 py-1.5 text-signal transition-colors hover:border-signal"
          : "label border border-line px-2 py-1.5 text-mute transition-colors hover:border-line-2 hover:text-paper"
      }
    >
      {isPublic ? t("profile.public") : t("profile.private")}
    </button>
  );
}