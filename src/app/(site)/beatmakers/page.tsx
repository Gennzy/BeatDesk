import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Container } from "@/components/ui/container";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicBeatmakers } from "@/lib/beatmakers";
import { getT } from "@/lib/i18n/server";
import { pluralRu } from "@/lib/plural";

export const metadata = {
  title: "Битмейкеры",
  description: "Продавцы битов на BeatDesk: кто сколько продаёт и кого слушают.",
};

export default async function BeatmakersPage() {
  const supabase = await createClient();
  const t = await getT();
  const beatmakers = await fetchPublicBeatmakers(supabase);

  return (
    <Container className="flex flex-col gap-10 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-hero uppercase leading-none tracking-tight">
          {t("beatmakers.title")}
        </h1>
        <p className="max-w-[60ch] text-sub text-mute">{t("beatmakers.note")}</p>
      </div>

      {beatmakers.length === 0 ? (
        <p className="panel p-8 text-center text-sm text-mute">{t("beatmakers.empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {beatmakers.map((maker) => (
            <li key={maker.id}>
              <Link
                href={`/beatmakers/${maker.username}`}
                className="panel focusable flex h-full flex-col gap-4 p-5 transition-colors hover:border-line-2"
              >
                <div className="flex items-center gap-3">
                  <Avatar src={maker.avatarUrl} username={maker.username} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-paper">
                      {maker.username}
                    </span>
                    {maker.level >= 3 ? (
                      <span className="label text-accent">
                        {t("seller.level", { level: String(maker.level) })}
                      </span>
                    ) : null}
                  </div>
                </div>

                {maker.bio ? (
                  <p className="line-clamp-2 text-sm leading-relaxed text-mute">{maker.bio}</p>
                ) : null}

                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-mute">
                  <span>
                    {maker.beatsOnSale}{" "}
                    {pluralRu(maker.beatsOnSale, "бит", "бита", "битов")}
                  </span>
                  <span>
                    {maker.plays}{" "}
                    {pluralRu(maker.plays, "прослушивание", "прослушивания", "прослушиваний")}
                  </span>
                  <span>
                    {maker.followerCount}{" "}
                    {pluralRu(maker.followerCount, "подписчик", "подписчика", "подписчиков")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}