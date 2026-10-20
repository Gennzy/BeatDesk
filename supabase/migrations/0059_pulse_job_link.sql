-- Прикрепление ролика к биту: серверная функция, а не вставка клиентом.
--
-- Применяется после 0058.
--
-- ---------------------------------------------------------------------------
-- ПОЧЕМУ НЕЛЬЗЯ ПРОСТО ВСТАВИТЬ
--
-- Политика insert из 0054 разрешает клиенту создавать только черновик:
--
--   with check (auth.uid() = user_id and status = 'draft')
--
-- Это сделано намеренно: опубликованной задачей можно стать только через
-- серверный путь, иначе клиент дописал бы себе «published» с чужим
-- video_id и подделал статистику. Обойти это вставкой нельзя, и правильно.
--
-- Но ролик может быть выложен и мимо Pulse: свой канал, другой сервис,
-- руками. Запрещать битмейкеру показать покупателям площадки свой ролик
-- было бы глупо, а бит с готовым роликом выглядел бы так, будто ролика нет.
--
-- Поэтому прикрепление — отдельная серверная функция. Она проверяет, что
-- бит принадлежит тому, кто зовёт, и записывает опубликованный ролик.
--
-- ---------------------------------------------------------------------------
-- ЧТО ПРОВЕРЯЕТСЯ
--
--   1. бит существует;
--   2. он принадлежит вызывающему;
--   3. ролик уже не прикреплён — тогда обновляется существующая запись, а не
--      заводится вторая. Два опубликованных ролика у одного бита — это уже
--      не «ролик бита», а история публикаций, и переключатель в плеере
--      показал бы что попало последним.

create or replace function public.pulse_job_link(
  p_beat_id uuid,
  p_video_id text,
  p_watch_url text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_beat public.beats%rowtype;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Нужно войти';
  end if;

  if p_video_id is null or length(trim(p_video_id)) = 0 then
    raise exception 'Нужен номер ролика';
  end if;

  select * into v_beat from public.beats where id = p_beat_id;

  if v_beat.id is null then
    raise exception 'Бит не найден';
  end if;

  if v_beat.owner_id <> v_uid then
    raise exception 'Это не твой бит';
  end if;

  -- Уже прикреплённый ролик обновляется, а не заводится второй.
  select id into v_job_id
    from public.pulse_jobs
   where beat_id = p_beat_id
     and status = 'published'
   order by published_at desc
   limit 1;

  if v_job_id is not null then
    update public.pulse_jobs
       set video_id = p_video_id,
           watch_url = p_watch_url,
           published_at = now(),
           updated_at = now()
     where id = v_job_id;

    return v_job_id;
  end if;

  insert into public.pulse_jobs (
    user_id, beat_id, beat_title, title, status, progress, video_id, watch_url, published_at
  ) values (
    v_uid, v_beat.id, v_beat.title, v_beat.title, 'published', 1, p_video_id, p_watch_url, now()
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

grant execute on function public.pulse_job_link(uuid, text, text) to authenticated;
revoke execute on function public.pulse_job_link(uuid, text, text) from anon;

comment on function public.pulse_job_link is
  'Прикрепляет опубликованный ролик к биту. Ролик может быть выложен мимо Pulse; без этого бит с готовым роликом выглядел бы так, будто ролика нет. Проверяет, что бит принадлежит вызывающему, и обновляет существующую запись вместо второй.';
