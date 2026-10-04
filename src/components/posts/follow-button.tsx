"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

type Props = {
  profileId: string;
  username: string;
  isFollowing: boolean;
  followerCount: number;
  loggedIn: boolean;
  isOwner: boolean;
};

export function FollowButton({ profileId, username, isFollowing, followerCount, loggedIn, isOwner }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const loginHref = `/login?next=${encodeURIComponent(`/beatmakers/${username}`)}`;

  const [following, setFollowing] = useState(isFollowing);
  const [followers, setFollowers] = useState(followerCount);
  const [busy, setBusy] = useState(false);

  if (isOwner) {
    return <span className="label text-mute">{t("profile.thisIsYou")}</span>;
  }

  if (!loggedIn) {
    return (
      <a href={loginHref} className={buttonClass({ variant: "ink", size: "sm" })}>
        {t("profile.followLogin")}
      </a>
    );
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);

    const next = !following;
    setFollowing(next);
    setFollowers((value) => Math.max(0, value + (next ? 1 : -1)));

    try {
      const response = await fetch("/api/follows", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followingId: profileId }),
      });
      if (!response.ok) throw new Error("follow failed");
      router.refresh();
    } catch {
      setFollowing(!next);
      setFollowers((value) => Math.max(0, value + (next ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={following}
        className={buttonClass({ variant: following ? "ink" : "signal", size: "sm" })}
      >
        {following ? t("profile.unfollow") : t("profile.follow")}
      </button>
      <span className="label text-mute">
        {followers} {t("profile.followers")}
      </span>
    </div>
  );
}