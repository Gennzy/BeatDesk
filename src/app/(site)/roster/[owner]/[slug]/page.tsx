import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { Avatar } from "@/components/ui/avatar";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Артист",
  robots: { index: true, follow: true },
};

export default async function RosterMemberPage({ params }: { params: Promise<{ owner: string; slug: string }> }) {
  const { owner, slug } = await params;
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  // Читаем участника через публичный доступ (RLS разрешает select всем).
  const client = supabase ?? (await (async () => {
    const { createClient } = await import("@/lib/supabase/server");
    return createClient();
  })());

  const { data: member } = await client
    .from("roster_members")
    .select("id, name, slug, avatar_url, bio, owner_id, profiles!roster_members_owner_id_fkey(username, avatar_url)")
    .eq("slug", slug)
    .maybeSingle();

  // Проверяем, что владелец совпадает с owner в URL.
  const profile = Array.isArray(member?.profiles) ? member?.profiles[0] : member?.profiles;
  if (!member || profile?.username !== owner) notFound();

  return (
    <section className="py-10 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line py-8">
          <Link href={`/beatmakers/${owner}`} className="label text-mute hover:text-paper">← {owner}</Link>
          <div className="flex items-center gap-4">
            <Avatar username={member.name} src={member.avatar_url ?? profile?.avatar_url ?? null} size="lg" />
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-section font-semibold text-paper uppercase">{member.name}</h1>
              {member.bio ? <p className="text-sm text-mute">{member.bio}</p> : null}
            </div>
          </div>
        </div>
        <div className="pt-10">
          <p className="text-sm text-mute">Биты и посты этого артиста появятся здесь в следующих этапах.</p>
        </div>
      </Container>
    </section>
  );
}