import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/posts/follow-button";
import { PostCard } from "@/components/posts/post-card";
import { BeatManager } from "@/components/profile/beat-manager";
import { Container, SectionHead } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
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
    .select("id, username, avatar_url, cover_url, bio, links, created_at, pinned_beat_id")
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
    : { registeredAt: new Date().toISOString(), beatsOnSale: 0, beatsTotal: 0, plays: 0, ordersPaid: 0, beatsWithStems: 0, beatsWithAllTiers: 0, postsPublished: 0, reviews: 0, followers: 0 };

  const isOwner = user?.id === profile.id;

  /*
   * Достижения — внутренний инструмент битмейкера: показываем их только
   * ему. Покупателю числа продаж знать не нужно, иначе выбор бита
   * превращается в голосование за самого популярного.
   */
  const achievements = isOwner && supabase ? computeAchievements(achievementStats) : [];


  /*
   * Проверка и уровень читаются одним запросом: и то и другое отвечает на
   * вопрос покупателя «этому продавцу можно верить», и раньше на витрине
   * профиля этого не было вовсе.
   */
  const [{ data: sellerFlags }, { data: verifiedData }] = supabase
    ? await Promise.all([
        supabase.from("profiles").select("level").eq("id", profile.id).maybeSingle(),
        supabase.rpc("is_verified_seller", { p_user: profile.id }),
      ])
    : [{ data: null }, { data: false }];

  const sellerLevel = ((sellerFlags as { level?: number } | null)?.level as number | undefined) ?? 1;
  const isVerified = verifiedData === true;

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
  /*
   * Закреплённый бит показывается сверху и убирается из общего списка.
   *
   * Убирается, а не просто повторяется: иначе один и тот же бит стоял бы
   * наверху и среди остальных, и человек, выбирающий что купить, видел бы
   * его дважды — как будто это разные вещи.
   *
   * Если закреплённый бит исчез — его удалили или он снят с продажи и
   * стал черновиком, — витрина просто остаётся прежней. Профиль не должен
   * падать из-за чужой настройки продавца.
   */
  const pinned = beats.find((beat) => beat.id === profile.pinned_beat_id) ?? null;
  const rest = pinned ? beats.filter((beat) => beat.id !== pinned.id) : beats;

  const links = (profile.links ?? {}) as Record<string, string>;
  const hasLinks = PLATFORM_KEYS.some((key) => Boolean(links[key]));

  return (
    <section className={profile.cover_url ? "pb-14 lg:pb-20" : "py-14 lg:py-20"}>
      {/*
        Обложка — широкая полоса над шапкой, а не рамка вокруг неё.
        В обрезке она читается как баннер площадки, а в рамке — как
        декорация профиля, и витрина перестаёт быть узнаваемой с первого
        взгляда. Тёмная подложка и лёгкое затемнение нужны, чтобы ник и
        имя поверх картинки оставались читаемыми на любом снимке.
      */}
      {profile.cover_url ? (
        <div className="relative mb-8 aspect-[3/1] w-full overflow-hidden border-b border-line bg-ink-2 lg:mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.cover_url}
            alt=""
            className="size-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-transparent"
          />
        </div>
      ) : null}

      <Container>
        {/*
          Шапка профиля — панель, как везде на площадке. Раньше она лежала на
          фоне с одной чертой снизу, и профиль читался как оглавление, а не как
          страница человека.
        */}
        <div className="panel grid gap-8 p-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-8 lg:p-8">
          <div className="grid size-28 place-items-center overflow-hidden rounded-xl border border-line bg-ink-3 font-display text-3xl text-mute">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              profile.username.slice(0, 2).toUpperCase()
            )}
          </div>

          <div className="flex flex-col gap-5">
            <span className="label text-mute">{t("profile.title")}</span>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="flex items-baseline gap-1 font-display text-section font-semibold text-paper uppercase">
                <span className="font-mono text-title text-mute">@</span>
                {profile.username}
              </h1>

              {isVerified ? (
                <span title={t("seller.verifiedTitle")} className="text-signal">
                  <Icon name="verified" className="size-5" filled />
                </span>
              ) : null}

              {sellerLevel >= 3 ? (
                <span className="chip text-mute">
                  <span aria-hidden className="size-1.5 rounded-full bg-signal" />
                  {t("seller.level", { level: String(sellerLevel) })}
                </span>
              ) : null}
            </div>
            <p className="max-w-[58ch] text-sub text-mute">{profile.bio ?? t("profile.bioPlaceholder")}</p>

            {collaborators.length > 0 ? (
              <div className="flex flex-col gap-3 pt-4">
                <span className="label text-mute">{t("profile.collaboratorsTitle")}</span>
                <ul className="flex flex-wrap gap-2">
                  {collaborators.map((name) => (
                    <li
                      key={name}
                      className="chip px-3 py-1 text-sm text-paper"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-5">
              <FollowButton
                profileId={profile.id}
                username={profile.username}
                isFollowing={follow.isFollowing}
                followerCount={follow.followerCount}
                loggedIn={Boolean(user)}
                isOwner={isOwner}
              />
            </div>

            {/*
              Площадки показываются только заполненные. Раньше при пустых
              выводился весь список названий серым — на каждом новом профиле
              это выглядело как недоделанная страница.
            */}
            {hasLinks ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {PLATFORM_KEYS.filter((key) => links[key]).map((key) => (
                  <a
                    key={key}
                    href={links[key]}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="chip chip-hover"
                  >
                    {PLATFORM_LABELS[key]}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-8 pt-12">
          {isOwner && achievements.length > 0 ? <Achievements list={achievements} /> : null}

          {/*
            Закреплённый бит. Заголовок у него свой: покупатель должен
            понять, что этот бит продавец выбрал сам, а не что он случайно
            оказался первым. Иначе верхняя позиция читается как «новое» и
            ничего не сообщает.
          */}
          {pinned ? (
            <>
              <SectionHead label={t("profile.pinned")} />
              <BeatManager
                beats={[pinned]}
                isOwner={isOwner}
                pinnedId={pinned.id}
                redirectTo={`/beatmakers/${profile.username}`}
              />
            </>
          ) : null}

          {/* Отзывы видны всем: репутация битмейкера на витрине и нужна
              покупателю, в отличие от достижений, которые его личное дело. */}
          {supabase ? <Reviews supabase={supabase} subjectId={profile.id} /> : null}

          <SectionHead
            label={t("profile.beats")}
            hint={rest.length > 0 ? `${rest.length} ${locale === "ru" ? pluralRu(rest.length, "бит", "бита", "битов") : pluralEn(rest.length, "beat", "beats")}` : undefined}
          />

          <BeatManager
            beats={rest}
            isOwner={isOwner}
            pinnedId={pinned?.id ?? null}
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