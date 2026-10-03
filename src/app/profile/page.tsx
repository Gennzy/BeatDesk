import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BeatManager } from "@/components/profile/beat-manager";
import { ProfileForm } from "@/components/profile/profile-form";
import { Container, SectionHead } from "@/components/ui/container";
import { fetchBeatsByOwner } from "@/lib/feed";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Профиль",
  description: "Ник, аватар, био и ссылки на площадки: BitChain, YouTube, ВК, Telegram, Instagram.",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const t = await getT();
  const supabase = await getSupabase();

  if (!supabase) {
    redirect("/login?next=/profile");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, avatar_url, bio, links")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/");
  }

  const beats = await fetchBeatsByOwner(supabase, user.id, true).catch(() => []);

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-4 border-b border-line pb-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-signal" />
            <span className="label text-mute">{t("profile.edit")}</span>
          </span>
          <h1 className="font-display text-section font-black text-paper uppercase">@{profile.username}</h1>
        </div>

        <div className="grid gap-14 pt-12 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-16">
          <ProfileForm
            userId={user.id}
            profile={{
              username: profile.username,
              avatarUrl: profile.avatar_url,
              bio: profile.bio,
              links: (profile.links ?? {}) as Record<string, string>,
            }}
          />

          <div className="flex flex-col gap-6">
            <SectionHead label={t("profile.beats")} />
            <BeatManager
              beats={beats}
              isOwner
              redirectTo="/profile"
              emptyTitle={t("profile.empty")}
              emptyDescription={t("profile.emptyOwner")}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}