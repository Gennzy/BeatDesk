import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PostCard } from "@/components/posts/post-card";
import { BeatManager } from "@/components/profile/beat-manager";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ProfileForm } from "@/components/profile/profile-form";
import { Container, SectionHead } from "@/components/ui/container";
import { fetchBeatsByOwner } from "@/lib/feed";
import { fetchProfilePosts, loadFollowState } from "@/lib/posts";
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

  const [profileResult, collaboratorsResult] = await Promise.all([
    supabase.from("profiles").select("username, avatar_url, bio, links").eq("id", user.id).maybeSingle(),
    supabase
      .from("profile_collaborators")
      .select("name")
      .eq("profile_id", user.id)
      .order("position", { ascending: true }),
  ]);

  const profile = profileResult.data;
  const collaborators = (collaboratorsResult.data ?? []).map((row) => row.name);

  if (!profile) {
    redirect("/");
  }

  const [beats, posts, follow] = await Promise.all([
    fetchBeatsByOwner(supabase, user.id, true).catch(() => []),
    // Именно свои посты: общая лента показывала бы чужие и портила счётчик.
    fetchProfilePosts(supabase, user.id, true, 5).catch(() => []),
    loadFollowState(supabase, user.id, user.id).catch(() => ({ followerCount: 0 })),
  ]);

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <span className="flex items-center gap-3">
          <span aria-hidden className="size-1.5 bg-signal" />
          <span className="label text-mute">{t("profile.edit")}</span>
        </span>

        <div className="pt-6">
          <ProfileStats
            username={profile.username}
            avatarUrl={profile.avatar_url}
            bio={profile.bio}
            beats={beats}
            followers={follow.followerCount}
            posts={posts.length}
          />
        </div>

        <div className="flex flex-col gap-12 pt-12">
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

          {posts.length > 0 ? (
            <div className="flex flex-col gap-6">
              <SectionHead label={t("profile.posts")} />
              <ul className="flex flex-col gap-5">
                {posts.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} loggedIn />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-6">
            <SectionHead label={t("profile.edit")} />
            <ProfileForm
              userId={user.id}
              profile={{
                username: profile.username,
                avatarUrl: profile.avatar_url,
                bio: profile.bio,
                links: (profile.links ?? {}) as Record<string, string>,
                collaborators,
              }}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}