begin;
-- Same signature, checks, errors and {items,total,hasMore} output as 202610100001_catalog_discovery.
-- Instead of materializing every matching row in full, it counts matching ids, slices the page
-- along the (position,id) ordering key and builds JSON only for the rows on that page.
-- The statements are assembled from fixed fragments only, so each call is planned with just its
-- active filters: a guest query states status='published' literally, so its count and its page
-- can both use the published_track_order partial index. Every request value is a bound
-- parameter, never SQL text.
create or replace function public.catalog_page(p_query jsonb, p_admin boolean default false) returns jsonb
 language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare
 page_size integer := coalesce((p_query->>'limit')::integer,24);
 review boolean := coalesce(p_admin,false);
 status_filter text := nullif(p_query->>'status','');
 category_filter text := nullif(p_query->>'category','');
 goal_filter text := nullif(p_query->>'goal','');
 genre_filter text := nullif(p_query->>'genre','');
 instrument_filter text := nullif(p_query->>'instrument','');
 tradition_filter text := nullif(p_query->>'tradition','');
 search_pattern text;
 collection_filter uuid;
 after_position integer;
 after_id uuid;
 predicate text := '';
 total bigint;
 ids uuid[];
 items jsonb;
begin
 if page_size not between 1 and 48 or length(coalesce(p_query->>'q','')) > 120 then raise exception 'invalid_catalog_query' using errcode='22023'; end if;
 if p_admin then
  if current_user not in ('authenticated','service_role') then raise exception 'forbidden' using errcode='42501'; end if;
  if not public.is_content_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 end if;
 if nullif(p_query->>'q','') is not null then
  search_pattern := '%' || replace(replace(replace(public.fold_catalog_text(p_query->>'q'),'\','\\'),'%','\%'),'_','\_') || '%';
 end if;
 collection_filter := nullif(p_query->>'collection','')::uuid;
 if nullif(p_query->>'after_id','') is not null then
  after_position := (p_query->>'after_position')::integer;
  after_id := (p_query->>'after_id')::uuid;
 end if;

 if not review then predicate := predicate || ' and t.status = ''published'''; end if;
 if status_filter is not null then predicate := predicate || ' and t.status = $1'; end if;
 if category_filter is not null then predicate := predicate || ' and t.category = $2'; end if;
 if goal_filter is not null then predicate := predicate || ' and t.goals @> array[$3]'; end if;
 if genre_filter is not null then predicate := predicate || ' and t.genres @> array[$4]'; end if;
 if instrument_filter is not null then predicate := predicate || ' and t.instruments @> array[$5]'; end if;
 if tradition_filter is not null then predicate := predicate || ' and t.traditions @> array[$6]'; end if;
 if search_pattern is not null then predicate := predicate || ' and t.search_text like $7 escape ''\'''; end if;
 if collection_filter is not null then
  predicate := predicate || ' and exists(select 1 from public.curated_collection_items i'
   || ' join public.curated_collections c on c.id = i.collection_id where i.track_id = t.id and c.id = $8'
   || case when review then '' else ' and c.published' end || ')';
 end if;

 -- One extra id in the slice tells whether another page exists.
 if search_pattern is null and collection_filter is null then
  -- Broad listings: count over the index, then walk the (position,id) order for one page.
  execute 'select count(*) from public.tracks t where true' || predicate into total
   using status_filter, category_filter, goal_filter, genre_filter, instrument_filter, tradition_filter;
  execute 'select coalesce(array_agg(s.id order by s.position, s.id), ''{}'') from (select t.id, t.position'
   || ' from public.tracks t where true' || predicate
   || case when after_id is null then '' else ' and (t.position, t.id) > ($9, $10)' end
   || ' order by t.position, t.id limit $11) s' into ids
   using status_filter, category_filter, goal_filter, genre_filter, instrument_filter, tradition_filter,
    search_pattern, collection_filter, after_position, after_id, page_size + 1;
 else
  -- Search and collection filters are selective and index-driven: walking the ordering index
  -- would test them row by row, so collect the matching ids once, then count and slice them.
  execute 'with matches as materialized (select t.id, t.position from public.tracks t where true' || predicate
   || ') select (select count(*) from matches), (select coalesce(array_agg(s.id order by s.position, s.id), ''{}'')'
   || ' from (select m.id, m.position from matches m'
   || case when after_id is null then '' else ' where (m.position, m.id) > ($9, $10)' end
   || ' order by m.position, m.id limit $11) s)' into total, ids
   using status_filter, category_filter, goal_filter, genre_filter, instrument_filter, tradition_filter,
    search_pattern, collection_filter, after_position, after_id, page_size + 1;
 end if;
 select jsonb_agg(to_jsonb(t) - 'search_text' order by t.position, t.id) into items
  from public.tracks t where t.id = any(ids[1:page_size]);
 return jsonb_build_object('items', coalesce(items,'[]'::jsonb), 'total', total, 'hasMore', cardinality(ids) > page_size);
end $$;
revoke all on function public.catalog_page(jsonb,boolean) from public, anon, authenticated;
grant execute on function public.catalog_page(jsonb,boolean) to anon, authenticated, service_role;
commit;
