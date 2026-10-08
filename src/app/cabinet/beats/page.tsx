import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { fetchBeatsByOwner } from "@/lib/feed";
import { getT } from "@/lib/i18n/server";
import { SALE_STATE_LABELS } from "@/lib/sales/state";
import { createClient } from "@/lib/supabase/server";

/**
 * Мои биты: список того, что загружено, с состоянием продажи и быстрыми
 * переходами к правке и публикации.
 *
 * Раньше биты были видны только на публичном профиле — среди постов и
 * подписчиков. В кабинете это рабочий список: с состоянием, ценами и
 * кнопками, а не витрина.
 */
export default async function CabinetBeatsPage() {
  const [t, supabase] = await Promise.all([getT(), createClient()]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cabinet/beats");

  // Третий аргумент — «свои»: снимает фильтр is_public, иначе черновики и
  // снятые с продажи биты в списке просто исчезли бы.
  const beats = await fetchBeatsByOwner(supabase, user.id, true);

  return (
    <section className="py-10 lg:py-14">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line pb-7">
          <Link href="/cabinet" className="label w-fit text-mute transition-colors hover:text-paper">
            ← {t("cabinet.title")}
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-display text-section font-black text-paper uppercase">{t("cabinet.beats")}</h1>
            <Link href="/cabinet/upload" className="control flex h-10 w-fit items-center gap-2 px-4 text-sm">
              <Icon name="upload" className="size-4" />
              {t("cabinet.upload")}
            </Link>
          </div>
        </div>

        {beats.length === 0 ? (
          <div className="flex flex-col items-start gap-4 py-16">
            <p className="text-sub text-mute">{t("cabinet.beatsEmpty")}</p>
            <Link href="/cabinet/upload" className="control flex h-10 w-fit items-center px-4 text-sm">
              {t("cabinet.upload")}
            </Link>
          </div>
        ) : (
          <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            {beats.map((beat) => (
              <li key={beat.id} className="flex flex-col gap-3 bg-ink p-4">
                <div className="flex gap-3">
                  <div className="size-20 shrink-0 overflow-hidden bg-ink-3">
                    {beat.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={beat.coverUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                    ) : null}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`/beats/${beat.id}`} className="truncate text-sm text-paper hover:text-signal">
                      {beat.title}
                    </Link>
                    <span className="label text-mute">
                      {beat.bpm} BPM / {beat.musicalKey}
                    </span>
                    {beat.typeBeatArtists.length > 0 ? (
                      <span className="truncate text-[11px] text-mute">
                        {t("feed.typeOf")} {beat.typeBeatArtists.join(", ")}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/*
                    Состояние продажи берём из sale_state: раньше тут стоял
                    is_public, и проданный эксклюзивом бит выглядел в списке
                    так же, как лежащий на витрине.
                  */}
                  <span className={beat.saleState === "sold_exclusive" ? "label text-signal" : "label text-mute"}>
                    {SALE_STATE_LABELS[beat.saleState]}
                  </span>

                  <span className="ml-auto flex gap-2">
                    <Link href={`/beats/${beat.id}/edit`} className="label text-mute hover:text-paper">
                      {t("cabinet.edit")}
                    </Link>
                    <Link href={`/beats/${beat.id}/publish`} className="label text-mute hover:text-paper">
                      {t("cabinet.publish")}
                    </Link>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}