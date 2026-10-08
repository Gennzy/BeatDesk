import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();

  return (
    <section className="py-24 lg:py-32">
      <Container>
        <div className="signal-rail max-w-[52ch] pl-8">
          <span className="label text-mute">{t("notfound.code")}</span>
          <h1 className="mt-6 font-display text-section font-black text-paper uppercase">{t("notfound.title")}</h1>
          <p className="mt-5 text-sub text-mute">{t("notfound.sub")}</p>
          <Button href="/" className="mt-10" size="lg">
            {t("notfound.cta")}
            <span aria-hidden>→</span>
          </Button>
        </div>
      </Container>
    </section>
  );
}