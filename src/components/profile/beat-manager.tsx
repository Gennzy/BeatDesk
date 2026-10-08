"use client";

import Link from "next/link";

import { BeatCard } from "@/components/feed/beat-card";
import { DeleteBeatButton } from "@/components/profile/edit-beat-form";
import { VisibilityToggle } from "@/components/profile/visibility-toggle";
import { EmptyState } from "@/components/ui/states";
import type { FeedBeat } from "@/lib/feed";
import { useI18n } from "@/lib/i18n/provider";
import { pluralEn, pluralRu } from "@/lib/plural";

function playsLabel(locale: string, plays: number): string {
  const word =
    locale === "ru"
      ? pluralRu(plays, "прослушивание", "прослушивания", "прослушиваний")
      : pluralEn(plays, "play", "plays");
  return `${plays} ${word}`;
}

export function BeatManager({
  beats,
  isOwner,
  redirectTo,
  emptyTitle,
  emptyDescription,
}: {
  beats: FeedBeat[];
  isOwner: boolean;
  redirectTo: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const { t, locale } = useI18n();

  if (beats.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={isOwner ? { label: t("states.empty.cta"), href: "/cabinet/upload" } : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {isOwner ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-ink-2 px-4 py-3">
          <span className="label text-mute">{t("profile.yours")}</span>
          <Link href="/cabinet/upload" className="label text-signal underline-offset-4 hover:underline">
            + {t("states.empty.cta")}
          </Link>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
        {beats.map((beat) => (
          <div key={beat.id} className="flex flex-col gap-2">
            <BeatCard beat={beat} signedIn={isOwner} />

            {isOwner ? (
              <div className="flex flex-col gap-2">
                <span className="label text-mute">{playsLabel(locale, beat.plays)}</span>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <VisibilityToggle beatId={beat.id} initialPublic={beat.isPublic} />
                  <Link
                    href={`/beats/${beat.id}/edit`}
                    className="label text-mute underline-offset-4 transition-colors hover:text-paper hover:underline"
                  >
                    {t("edit.title")}
                  </Link>
                  <DeleteBeatButton beatId={beat.id} redirectTo={redirectTo} />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}