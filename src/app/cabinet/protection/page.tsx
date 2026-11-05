import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

/**
 * Отчёт по защите.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ЗДЕСЬ ВАЖНЕЕ ВСЕГО
 *
 * Не «где-то use», а «вот кто у нас брал». У Wavesmatch такого ответа нет:
 * у них нет списка покупателей. У нас он есть, и в каждой находке, чей
 * отпечаток совпал с чьим-то скачиванием, стоит имя.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ГОВОРИТСЯ ПРО СОВПАДЕНИЕ
 *
 * Совпадение отпечатков означает «очень похоже», а не «это тот самый файл».
 * Отпечаток намеренно грубый: он переживает пережатие, но и похожие биты
 * могут дать высокое совпадение. Поэтому находка — повод для разговора с
 * артистом, и это сказано прямо.
 */
export const metadata = { title: "Защита бита — BeatDesk", robots: { index: false, follow: false } };

export default async function ProtectionPage() {
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) redirect("/login?next=/cabinet/protection");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cabinet/protection");

  const { data: scans } = await supabase
    .from("protection_scans")
    .select(
      "id, beat_id, status, matches, detail, created_at, finished_at, beats!protection_scans_beat_id_fkey(id, title, cover_url)",
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const scanIds = (scans ?? []).map((scan) => scan.id);

  const { data: matches } = await supabase
    .from("protection_matches")
    .select(
      "id, scan_id, platform, title, artist, url, confidence, suspect_label, suspect_user_id, release_date, label, upc, isrc",
    )
    .in("scan_id", scanIds.length > 0 ? scanIds : ["00000000-0000-0000-0000-000000000000"]);

  const byScan = new Map<string, typeof matches>();

  for (const match of matches ?? []) {
    const list = byScan.get(match.scan_id) ?? [];
    list.push(match);
    byScan.set(match.scan_id, list);
  }

  const totalFound = (scans ?? []).reduce((sum, scan) => sum + (scan.matches ?? 0), 0);

  return (
    <section className="py-10 lg:py-14">
      <Container>
        <div className="flex flex-col gap-3 border-b border-line pb-7">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-mute/50" />
            <span className="label text-mute">{t("protection.eyebrow")}</span>
          </span>

          <h1 className="font-display text-section font-semibold text-paper uppercase">{t("protection.heading")}</h1>

          <p className="max-w-[68ch] text-sub text-mute">{t("protection.sub")}</p>
        </div>

        {(scans ?? []).length === 0 ? (
          <p className="py-16 text-sub text-mute">{t("protection.empty")}</p>
        ) : (
          <>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="panel p-5">
                <span className="label text-mute">{t("protection.scans")}</span>
                <p className="mt-2 font-display text-2xl font-semibold text-paper tabular-nums">{(scans ?? []).length}</p>
              </div>

              <div className="panel p-5">
                <span className="label text-mute">{t("protection.found")}</span>
                <p className="mt-2 font-display text-2xl font-semibold text-paper tabular-nums">{totalFound}</p>
              </div>

              <div className="panel p-5">
                <span className="label text-mute">{t("protection.suspects")}</span>
                <p className="mt-2 font-display text-2xl font-semibold text-paper tabular-nums">
                  {(matches ?? []).filter((match) => match.suspect_user_id).length}
                </p>
              </div>
            </div>

            <ul className="mt-8 flex flex-col gap-4">
              {(scans ?? []).map((scan) => {
                const beat = Array.isArray(scan.beats) ? scan.beats[0] : scan.beats;
                const found = byScan.get(scan.id) ?? [];

                return (
                  <li key={scan.id} className="panel p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <span className="font-display text-lg font-semibold uppercase tracking-tight text-paper">
                        {beat?.title ?? t("protection.beat")}
                      </span>

                      <span className="text-xs text-mute tabular-nums">
                        {scan.status === "running" ? t("protection.running") : t("protection.doneAt")}
                      </span>
                    </div>

                    {found.length === 0 ? (
                      <p className="mt-3 text-sm text-mute">{t("protection.nothingFound")}</p>
                    ) : (
                      <ul className="mt-3 flex flex-col gap-2">
                        {found.map((match) => (
                          <li
                            key={match.id}
                            className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-2"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-paper">
                                {match.title ?? t("protection.release")}
                              </span>
                              <span className="text-xs text-mute">
                                {match.artist ?? ""} · {match.platform} · {match.confidence}%
                              </span>
                            </span>

                            {match.suspect_label ? (
                              <span className="chip border-signal/40 text-signal">
                                {t("protection.suspect", { name: match.suspect_label })}
                              </span>
                            ) : null}

                            {match.url ? (
                              <a
                                href={match.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="chip chip-hover"
                              >
                                {t("protection.open")}
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <p className="mt-8 max-w-[72ch] text-xs leading-relaxed text-mute">{t("protection.caveat")}</p>
      </Container>
    </section>
  );
}
