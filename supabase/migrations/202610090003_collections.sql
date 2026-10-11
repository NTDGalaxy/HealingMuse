begin;
alter table public.curated_collections add column revision integer not null default 0;
create function public.save_collection(p_id uuid,p_revision integer,p_title jsonb,p_goal text,p_published boolean,p_tracks uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare selected_id uuid; current_revision integer;
begin
  if not public.is_content_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_title is null or p_title->>'vi' is null or p_title->>'en' is null
    or length(p_title->>'vi') not between 1 and 160 or length(p_title->>'en') not between 1 and 160
    or p_goal is null or p_goal not in ('relax','rest','focus') or p_published is null
    or p_tracks is null or cardinality(p_tracks)>100 or cardinality(p_tracks)<>(select count(distinct x) from unnest(p_tracks) x)
    then raise exception 'invalid' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_tracks) x where not exists(select 1 from public.tracks t where t.id=x and (not p_published or t.status='published')))
    then raise exception 'invalid_track' using errcode='22023'; end if;
  if p_id is null then
    insert into public.curated_collections(title,goal,published) values(p_title,p_goal,p_published) returning id into selected_id;
  else
    select revision into current_revision from public.curated_collections where id=p_id for update;
    if not found then raise exception 'not_found' using errcode='22023'; end if;
    if p_revision is null or current_revision<>p_revision then raise exception 'conflict' using errcode='40001'; end if;
    selected_id:=p_id;
    update public.curated_collections set title=p_title,goal=p_goal,published=p_published,revision=revision+1 where id=p_id;
  end if;
  delete from public.curated_collection_items where collection_id=selected_id;
  insert into public.curated_collection_items(collection_id,track_id,position) select selected_id,x,ordinality-1 from unnest(p_tracks) with ordinality items(x,ordinality);
  return selected_id;
end;
$$;
revoke all on function public.save_collection(uuid,integer,jsonb,text,boolean,uuid[]) from public;
grant execute on function public.save_collection(uuid,integer,jsonb,text,boolean,uuid[]) to authenticated;
commit;
