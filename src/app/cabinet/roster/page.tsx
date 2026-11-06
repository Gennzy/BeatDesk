import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

import { RosterManager } from "@/components/roster/roster-manager";

export const metadata: Metadata = {
  title: "Команда",
  robots: { index: false, follow: false },
};

export default async function CabinetRosterPage() {
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) redirect("/login?next=/cabinet/roster");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cabinet/roster");

  const { data: members } = await supabase
    .from("roster_members")
    .select("id, name, slug, avatar_url, bio, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <section className="py-10 lg:py-20">
      <Container>
        <div className="flex flex-col gap-4 border-b border-line py-8">
          <h1 className="font-display text-section font-semibold text-paper uppercase">Команда</h1>
          <p className="label text-mute">Артисты и проекты, которые вы ведёте под своим аккаунтом.</p>
        </div>
        <div className="pt-10">
          <RosterManager initial={members ?? []} />
        </div>
      </Container>
    </section>
  );
}