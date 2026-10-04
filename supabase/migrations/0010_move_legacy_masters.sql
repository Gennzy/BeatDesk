-- Перенос оставшихся мастеров из публичного бакета в закрытый.
--
-- Путь в бакете — <user_id>/<beat_id>/<kind>-<файл> — и у beats, и у masters
-- одинаковый, отличается только бакет. Поэтому достаточно перенести объекты
-- целиком: колонки в базе не меняются, подписанные ссылки начинают работать
-- сами, потому что assetPaths() отдаёт путь без имени бакета.
--
-- Переносятся только wav/zip/rar и архивы со стемами. Превью mp3 остаётся
-- в публичном бакете: оно должно играться в ленте и отдаваться ссылкой в постах.

do $$
declare
  item record;
  moved integer := 0;
  skipped integer := 0;
begin
  for item in
    select bucket_id, name
    from storage.objects
    where bucket_id = 'beats'
      and (
        name like '%/wav-%'
        or name like '%/zip-%'
        or name like '%/rar-%'
        or name like '%/7z-%'
        or name like '%/stems-%'
        or name like '%/trackout-%'
      )
    order by name
  loop
    begin
      perform storage.move_object(item.bucket_id, item.name, 'masters', item.name, false);
      moved := moved + 1;
    exception when others then
      skipped := skipped + 1;
      raise notice 'не перенесён %: %', item.name, sqlerrm;
    end;
  end loop;

  raise notice 'перенесено: %, пропущено: %', moved, skipped;
end $$;

-- Проверка: строк быть не должно. Если есть — что-то осталось в публичном бакете.
select name from storage.objects
where bucket_id = 'beats'
  and (
    name like '%/wav-%' or name like '%/zip-%' or name like '%/rar-%'
    or name like '%/7z-%' or name like '%/stems-%' or name like '%/trackout-%'
  );