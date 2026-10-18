import { redirect } from "next/navigation";

import { PulseWizard } from "@/components/pulse/pulse-wizard";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { getSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pulse — публикация на YouTube", robots: { index: false, follow: false } };

/**
 * Pulse — публикация бита на YouTube.
 *
 * Отдельная страница, а не ещё одна кнопка в кабинете. Публикация в видео —
 * это отдельный сценарий с шагами, метаданными и историей, и в списке рядом
 * с «Мои биты» он превращался бы в один из пунктов, которым пользуются раз
 * в месяц.
 *
 * Своя шапка и своя навигация тоже по той же причине: внутри маркетплейса
 * страница должна читаться как инструмент, а не как ещё один раздел
 * витрины.
 */
export default async function PulsePage() {
  const supabase = await createClient();
  const [t, siteUrl] = await Promise.all([getT(), getSiteUrl()]);

  const {
    data: { user },
  } = await supabase?.auth.getUser() ?? { data: { user: null } };

  if (!user || !supabase) redirect("/login");

  /*
   * Порядок распаковки повторяет порядок запросов: раньше здесь стояло
   * наоборот, и первым приходил бит вместо профиля. Типы это не ловили —
   * у обоих `data` свой тип, а null у обоих допустим, — и страница падала
   * уже в рантайме с «ошибкой загрузки» вместо внятного текста.
   */
  const [{ data: beats }, { data: profile }, { data: connection }] = await Promise.all([
    supabase
      .from("beats")
      .select("id, title, bpm, key, genre, tags, type_beat_artists, cover_url, mp3_url")
      .eq("owner_id", user.id)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle(),

    supabase
      .from("platform_connections")
      .select("platform")
      .eq("user_id", user.id)
      .eq("platform", "youtube")
      .maybeSingle(),
  ]);

  return (
    <div className="flex flex-col">
      <Container className="flex items-center justify-between gap-4 border-b border-line py-5">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-title font-semibold tracking-tight">PULSE</span>
          <span className="label text-mute">{t("pulse.tagline")}</span>
        </div>

        <div className="flex items-center gap-2">
          <a href="/pulse/history" className="chip chip-hover">
            {t("pulse.history")}
          </a>
          <a href="/cabinet" className="chip chip-hover">
            {t("pulse.back")}
          </a>
        </div>
      </Container>

      <Container className="py-10">
        <PulseWizard
          connected={Boolean(connection)}
          beats={((beats ?? []) as Array<{
            id: string;
            title: string;
            bpm: number;
            key: string | null;
            genre: string | null;
            tags: string[] | null;
            type_beat_artists: string[] | null;
            cover_url: string | null;
            mp3_url: string | null;
          }>).map((beat) => ({
            id: beat.id,
            title: beat.title,
            bpm: beat.bpm,
            musicalKey: beat.key ?? "",
            genre: beat.genre,
            genreLabel: beat.genre ? t(`genre.${beat.genre}` as "genre.trap") : null,
            tags: beat.tags ?? [],
            artists: beat.type_beat_artists ?? [],
            coverUrl: beat.cover_url,
            audioUrl: beat.mp3_url,
          }))}
          producer={(profile as { username?: string } | null)?.username ?? ""}
          beatUrlBase={siteUrl}
        />
      </Container>
    </div>
  );
}