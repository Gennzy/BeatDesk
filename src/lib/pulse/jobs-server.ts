import "server-only";

import { canTransition, isJobStatus, type JobStatus } from "./jobs";
import { createClient } from "@/lib/supabase/server";

/**
 * Работа с задачами публикации на стороне сервера.
 *
 * Модуль существует, чтобы маршруты оставались тонкими, а правила — в одном
 * месте. Проверка перехода статуса живёт именно здесь, а не в разметке
 * маршрута: их три, и через месяц про один из них забыли бы все.
 */

/** Строка базы в том виде, в каком её отдаёт PostgREST. */
export type JobRow = {
  id: string;
  user_id: string;
  beat_id: string | null;
  beat_title: string;
  title: string;
  description: string;
  tags: string[];
  privacy: string;
  template: string;
  status: string;
  progress: number;
  error: string | null;
  video_id: string | null;
  watch_url: string | null;
  attempts: number;
  published_at: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Задача в виде, в котором её видит интерфейс и логика статусов. */
export type Job = {
  id: string;
  beatId: string | null;
  beatTitle: string;
  title: string;
  description: string;
  tags: string[];
  privacy: string;
  template: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  videoId: string | null;
  watchUrl: string | null;
  attempts: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toJob(row: JobRow): Job {
  return {
    id: row.id,
    beatId: row.beat_id,
    beatTitle: row.beat_title,
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    privacy: row.privacy,
    template: row.template,
    status: isJobStatus(row.status) ? row.status : "failed",
    progress: Number(row.progress) || 0,
    error: row.error,
    videoId: row.video_id,
    watchUrl: row.watch_url,
    attempts: Number(row.attempts) || 0,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Что человек прислал при создании задачи. */
export type NewJob = {
  beatId: string | null;
  beatTitle: string;
  title: string;
  description: string;
  tags: string[];
  privacy: string;
  template: string;
};

/**
 * Ошибка с кодом: маршрут превращает её в ответ, а не текст.
 *
 * Отдельный класс нужен ради одного случая — неверного перехода статуса. Там
 * «400» и «409» означают разное для человека и разное для повторяющей
 * отправки: 409 нельзя лечить повтором, можно только начать заново.
 */
export class JobError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "JobError";
  }
}

const clamp = (value: number) => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0);

/**
 * Создаёт черновик задачи.
 *
 * Проверки здесь, а не в базе, не избыточность: база проверяет лишь что
 * строка начинается с «draft», а вот пустое название или тег длиннее тридцати
 * символов она пропустит, и ролик уйдёт с ними.
 */
export async function createJob(userId: string, input: NewJob): Promise<Job> {
  const title = input.title.trim();

  if (!title) throw new JobError("Пустое название: YouTube его не примет", 400);

  if (title.length > 100) throw new JobError("Название длиннее 100 символов", 400);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pulse_jobs")
    .insert({
      user_id: userId,
      beat_id: input.beatId,
      beat_title: input.beatTitle.trim() || title,
      title,
      description: input.description.slice(0, 5000),
      tags: input.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean).slice(0, 30),
      privacy: input.privacy,
      template: input.template,
      // Статус не пишется: политика insert требует именно 'draft', и подмена
      // значения молча провалила бы вставку с непонятной ошибкой.
      status: "draft",
    })
    .select()
    .single();

  if (error) throw new JobError(error.message, 500);

  return toJob(data as JobRow);
}

/** Задачи автора, свежие первыми. */
export async function listJobs(userId: string, limit = 50): Promise<Job[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pulse_jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) throw new JobError(error.message, 500);

  return (data as JobRow[]).map(toJob);
}

/** Одна задача. Чужая не найдётся: RLS не показывает её строкой. */
export async function getJob(jobId: string): Promise<Job | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("pulse_jobs").select("*").eq("id", jobId).maybeSingle();

  if (error) throw new JobError(error.message, 500);

  return data ? toJob(data as JobRow) : null;
}

/**
 * Двигает задачу.
 *
 * Переход проверяется до похода в базу, и проверка живёт в jobs.ts рядом с
 * описанием состояний. Если перехода нет — 409, а не 400: это не «плохой
 * запрос», это «так не делается», и повторять его бессмысленно.
 */
export async function advanceJob(
  jobId: string,
  next: JobStatus,
  extra: { progress?: number; error?: string | null; videoId?: string; watchUrl?: string } = {},
): Promise<Job> {
  const job = await getJob(jobId);

  if (!job) throw new JobError("Задача не найдена", 404);

  if (!canTransition(job.status, next)) {
    throw new JobError(`Нельзя перевести задачу из «${job.status}» в «${next}»`, 409);
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("pulse_job_advance", {
    p_job_id: jobId,
    p_status: next,
    p_progress: extra.progress === undefined ? null : clamp(extra.progress),
    p_error: extra.error ?? null,
    p_video_id: extra.videoId ?? null,
    p_watch_url: extra.watchUrl ?? null,
  });

  if (error) throw new JobError(error.message, 500);

  return toJob(data as JobRow);
}

/**
 * Возвращает задачу в черновики, чтобы её можно было повторить.
 *
 * Переход делается через pulse_job_advance, а не присваиванием статуса:
 * счётчик попыток растёт на входе в рендеринг, и если перескочить через
 * draft, история попыток перестанет считать.
 */
export async function retryJob(jobId: string): Promise<Job> {
  const job = await getJob(jobId);

  if (!job) throw new JobError("Задача не найдена", 404);

  if (!canTransition(job.status, "draft")) {
    throw new JobError("Повторять можно только отказавшуюся задачу", 409);
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("pulse_job_advance", {
    p_job_id: jobId,
    p_status: "draft",
    p_progress: null,
    p_error: null,
    p_video_id: null,
    p_watch_url: null,
  });

  if (error) throw new JobError(error.message, 500);

  return toJob(data as JobRow);
}

/** Сводка по статусам и зависшие задачи одним запросом. */
export async function jobOverview(staleMinutes = 15): Promise<{ counts: Record<string, number>; stuck: Job[] }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("pulse_job_overview", { p_stale_minutes: staleMinutes });

  if (error) throw new JobError(error.message, 500);

  const raw = (data ?? {}) as { counts?: Record<string, number>; stuck?: JobRow[] };

  return {
    counts: raw.counts ?? {},
    stuck: (raw.stuck ?? []).map(toJob),
  };
}
