begin;
alter table public.tracks
 add column genres text[] not null default '{}',
 add column instruments text[] not null default '{}',
 add column traditions text[] not null default '{}',
 add column listening_reviewed boolean not null default false;

create function public.fold_catalog_text(value text) returns text
 language sql immutable strict parallel safe set search_path = pg_catalog as $$
 select replace(translate(normalize(lower(value), NFD), U&'\0300\0301\0302\0303\0306\0309\031B\0323', ''), 'đ', 'd')
$$;
revoke all on function public.fold_catalog_text(text) from public, anon, authenticated;
grant execute on function public.fold_catalog_text(text) to anon, authenticated, service_role;
alter table public.tracks add column search_text text generated always as
 (public.fold_catalog_text(coalesce(title->>'vi','') || ' ' || coalesce(title->>'en','') || ' ' || coalesce(description->>'vi','') || ' ' || coalesce(description->>'en','') || ' ' || artist)) stored;
alter table public.tracks add constraint published_listening_review
 check(status <> 'published' or listening_reviewed) not valid;
create extension if not exists pg_trgm;
do $$ declare extension_schema text; begin
 select n.nspname into extension_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
 execute format('create index track_search_text on public.tracks using gin(search_text %I.gin_trgm_ops)', extension_schema);
end $$;
create index track_genres on public.tracks using gin(genres);
create index track_instruments on public.tracks using gin(instruments);
create index track_traditions on public.tracks using gin(traditions);
create index track_review_order on public.tracks(status, position, id);

create function public.catalog_page(p_query jsonb, p_admin boolean default false) returns jsonb
 language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare result jsonb; page_size integer := coalesce((p_query->>'limit')::integer,24);
begin
 if page_size not between 1 and 48 or length(coalesce(p_query->>'q','')) > 120 then raise exception 'invalid_catalog_query' using errcode='22023'; end if;
 if p_admin then
  if current_user not in ('authenticated','service_role') then raise exception 'forbidden' using errcode='42501'; end if;
  if not public.is_content_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 end if;
 with filtered as materialized (
 select t.* from public.tracks t where
 (p_admin or t.status='published')
 and (nullif(p_query->>'status','') is null or t.status=p_query->>'status')
 and (nullif(p_query->>'category','') is null or t.category=p_query->>'category')
 and (nullif(p_query->>'goal','') is null or t.goals @> array[p_query->>'goal'])
 and (nullif(p_query->>'genre','') is null or t.genres @> array[p_query->>'genre'])
 and (nullif(p_query->>'instrument','') is null or t.instruments @> array[p_query->>'instrument'])
 and (nullif(p_query->>'tradition','') is null or t.traditions @> array[p_query->>'tradition'])
 and (nullif(p_query->>'q','') is null or t.search_text like '%' || replace(replace(replace(public.fold_catalog_text(p_query->>'q'),'\','\\'),'%','\%'),'_','\_') || '%' escape '\')
 and (nullif(p_query->>'collection','') is null or exists(select 1 from public.curated_collection_items i join public.curated_collections c on c.id=i.collection_id where i.track_id=t.id and c.id=(p_query->>'collection')::uuid and (p_admin or c.published)))
 ), sliced as (
 select * from filtered where nullif(p_query->>'after_id','') is null or (position,id)>((p_query->>'after_position')::integer,(p_query->>'after_id')::uuid)
 order by position,id limit page_size+1
 ), page as (select * from sliced order by position,id limit page_size)
 select jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(page) - 'search_text' order by position,id) from page),'[]'::jsonb),
 'total',(select count(*) from filtered),'hasMore',(select count(*)>page_size from sliced)) into result;
 return result;
end $$;
revoke all on function public.catalog_page(jsonb,boolean) from public, anon, authenticated;
grant execute on function public.catalog_page(jsonb,boolean) to anon, authenticated, service_role;
commit;
