"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";

type Member = { id: string; name: string; slug: string; avatar_url: string | null; bio: string | null };

export function RosterManager({ initial }: { initial: Member[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initial);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/roster", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, bio }),
      });
      const data = (await response.json()) as { member?: Member; error?: string };
      if (!response.ok || !data.member) {
        setError(data.error ?? "Не удалось добавить");
        return;
      }
      setMembers((current) => [...current, data.member as Member]);
      setName("");
      setBio("");
      router.refresh();
    } catch {
      setError("Не удалось добавить");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/roster/${id}`, { method: "DELETE" });
      setMembers((current) => current.filter((m) => m.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={add} className="flex flex-col gap-4">
        <Field label="Имя артиста">
          <Input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Artist Name" />
        </Field>
        <Field label="Био">
          <Textarea name="bio" value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-16" />
        </Field>
        {error ? <p className="label text-amber">{error}</p> : null}
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Добавляем..." : "Добавить артиста"}
        </Button>
      </form>

      {members.length === 0 ? (
        <p className="text-sm text-mute">Пока нет артистов в команде.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.id} className="panel flex items-center justify-between gap-3 p-4">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-paper">{member.name}</span>
                {member.bio ? <span className="text-xs text-mute">{member.bio}</span> : null}
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => void remove(member.id)} disabled={busy}>
                Удалить
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}