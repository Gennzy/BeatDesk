import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

/**
 * Какие переменные окружения настроены. Значения не отдаём, только факт наличия.
 *
 * Состояние бакетов сюда специально не проверяем: listBuckets() требует сервисного
 * ключа, а подпись и скачивание несуществующего файла отвечают одинаково и для
 * существующего, и для отсутствующего бакета. Отличаются только запросы на запись,
 * а их нельзя делать из проверки. Ошибка «бакета masters нет» приходит из самой
 * загрузки бита через MastersBucketMissingError.
 */
export async function GET() {
  const siteUrl = await getSiteUrl();

  /*
   * Карта секретов — только вошедшим: гостю она рассказывает, какие именно
   * интеграции стоят, а ему достаточно знать, жив ли сайт. Значений здесь
   * как не было, так и нет — только факт наличия.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: true, siteUrl });

  const env = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    tokenSecret: Boolean(process.env.PLATFORM_TOKEN_SECRET),
    telegramToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
  };

  const missing = Object.entries(env)
    .filter(([, present]) => !present)
    .map(([key]) => key);

  return NextResponse.json({
    ok: missing.length === 0,
    siteUrl,
    env,
    missing,
  });
}