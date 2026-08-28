-- 公司别名(中英文同搜)+ 搜索/认领函数

-- ========== public ==========
set local search_path = public;

alter table companies add column if not exists aliases text[] not null default '{}';

-- 公司搜索:中英文名/别名同搜;排序 精确 > 前缀 > 包含
create or replace function fn_search_companies(p_q text)
returns json language sql stable as $$
  with q as (select trim(p_q) as t),
  hits as (
    select c.id, c.name,
      case
        when lower(c.name) = lower((select t from q))
          or exists (select 1 from unnest(c.aliases) a where lower(a) = lower((select t from q))) then 0
        when c.name ilike (select t from q) || '%'
          or exists (select 1 from unnest(c.aliases) a where a ilike (select t from q) || '%') then 1
        else 2
      end as pri
    from companies c
    where c.name ilike '%' || (select t from q) || '%'
       or exists (select 1 from unnest(c.aliases) a where a ilike '%' || (select t from q) || '%')
  )
  select coalesce(json_agg(json_build_object('id', id, 'name', name) order by pri, name), '[]'::json)
  from (select * from hits order by pri, name limit 12) s
$$;

-- 精确认领(建司/考勤归属用):名字或别名完全一致(忽略大小写)
create or replace function fn_find_company(p_name text)
returns uuid language sql stable as $$
  select c.id from companies c
  where lower(c.name) = lower(trim(p_name))
     or exists (select 1 from unnest(c.aliases) a where lower(a) = lower(trim(p_name)))
  limit 1
$$;

-- ========== demo ==========
set local search_path = demo, public;

alter table companies add column if not exists aliases text[] not null default '{}';

-- 公司搜索:中英文名/别名同搜;排序 精确 > 前缀 > 包含
create or replace function fn_search_companies(p_q text)
returns json language sql stable as $$
  with q as (select trim(p_q) as t),
  hits as (
    select c.id, c.name,
      case
        when lower(c.name) = lower((select t from q))
          or exists (select 1 from unnest(c.aliases) a where lower(a) = lower((select t from q))) then 0
        when c.name ilike (select t from q) || '%'
          or exists (select 1 from unnest(c.aliases) a where a ilike (select t from q) || '%') then 1
        else 2
      end as pri
    from companies c
    where c.name ilike '%' || (select t from q) || '%'
       or exists (select 1 from unnest(c.aliases) a where a ilike '%' || (select t from q) || '%')
  )
  select coalesce(json_agg(json_build_object('id', id, 'name', name) order by pri, name), '[]'::json)
  from (select * from hits order by pri, name limit 12) s
$$;

-- 精确认领(建司/考勤归属用):名字或别名完全一致(忽略大小写)
create or replace function fn_find_company(p_name text)
returns uuid language sql stable as $$
  select c.id from companies c
  where lower(c.name) = lower(trim(p_name))
     or exists (select 1 from unnest(c.aliases) a where lower(a) = lower(trim(p_name)))
  limit 1
$$;
