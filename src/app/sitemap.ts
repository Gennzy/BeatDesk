import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";
import { getSupabase } from "@/lib/supabase/user";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [supabase, siteUrl] = await Promise.all([getSupabase(), getSiteUrl()]);
  const base = [
    { url: `${siteUrl}/`, changeFrequency: "hourly" as const, priority: 1 },
    { url: `${siteUrl}/login`, changeFrequency: "yearly" as const, priority: 0.3 },
  ];

  if (!supabase) return base;

  const [beats, profiles] = await Promise.all([
    supabase
      .from("beats")
      .select("id, created_at")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("profiles").select("username, created_at").limit(500),
  ]);

  return [
    ...base,
    ...(beats.data ?? []).map((beat) => ({
      url: `${siteUrl}/beats/${beat.id}`,
      lastModified: new Date(beat.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...(profiles.data ?? []).map((profile) => ({
      url: `${siteUrl}/beatmakers/${profile.username}`,
      lastModified: new Date(profile.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}