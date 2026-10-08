import { getT } from "@/lib/i18n/server";

/**
 * Условия лицензии с конкретными числами.
 *
 * «Лицензия неисключительная» ничего не говорит покупателю, а решение о покупке
 * как раз про лицензию. Поэтому здесь конкретика: срок, файлы, лимит
 * прослушиваний, копий, выступлений и продаж.
 *
 * Числа — не украшение. Это обещание площадки, и оно должно совпадать с тем,
 * что проверяется при выдаче файлов.
 */
/**
 * Условия лицензии.
 *
 * Лимиты одинаковы для всех уровней, а состав файлов зависит от купленного
 * уровня. Раньше здесь выводился состав самого дешёвого, и бит с дорожками
 * выглядел так, будто отдаётся один MP3. Поэтому файлы перечисляются для всех
 * доступных уровней, а точная линия отмечается отдельно.
 */
export async function LicenseTerms({ tiers }: { tiers: { key: string; label: string }[] }) {
  const t = await getT();

  /*
   * Тип лицензии берётся по первому уровню, а не по наличию эксклюзива среди
   * вариантов: кнопка «Купить» покупает именно его, и «Эксклюзив» в строке
   * лицензии был бы обещанием, которого по умолчанию не случится.
   */
  const base = tiers[0]?.key ?? "mp3";
  const exclusiveAvailable = tiers.some((tier) => tier.key === "exclusive");

  const rows: { label: string; value: string }[] = [
    { label: t("license.type"), value: t(base === "exclusive" ? "license.typeExclusive" : "license.typeRegular") },
    { label: t("license.term"), value: t("license.termYears") },
    { label: t("license.files"), value: filesSummary(tiers) },
    { label: t("license.paidStreams"), value: t("license.paidStreamsValue") },
    { label: t("license.copies"), value: t("license.copiesValue") },
    { label: t("license.performances"), value: t("license.performancesValue") },
    { label: t("license.recordTracks"), value: t("license.recordTracksValue") },
    { label: t("license.sellSongs"), value: t("license.sellSongsValue") },
    { label: t("license.radioStations"), value: t("license.radioStationsValue") },
    { label: t("license.musicVideos"), value: t("license.musicVideosValue") },
    {
      label: t("license.exclusiveAvailable"),
      value: exclusiveAvailable ? t("license.yes") : t("license.no"),
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label text-mute">{t("license.title")}</h2>
      <dl className="flex flex-col">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 last:border-b-0">
            <dt className="text-sm text-mute">{row.label}</dt>
            <dd className="text-right text-sm text-paper">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Состав файлов одной строкой.
 *
 * Названия уровней не повторяются: строка «MP3: MP3 · MP3 + WAV: MP3 + WAV»
 * читалась как тавтология. Перечисляются сами наборы, каждый — один раз.
 */
function filesSummary(tiers: { key: string; label: string }[]): string {
  if (tiers.length === 0) return "—";

  const sets = [...new Set(tiers.map((tier) => filesFor(tier.key)))];

  return sets.join(" · ");
}

function filesFor(tier: string): string {
  if (tier === "wav") return "MP3 + WAV";
  if (tier === "trackout") return "MP3 + WAV + дорожки";
  if (tier === "exclusive") return "MP3 + WAV + дорожки + аранжировка";
  return "MP3";
}