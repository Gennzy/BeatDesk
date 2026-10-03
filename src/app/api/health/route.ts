import { NextResponse } from "next/server";

import { MASTERS_BUCKET } from "@/lib/beats";
import { getSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

/** Какие переменные окружения настроены. Значения не отдаём, только факт наличия. */
export async function GET() {
  const siteUrl = await getSiteUrl();

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

  // Бакет мастеров создаётся миграцией. Пока его нет, загрузка бита с WAV падает
  // с невнятным «Bucket not found», поэтому проверяем здесь и сразу.
  const mastersBucket = await bucketExists(MASTERS_BUCKET);

  if (!mastersBucket) missing.push("bucket:masters");

  return NextResponse.json({
    ok: missing.length === 0,
    siteUrl,
    env: { ...env, mastersBucket },
    missing,
  });
}

/**
 * listBuckets() доступен только сервисному ключу. Проверяем скачиванием
 * заведомо несуществующего файла: в существующем бакете Supabase отвечает
 * NoSuchKey, а в отсутствующем — NoSuchBucket. Права на запись не нужны.
 */
async function bucketExists(name: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.storage.from(name).download("health-probe");

    if (!error) return true;
    return /bucket/i.test(error.message) === false;
  } catch {
    return false;
  }
}
