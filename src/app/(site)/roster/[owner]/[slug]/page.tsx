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

  const { data: beats } = await client
    .from("beats")
    .select("id, title, bpm, key, cover_url")
    .eq("roster_member_id", member.id)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(12);

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
          {(beats ?? []).length === 0 ? (
            <p className="text-sm text-mute">Битов пока нет.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(beats ?? []).map((beat: { id: string; title: string; bpm: number; key: string; cover_url: string | null }) => (
                <li key={beat.id} className="panel flex flex-col gap-2 p-4">
                  <a href={`/beats/${beat.id}`} className="text-sm font-semibold text-paper hover:text-signal">{beat.title}</a>
                  <span className="label text-mute">{beat.bpm} BPM · {beat.key}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </section>
  );
}