import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/posts/follow-button";
import { PostCard } from "@/components/posts/post-card";
import { BeatManager } from "@/components/profile/beat-manager";
import { Container, SectionHead } from "@/components/ui/container";
import { fetchBeatsByOwner } from "@/lib/feed";
import { getLocale, getT } from "@/lib/i18n/server";
import { pluralEn, pluralRu } from "@/lib/plural";
import { fetchProfilePosts, loadFollowState } from "@/lib/posts";
import { getSupabase } from "@/lib/supabase/user";
import { Achievements } from "@/components/sales/achievements";
import { Reviews } from "@/components/sales/reviews";
import { collectBeatmakerStats, computeAchievements } from "@/lib/sales/achievements";

const PLATFORM_KEYS = ["telegram", "youtube", "vk"] as const;

const PLATFORM_LABELS: Record<(typeof PLATFORM_KEYS)[number], string> = {
  telegram: "Telegram",
  youtube: "YouTube",
  vk: "ВК",
};

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const supabase = await getSupabase();

  const { data } = supabase
    ? await supabase.from("profiles").select("username, avatar_url, bio").eq("username", username).maybeSingle()
    : { data: null };

  if (!data) return { title: `@${username}` };

  const description = data.bio ?? `Биты битмейкера @${data.username}: BPM, тональность, теги и цены.`;

  return {
    title: `@${data.username}`,
    description,
    alternates: { canonical: `/beatmakers/${data.username}` },
    openGraph: {
      type: "profile",
      title: `@${data.username} · BeatDesk`,
      description,
      images: data.avatar_url ? [{ url: data.avatar_url }] : undefined,
    },
    twitter: { card: "summary_large_image", title: `@${data.username}`, description },
  };
}

export default async function BeatmakerPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [t, locale, supabase] = await Promise.all([getT(), getLocale(), getSupabase()]);

  if (!supabase) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, bio, links, created_at")
    .eq("username", username)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  // Артисты, с которым работал автор: артист смотрит сюда в первую очередь.
  const { data: collaboratorRows } = await supabase
    .from("profile_collaborators")
    .select("name")
    .eq("profile_id", profile.id)
    .order("position", { ascending: true });

  const collaborators = (collaboratorRows ?? []).map((row) => row.name);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const achievementStats = supabase
    ? await collectBeatmakerStats(supabase, profile.id, profile.created_at)
    : { registeredAt: new Date().toISOString(), beatsOnSale: 0, beatsTotal: 0, plays: 0, ordersPaid: 0, beatsWithStems: 0, postsPublished: 0 };

  const isOwner = user?.id === profile.id;

  /*
   * Достижения — внутренний инструмент битмейкера: показываем их только
   * ему. Покупателю числа продаж знать не нужно, иначе выбор бита
   * превращается в голосование за самого популярного.
   */
  const achievements = isOwner && supabase ? computeAchievements(achievementStats) : [];


  const [beats, follow, posts] = await Promise.all([
    fetchBeatsByOwner(supabase, profile.id, isOwner).catch(() => []),
    loadFollowState(supabase, user?.id ?? null, profile.id).catch(() => ({
      isFollowing: false,
      followerCount: 0,
      followingCount: 0,
    })),
    // Посты профиля показываем только если их больше одного: иначе это
    // единственный бэкфилльный пост того же бита, он уже есть в каталоге.
    fetchProfilePosts(supabase, profile.id, isOwner).catch(() => []),
  ]);
  const links = (profile.links ?? {}) as Record<string, string>;
  const hasLinks = PLATFORM_KEYS.some((key) => Boolean(links[key]));

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="grid gap-10 border-b border-line pb-12 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-8">
          <div className="grid size-24 place-items-center overflow-hidden border border-line bg-ink-2 font-display text-2xl text-mute">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              profile.username.slice(0, 2).toUpperCase()
            )}
          </div>

          <div className="flex flex-col gap-5">
            <span className="label text-mute">{t("profile.title")}</span>
            <h1 className="flex items-baseline gap-2 font-display text-section font-black text-paper uppercase">
              <span className="font-mono text-title text-mute">@</span>
              {profile.username}
            </h1>
            <p className="max-w-[58ch] text-sub text-mute">{profile.bio ?? t("profile.bioPlaceholder")}</p>

            {collaborators.length > 0 ? (
              <div className="flex flex-col gap-3 pt-4">
                <span className="label text-mute">{t("profile.collaboratorsTitle")}</span>
                <ul className="flex flex-wrap gap-2">
                  {collaborators.map((name) => (
                    <li
                      key={name}
                      className="border border-line-2 px-3 py-1 text-sm text-paper"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
              <FollowButton
                profileId={profile.id}
                username={profile.username}
                isFollowing={follow.isFollowing}
                followerCount={follow.followerCount}
                loggedIn={Boolean(user)}
                isOwner={isOwner}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
              <span className="label text-mute">{t("profile.links")}</span>
              {hasLinks
                ? PLATFORM_KEYS.filter((key) => links[key]).map((key) => (
                    <a
                      key={key}
                      href={links[key]}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="label text-paper underline-offset-4 transition-colors hover:text-bright hover:underline"
                    >
                      {PLATFORM_LABELS[key]}
                    </a>
                  ))
                : PLATFORM_KEYS.map((key) => (
                    <span key={key} className="label text-mute">
                      {PLATFORM_LABELS[key]}
                    </span>
                  ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8 pt-12">
          {isOwner && achievements.length > 0 ? <Achievements list={achievements} /> : null}

          {/* Отзывы видны всем: репутация битмейкера на витрине и нужна
              покупателю, в отличие от достижений, которые его личное дело. */}
          {supabase ? <Reviews supabase={supabase} subjectId={profile.id} /> : null}

          <SectionHead
            label={t("profile.beats")}
            hint={beats.length > 0 ? `${beats.length} ${locale === "ru" ? pluralRu(beats.length, "бит", "бита", "битов") : pluralEn(beats.length, "beat", "beats")}` : undefined}
          />

          <BeatManager
            beats={beats}
            isOwner={isOwner}
            redirectTo={`/beatmakers/${profile.username}`}
            emptyTitle={t("profile.empty")}
            emptyDescription={isOwner ? t("profile.emptyOwner") : t("profile.emptyGuest")}
          />

          {posts.length > 0 ? (
            <>
              <SectionHead label={t("profile.posts")} />
              <ul className="flex flex-col gap-4">
                {posts.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </Container>
    </section>
  );
}