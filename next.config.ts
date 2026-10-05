import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * sharp живёт вне бандла Next.
   *
   * Обложку для Telegram нужно ужать до 200 КБ и 200×200, и без этого пакета
   * она молча не появлялась: без бандлинга нативный модуль не подхватывается
   * и падает на сервере.
   */
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
