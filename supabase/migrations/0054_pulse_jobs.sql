-- Задачи публикации Pulse: история роликов вместо одноразовой кнопки.
--
-- Применяется после 0053.
--
-- ---------------------------------------------------------------------------
-- ЧТО ТАКОЕ ЗАДАЧА И ПОЧЕМУ ОНА НЕ РАБОТАЕТ НА СЕРВЕРЕ
--
-- Echo делает публикацию сервером: createJob, отрендерил, отдал в YouTube.
-- У нас так не выйдет, и не из-за лени, а из-за устройства загрузки.
--
-- Ролик не проходит через наш сервер: браузер нарезает его на куски и льёт
-- прямо в YouTube. Так сделано сознательно (см. src/lib/pulse/youtube-upload.ts):
-- приём тела запроса у платформы ограничен четырьмя с половиной мегабайтами, а
-- трёхминутный ролик весит больше ста мегабайт. Провести его через Next.js
-- можно было бы только отдельным сервером с диском, и именно на нём всё и
-- сломалось бы: файл в памяти, лимит на размер, таймаут на передачу.
--
-- Поэтому задача здесь — не очередь работы, а запись о том, что человек
-- делает прямо сейчас. Продвигает её браузер: создаёт задачу, ставит
-- «рендерится», «загружается», «опубликовано».
--
-- Отсюда следствие, ради которого таблица и нужна: если вкладку закрыли
-- посередине, статус навсегда останется «рендерится». Никто этого не
-- исправит — некому. Серверный воркер у Echo закрывает вкладку и продолжает
-- сам, у нас такой воркер появится только вместе с серверным рендером.
-- Пока его нет, зависшую задачу должен видеть человек, и историю он читает
-- именно ради этого.
--
-- ---------------------------------------------------------------------------
-- ЧТО ЗАПИСЫВАЕТСЯ, А ЧТО НЕТ
--
-- Снимок метаданных хранится целиком: заголовок, описание, теги, видимость.
-- Он нужен для повтора: retry должен отрендерить ровно то, что уже было
-- опубликовано, иначе «повторить» незаметно поменяет заголовок, если автор
-- успел поправить бит. А regenerate — наоборот, пересобирает метаданные из
-- бита заново, потому что человек хочет новый вариант.
--
-- Адрес сессии загрузки не хранится НИГДЕ, и это не забывчивость. Этот адрес
-- одноразовый и позволяет дослать ролик в уже начатую загрузку; сохранив его
-- в строке, мы сохранили бы ключ, которым можно дописать чужое видео. Он
-- живёт ровно между открытием сессии и последним куском, в базу не попадает.
--
-- Ссылка на просмотр и video_id хранятся: из них потом считается статистика.
-- Пока счётчики YouTube не забираются, они и лежат мёртвым грузом — это
-- осознанно, статистика следующий шаг, и она потребует их куда-то писать.

create table if not exists public.pulse_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  -- Бит, который публикуется. on delete set null, а не cascade: удалённый с
  -- площадки бит не должен уносить с собой историю публикаций, иначе в
  -- статистике выпадут ролики, которые вышли и принесли просмотры.
  beat_id uuid references public.beats on delete set null,
  beat_title text not null,
  -- Снимок того, что ушло в YouTube. См. выше, почему целиком.
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  privacy text not null default 'private'
    check (privacy in ('private', 'unlisted', 'public')),
  template text not null default 'paid'
    check (template in ('paid', 'nonProfit')),
  status text not null default 'draft'
    check (status in ('draft', 'rendering', 'uploading', 'published', 'failed')),
  -- Доля от 0 до 1. Обновляется на переходах, а не каждый кадр: браузер шлёт
  -- запросы редко и только при смене стадии, иначе сотня одинаковых PATCH на
  -- одну задачу.
  progress real not null default 0 check (progress between 0 and 1),
  -- Текст отказа. Хранится, потому что «что-то сломалось» бесполезно, а
  -- текст от YouTube объясняет, съедена квота или запрещён монтаж.
  error text,
  video_id text,
  watch_url text,
  attempts integer not null default 0 check (attempts >= 0),
  published_at timestamptz,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pulse_jobs is
  'История публикаций в YouTube: снимок метаданных, статус и результат. Задачу ведёт браузер, а не сервер, поэтому закрытая вкладка оставляет её в статусе рендеринга.';

comment on column public.pulse_jobs.user_id is
  'Автор. Задача видна только ему.';

comment on column public.pulse_jobs.beat_id is
  'Бит-источник. null, если бит удалён с площадки: история публикаций от удаления бита не зависит.';

comment on column public.pulse_jobs.title is
  'Снимок заголовка на момент публикации. Нужен для повтора: бит мог поменяться, а ролик уже вышел.';

comment on column public.pulse_jobs.error is
  'Причина отказа, если она была. Пустая строка хуже текста: человек не отличит «не знаю» от «ошибки нет».';

create index if not exists pulse_jobs_user_created_idx
  on public.pulse_jobs (user_id, created_at desc);

create index if not exists pulse_jobs_user_status_idx
  on public.pulse_jobs (user_id, status);

-- Частичный индекс по опубликованным: статистика запрашивает именно их, и по
-- каждой задаче фильтр дешевле, чем по подмножеству при нулевом плане.
create index if not exists pulse_jobs_published_idx
  on public.pulse_jobs (user_id, published_at desc)
  where status = 'published';

alter table public.pulse_jobs enable row level security;

-- Задачу видит только автор. Никаких общих задач и команд: ролик уходит в
-- личный канал, и чужая задача ничего не значит.
create policy "author reads own pulse jobs"
  on public.pulse_jobs for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Продвижение статуса — только через одну функцию
--
-- Клиент не пишет в таблицу напрямую: он шлёт PATCH в /api/pulse/jobs/[id],
-- и там проверяется переход. Причина не в аккуратности, а в том, что статус
-- управляет тем, увидит ли человек кнопку повтора, и в том, что из
-- 'published' нельзя вернуться в 'draft' задним числом.
--
-- Прямой доступ на правку и удаление НЕ выдаётся: статусом управляет
-- функция, иначе состояние можно было бы переписать под себя. revoke ниже
-- это фиксирует.
--
-- А вот создание клиенту доступно, и без него история не начинается: некуда
-- писать прогресс. Создать можно только черновик — ровно то, что не даёт
-- подсунуть себе «опубликованный» ролик с выдуманным video_id, который
-- завтра попадёт в статистику. Опубликованной задачей можно стать только
-- через pulse_job_advance, где переход проверяется.
create policy "author creates own draft jobs"
  on public.pulse_jobs for insert
  with check (auth.uid() = user_id and status = 'draft');

revoke update, delete on public.pulse_jobs from anon, authenticated;

-- Счётчик попыток и статус двигает серверный путь публикации.
create or replace function public.pulse_job_advance(
  p_job_id uuid,
  p_status text,
  p_progress real default null,
  p_error text default null,
  p_video_id text default null,
  p_watch_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.pulse_jobs;
begin
  if v_uid is null then
    raise exception 'Нужно войти';
  end if;

  select * into v_job from public.pulse_jobs where id = p_job_id;

  /*
   * Задача читается по RLS, поэтому чужая просто не находится — и это
   * правильный ответ, а не отказ: различать «нет такой» и «не твоя» не нужно,
   * идентификаторы и так не перебираются.
   */
  if v_job.id is null then
    raise exception 'Задача не найдена';
  end if;

  /*
   * Переход проверяется ЗДЕСЬ, а не только в маршруте.
   *
   * Функция объявлена security definer и выдана authenticated, то есть её
   * можно вызвать напрямую, минуя Next.js. Если бы правило перехода жило
   * только в TypeScript, любой желающий обошёл бы его одним запросом: назвал
   * задачу опубликованной, вписал чужой video_id — и статистика later приняла
   * это за правду.
   *
   * Правило здесь, потому что здесь власть: приложение можно выключить,
   * переписать или отлаживать, а база работает всегда.
   *
   * Таблица переходов повторяет TRANSITIONS из src/lib/pulse/jobs.ts. Дубликат
   * неприятен и обязателен: приложение проверяет переход, чтобы дать человеку
   * внятную ошибку и не тратить поход в базу, а база проверяет, чтобы
   * правило нельзя было обойти. Порядок обоих меняется одним коммитом.
   */
  if not (
       (v_job.status = 'draft'     and p_status in ('rendering', 'failed'))
    or (v_job.status = 'rendering' and p_status in ('uploading', 'failed'))
    or (v_job.status = 'uploading' and p_status in ('published', 'failed'))
    or (v_job.status = 'failed'    and p_status = 'draft')
  ) then
    raise exception 'Недопустимый переход: % в %', v_job.status, p_status;
  end if;

  /*
   * Идентификатор ролика и ссылка принимаются только вместе с самим
   * опубликованием, и больше нигде.
   *
   * Иначе можно было бы перевести задачу в uploading, передав video_id от
   * прежней публикации, и она осталась бы опубликованной с чужим роликом.
   */
  if p_status <> 'published' and (p_video_id is not null or p_watch_url is not null) then
    raise exception 'Идентификатор ролика задаётся только при публикации';
  end if;

  update public.pulse_jobs
     set status = p_status,
         progress = coalesce(p_progress, progress),
         error = p_error,
         video_id = coalesce(p_video_id, video_id),
         watch_url = coalesce(p_watch_url, watch_url),
         published_at = case
           when p_status = 'published' then coalesce(published_at, now())
           else published_at
         end,
         started_at = case
           when p_status = 'rendering' and started_at is null then now()
           else started_at
         end,
         attempts = case
           when p_status = 'rendering' then attempts + 1
           else attempts
         end,
         updated_at = now()
   where id = p_job_id
   returning * into v_job;

  return to_jsonb(v_job);
end;
$$;

grant execute on function public.pulse_job_advance(uuid, text, real, text, text, text) to authenticated;
revoke execute on function public.pulse_job_advance(uuid, text, real, text, text, text) from anon;

comment on function public.pulse_job_advance is
  'Переводит задачу в новый статус от имени автора. Идентификатор задачи извне не принимается: функция security definer, и иначе можно было бы двинуть чужую. Счётчик попыток растёт на входе в рендеринг.';

-- ---------------------------------------------------------------------------
-- Зависшие задачи
--
-- Задача в статусе rendering или uploading, к которой давно не обращались,
-- — это закрытая вкладка. Серверный воркер, который её разрулит, появится
-- вместе с серверным рендером; пока его нет, такую задачу нужно отдавать
-- человеку. Функция отдаёт такие задачи вместе с суммами по статусам, чтобы
-- история открывалась одним запросом.
create or replace function public.pulse_job_overview(p_stale_minutes integer default 15)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_counts jsonb;
  v_stuck jsonb;
begin
  if v_uid is null then
    raise exception 'Нужно войти';
  end if;

  select coalesce(
           jsonb_object_agg(status, total),
           '{}'::jsonb
         )
    into v_counts
    from (
      select status, count(*)::bigint as total
        from public.pulse_jobs
       where user_id = v_uid
       group by status
    ) t;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    into v_stuck
    from (
      select id, beat_title, title, status, updated_at, attempts
        from public.pulse_jobs
       where user_id = v_uid
         and status in ('rendering', 'uploading')
         and updated_at < now() - make_interval(mins => greatest(coalesce(p_stale_minutes, 15), 1))
       order by updated_at asc
    ) s;

  return jsonb_build_object('counts', v_counts, 'stuck', v_stuck);
end;
$$;

grant execute on function public.pulse_job_overview(integer) to authenticated;
revoke execute on function public.pulse_job_overview(integer) from anon;

comment on function public.pulse_job_overview is
  'Суммы задач по статусам и список зависших: в рендеринге или загрузке без движения дольше указанного числа минут. Зависшая задача означает закрытую вкладку — её можно повторить.';
