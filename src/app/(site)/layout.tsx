import { evaluateGate } from "@/lib/release";
import { getSessionUser } from "@/lib/supabase/user";
import { ComingSoon } from "@/components/release/coming-soon";

/**
 * Раздел сайта закрыт на время разработки.
 *
 * Заглушка стоит именно здесь, а не в корневом layout: иначе она накрыла бы
 * и страницу входа. Владельца заглушка отличает по адресу, а адрес известен
 * только после входа — получился бы замок, из которого не выйти.
 *
 * Поэтому `/login` и `/auth/callback` живут вне этой группы и остаются
 * доступными всегда: выйти и войти можно сколько угодно раз.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  const gate = evaluateGate({
    gate: process.env.BEATDESK_GATE,
    email: user?.email,
    production: process.env.VERCEL_ENV === "production",
  });

  if (!gate.open) return <ComingSoon />;

  return <>{children}</>;
}
