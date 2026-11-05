import type { NextConfig } from "next";

function supabaseHostname(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
const supabaseHost = supabaseHostname();
if (supabaseHost) {
  remotePatterns.push({
    protocol: "https",
    hostname: supabaseHost,
    pathname: "/storage/v1/object/public/**",
  });
}

const nextConfig: NextConfig = {
  /*
   * sharp живёт вне бандла Next.
   *
   * Обложку для Telegram нужно ужать до 200 КБ и 200×200, и без этого пакета
   * она молча не появлялась: без бандлинга нативный модуль не подхватывается
   * и падает на сервере.
   */
  serverExternalPackages: ["sharp"],
  images: {
    remotePatterns,
    // Обложки битов и аватары приходят с разных хостов (Supabase, Google,
    // VK, Telegram). Разрешаем оптимизацию только для известных источников,
    // чтобы не превращать сервер в открытый прокси картинок.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
