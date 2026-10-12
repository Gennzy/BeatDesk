-- Счётчики веток одним вызовом.
--
-- Раньше приложение забирало всю таблицу posts двумя колонками и считало
-- потомков в коде. Это работало, пока постов было меньше тысячи: PostgREST
-- молча режет выдачу настройкой max-rows (по умолчанию 1000), и лимит
-- в запросе её не перекрывает. Как только постов стало больше, новые ветки
-- перестали попадать в выборку, и счётчик показывал 0 при живых ответах.
--
-- Теперь считает база рекурсивным обходом: один вызов, точное число,
-- таблица любого размера. От имени владельца, потому что счётчик видят и
-- те, кому сами посты не положены (гость видит число ответов в ленте? нет —
-- ленту видят только вошедшие; но счётчик не раскрывает содержимое, только
-- число, поэтому ограничение чтения здесь ни к чему).
--
-- CYCLE — защита от порчи данных: если parent_id когда-нибудь замкнётся
-- в кольцо, обход не уйдёт в бесконечность, а просто пропустит кольцо.

create or replace function public.branch_counts(p_ids uuid[])
returns table (root_id uuid, total bigint)
language sql
security definer
set search_path = public
as $$
  with recursive tree(root, id) as (
    select t.id, t.id
    from public.posts t
    where t.id = any (p_ids)
    union
    select tree.root, p.id
    from public.posts p
    join tree on p.parent_id = tree.id
  ) cycle id set is_cycle using path
  select tree.root as root_id, count(*) filter (where tree.id <> tree.root)
  from tree
  group by tree.root;
$$;

comment on function public.branch_counts(uuid[]) is 'Число ответов в ветке целиком для каждого запрошенного корня';
