-- Первый оператор площадки. Выполнить один раз в Supabase → SQL Editor
-- ПОСЛЕ применения миграций 0043–0048 (иначе колонки is_operator ещё нет).
--
-- Дальше оператор добавляет остальных сам из кабинета (/cabinet/operator).

update public.profiles
set is_operator = true
where lower(username) = 'gennzy';

-- Проверка: должна вернуться одна строка с is_operator = true.
select username, is_operator
from public.profiles
where is_operator = true;
