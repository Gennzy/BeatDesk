import { FollowButton } from "@/components/posts/follow-button";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

type ProfileLinks = {
  instagram?: string;
  telegram?: string;
  vk?: string;
  youtube?: string;
} | null;

/**
 * Карточка продавца на странице бита.
 *
 * Покупатель смотрит не только на бит, но и на того, кто его продаёт: один
 * лайк у блогера с тысячей подписчиков и другой у человека без подписчиков —
 * это разные предложения. Поэтому здесь аватар, подписчики и подписка, а не
 * только ник.
 *
 * Значок проверки выдаётся по правилу в базе: минимум три состоявшиеся
 * продажи и четвёртый уровень. Без продаж он не достаётся никому.
 */
export async function SellerCard({
  username,
  avatarUrl,
  bio,
  bioLinks,
  currentUserId,
  isOwner,
}: {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  bioLinks: ProfileLinks;
  currentUserId: string | null;
  isOwner: boolean;
}) {
  const supabase = await createClient();

  /** Уровень добавлен миграцией 0029, поэтому запрос на него может не пройти. */
  const profileLookup = async () => {
    const full = await supabase.from("profiles").select("id, level").eq("username", username).maybeSingle();
    return full.error
      ? supabase.from("profiles").select("id").eq("username", username).maybeSingle()
      : full;
  };

  const [t, ownerRow] = await Promise.all([
    getT(),
    profileLookup(),
  ]);

  const profileId = (ownerRow.data?.id as string | undefined) ?? "";
  // Уровня нет в базе до миграции 0029: без него значение просто первое.
  const level = ((ownerRow.data as { level?: number } | null)?.level as number | undefined) ?? 1;

  const [{ data: followers }, { data: followState }, { data: verified }] = await Promise.all([
    profileId
      ? supabase.from("follows").select("follower_id").eq("following_id", profileId)
      : Promise.resolve({ data: [] as { follower_id: string }[] }),
    profileId && currentUserId
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("following_id", profileId)
          .eq("follower_id", currentUserId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    profileId ? supabase.rpc("is_verified_seller", { p_user: profileId }) : Promise.resolve({ data: false }),
  ]);

  const followerCount = ((followers ?? []) as { follower_id: string }[]).length;
  const isFollowing = Boolean(followState);
  const isVerified = verified === true;

  return (
    <div className="panel flex flex-col gap-4 p-5">
      <div className="flex items-center gap-4">
        <Avatar username={username} src={avatarUrl} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <LinkRow username={username}>
            {isVerified ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="truncate text-base font-semibold text-paper">@{username}</span>
                <span title={t("seller.verifiedTitle")} className="text-signal">
                  <Icon name="verified" className="size-4" filled />
                </span>
              </span>
            ) : (
              <span className="truncate text-base font-semibold text-paper">@{username}</span>
            )}
          </LinkRow>
          <span className="label text-mute">
            {followerCount} {followerCount === 1 ? t("seller.follower") : t("seller.followers")}
          </span>
        </div>
      </div>

      {bio ? <p className="text-sm leading-relaxed text-mute">{bio}</p> : null}

      <FollowButton
        profileId={profileId}
        username={username}
        isFollowing={isFollowing}
        followerCount={followerCount}
        loggedIn={Boolean(currentUserId)}
        isOwner={isOwner}
      />

      {/*
        Уровень — плашка, а не подпись с чёрточкой: он объясняет, почему бит
        стоит высоко в ленте, и это довод в пользу продавца.
      */}
      {level >= 3 ? (
        <p className="chip text-mute">
          <span aria-hidden className="size-1.5 rounded-full bg-signal" />
          {t("seller.level", { level: String(level) })}
        </p>
      ) : null}

      <SocialLinks links={bioLinks} />
    </div>
  );
}

function LinkRow({ username, children }: { username: string; children: React.ReactNode }) {
  return (
    <a href={`/beatmakers/${username}`} className="min-w-0 transition-colors hover:text-signal">
      {children}
    </a>
  );
}

/**
 * Ссылки продавца. Показываются только заполненные: пустые иконки выглядят
 * как недоработка, а не как отсутствие данных.
 */
function SocialLinks({ links }: { links: ProfileLinks }) {
  if (!links) return null;

  const items: { href: string; label: string }[] = [];

  if (links.instagram) items.push({ href: `https://instagram.com/${links.instagram.replace(/^@/, "")}`, label: "Instagram" });
  if (links.telegram) items.push({ href: `https://t.me/${links.telegram.replace(/^@/, "")}`, label: "Telegram" });
  if (links.vk) items.push({ href: `https://vk.com/${links.vk.replace(/^@/, "")}`, label: "VK" });
  if (links.youtube) items.push({ href: links.youtube.startsWith("http") ? links.youtube : `https://youtube.com/${links.youtube}`, label: "YouTube" });

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3">
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          target="_blank"
          rel="noreferrer noopener"
          className="label text-mute transition-colors hover:text-paper"
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}