/**
 * Roster: артисты/проекты битмейкера.
 *
 * Каждый артист — отдельная сущность под одним аккаунтом. Хранится в таблице
 * roster_members, привязан к owner_id.
 */

export type RosterMember = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function validateRosterMember(input: { name?: unknown; bio?: unknown }): { ok: true; value: { name: string; bio: string | null } } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "У артиста должно быть имя" };
  if (name.length > 60) return { ok: false, error: "Имя длиннее 60 символов" };
  const bio = typeof input.bio === "string" ? input.bio.trim() : "";
  if (bio.length > 300) return { ok: false, error: "Био длиннее 300 символов" };
  return { ok: true, value: { name, bio: bio || null } };
}