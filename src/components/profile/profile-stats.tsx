"use client";

import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import type { FeedBeat } from "@/lib/feed";
import { pluralEn, pluralRu } from "@/lib/plural";

type Props = {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  beats: FeedBeat[];
  followers: number;
  posts: number;
};

/** Сводка по профилю: цифры, ради которых вообще заходят в кабинет. */
export function ProfileStats({ username, avatarUrl, bio, beats, followers, posts }: Props) {
  const { t, locale } = useI18n();

  const totalPlays = beats.reduce((sum, beat) => sum + beat.plays, 0);
  const published = beats.filter((beat) => beat.isPublic).length;

  const stats = [
    { label: t("profile.statBeats"), value: beats.length },
    { label: t("profile.statPublic"), value: published },
    { label: t("profile.statPlays"), value: totalPlays },
    { label: t("profile.statFollowers"), value: followers },
    { label: t("profile.statPosts"), value: posts },
  ];

  const cards = [
    { href: `/beatmakers/${username}`, label: t("profile.openPublic"), hint: t("profile.openPublicHint") },
    { href: "/settings/connections", label: t("profile.connections"), hint: t("profile.connectionsHint") },
    { href: "/notifications", label: t("profile.notifications"), hint: t("profile.notificationsHint") },
  ];

  return (
    <div className="flex flex-col gap-8 border-b border-line pb-10">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar username={username} src={avatarUrl} size="lg" />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="font-display text-title text-paper uppercase">@{username}</h1>
          {bio ? <p className="max-w-[60ch] text-sm text-mute">{bio}</p> : null}
        </div>
      </div>

      <dl className="flex flex-wrap items-center gap-x-8 gap-y-4">
        {stats.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dd className="font-display text-2xl leading-none text-paper">{item.value}</dd>
            <dt className="label text-mute">{item.label}</dt>
          </div>
        ))}
      </dl>

      <nav className="flex flex-wrap gap-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={cn(
              "group flex flex-col gap-0.5 border border-line px-4 py-2.5 transition-colors hover:border-signal/60",
              "min-w-48 flex-1 sm:flex-none",
            )}
          >
            <span className="label text-paper transition-colors group-hover:text-bright">{card.label}</span>
            <span className="text-[11px] text-mute">{card.hint}</span>
          </Link>
        ))}
      </nav>

      <p className="label text-mute">
        {locale === "ru"
          ? `${beats.length} ${pluralRu(beats.length, "бит", "бита", "битов")} в кабинете`
          : `${beats.length} ${pluralEn(beats.length, "beat", "beats")} in the dashboard`}
      </p>
    </div>
  );
}
